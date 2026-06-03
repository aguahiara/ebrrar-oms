import { addCalendarDays } from "@/lib/calendar-date";
import { canonicalizeVocab, decomposeMeal } from "@/lib/decompose";
import { matchMeal, type MenuItemAliasForMatch } from "@/lib/matchMeal";
import {
  GENERIC_SWALLOW_VALUE,
  hasNoProteinAnnotation,
  isGenericSwallow,
  isNoLunchEntry,
  parseOrderText,
  stripNoProteinAnnotation,
} from "@/lib/parse-order";
import type { AvonMenuItem, MenuVocabItem } from "@/lib/avon-menu";
import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

const WEEKDAY_OFFSET: Record<DayOfWeek, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
};

export type ResolvedOrder = OrderRecord & {
  menuItemId: string | null;
  matchType: "Direct" | "Alias" | "Fuzzy" | "FruitsOnly" | "NoLunch" | null;
  // Populated only for Fuzzy matches (the similarity score that cleared the threshold).
  matchScore: number | null;
  // Populated only when unmatched: the best fuzzy guess + score, surfaced on the exception.
  bestGuessId: string | null;
  bestScore: number | null;
  // Protein/swallow extracted from the raw order text, null if none found.
  proteinName: string | null;
  swallowName: string | null;
  /**
   * Unrecognised add-ons that were neither protein nor swallow (e.g. side
   * dishes such as "Dodo", "Moi Moi").  Empty for orders parsed without a
   * separator or for FruitsOnly orders.
   */
  sideItems: string[];
  // The normalised meal core (main meal) the matcher compared.
  mealCore: string;
  /**
   * True when protein options exist for this order's day and customer.
   * When true and proteinName is null, persistUpload creates a
   * "Protein not recognised" order_exception alongside the order_line.
   */
  proteinExpected: boolean;
  /**
   * Protein requirement of the matched menu item.
   * "required"     — a protein must be present (default for all meals).
   * "optional"     — protein is captured if present but not required for release.
   * "not_required" — meal never has protein (e.g. Fruits Only).
   * null           — unmatched order; requirement is unknown.
   */
  proteinRequirement: "required" | "optional" | "not_required" | null;
};

export type MatchSummary = {
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  /** Orders auto-accepted as "Fruits Only" (no menu match required). */
  fruitsOnlyCount: number;
  /**
   * Rows that were identified as no-lunch entries ("NO LUNCH REQUIRED", "nil",
   * "N/A", etc.) and silently skipped — no order_line, no exception, not
   * counted in totalOrders (Business Rule §1b).
   */
  noLunchCount: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  /**
   * Orders where a side dish was captured (add-on that was neither protein
   * nor swallow, e.g. "Dodo", "Moi Moi").
   */
  sidesCaptured: number;
  /**
   * Matched orders where no protein was provided but none was required
   * (protein_requirement = "optional" or "not_required").
   */
  acceptedNoProteinCount: number;
  exceptions: {
    employeeName: string;
    dayOfWeek: DayOfWeek;
    rawMealText: string;
    bestScore: number | null;
    /** Omitted for "Meal not on menu". Set to "Protein not recognised" for protein exceptions. */
    exceptionType?: string;
  }[];
};

export const PROTEIN_EXCEPTION_TYPE = "Protein not recognised" as const;

/**
 * Regex patterns (tested against a lowercased, punctuation-stripped form of
 * the meal text) that identify a "Fruits Only" order.  These orders are
 * auto-accepted without requiring a menu match or a protein.
 */
const FRUITS_ONLY_PATTERNS: RegExp[] = [
  /^fruits?\s+only$/,
  /^fruits?\s+only\s+meal$/,
  /^fruits?\s+only\s+order$/,
  /^fruits?$/,
  /^fruit\s+platter$/,
  /^fruit\s+mix$/,
  /^fresh\s+fruits?\s+only$/,
  /^fresh\s+fruits?$/,
];

/**
 * Returns true when the text describes a "Fruits Only" order — one that is
 * accepted automatically without a menu match or protein requirement.
 * Tested against a lowercased, punctuation-stripped (but NOT stopword-filtered)
 * form so that "Fruits Only" and "FRUITS ONLY MEAL" both match.
 */
export function isFruitsOnly(text: string): boolean {
  const norm = text
    .toLowerCase()
    .trim()
    .replace(/[,&+()\-/:'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return FRUITS_ONLY_PATTERNS.some((p) => p.test(norm));
}

export function buildMatchSummary(orders: ResolvedOrder[]): MatchSummary {
  // Separate no-lunch entries from real orders.  No-lunch rows are not counted
  // in totalOrders and never contribute to exceptions (Business Rule §1b).
  const noLunchOrders = orders.filter((o) => o.matchType === "NoLunch");
  const mealOrders    = orders.filter((o) => o.matchType !== "NoLunch");

  // "Meal not on menu" exceptions — truly unmatched orders (matchType === null)
  // FruitsOnly orders are NOT in this list; they are auto-accepted.
  const mealExceptions = mealOrders
    .filter((order) => order.matchType === null)
    .map(({ employeeName, dayOfWeek, rawMealText, bestScore }) => ({
      employeeName,
      dayOfWeek,
      rawMealText,
      bestScore,
    }));

  // "Protein not recognised" exceptions — matched but missing protein.
  const proteinExceptions = mealOrders
    .filter(
      (order) =>
        order.matchType !== null &&
        order.matchType !== "FruitsOnly" &&
        order.proteinExpected &&
        order.proteinName === null &&
        order.proteinRequirement === "required",
    )
    .map(({ employeeName, dayOfWeek, rawMealText }) => ({
      employeeName,
      dayOfWeek,
      rawMealText,
      bestScore: null,
      exceptionType: PROTEIN_EXCEPTION_TYPE,
    }));

  // Orders accepted with no protein because protein is not required.
  const acceptedNoProteinCount = mealOrders.filter(
    (order) =>
      order.matchType !== null &&
      order.matchType !== "FruitsOnly" &&
      order.proteinName === null &&
      order.proteinRequirement !== null &&
      order.proteinRequirement !== "required",
  ).length;

  return {
    totalOrders:     mealOrders.length,
    noLunchCount:    noLunchOrders.length,
    matchedDirect:   mealOrders.filter((o) => o.matchType === "Direct").length,
    matchedAlias:    mealOrders.filter((o) => o.matchType === "Alias").length,
    matchedFuzzy:    mealOrders.filter((o) => o.matchType === "Fuzzy").length,
    fruitsOnlyCount: mealOrders.filter((o) => o.matchType === "FruitsOnly").length,
    proteinsCaptured: mealOrders.filter((o) => o.proteinName !== null).length,
    swallowsCaptured: mealOrders.filter((o) => o.swallowName !== null).length,
    sidesCaptured:   mealOrders.filter((o) => (o.sideItems?.length ?? 0) > 0).length,
    acceptedNoProteinCount,
    exceptions: [...mealExceptions, ...proteinExceptions],
  };
}

export function lineServiceDay(
  weekStart: string,
  dayOfWeek: DayOfWeek,
): string {
  return addCalendarDays(weekStart, WEEKDAY_OFFSET[dayOfWeek]);
}

/**
 * Resolve every parsed order: decompose the raw text into meal core + protein
 * + swallow using the separator-based parser, then run the three-step
 * reconciliation (Direct → Alias → Fuzzy) on the meal core.
 *
 * menuItems/proteins/swallows are filtered to the order's day; matchMeal
 * restricts aliases to that day's items.
 *
 * Business Rules §1-§14 are implemented via parse-order.ts (decomposeMeal)
 * and matchMeal.ts (menu-item main-meal extraction).
 */
export async function resolveOrders(
  orders: OrderRecord[],
  menuItems: AvonMenuItem[],
  aliases: MenuItemAliasForMatch[],
  proteins: MenuVocabItem[],
  swallows: MenuVocabItem[],
): Promise<ResolvedOrder[]> {
  return Promise.all(
    orders.map(async (order) => {
      const dayItems = menuItems.filter(
        (item) => item.day_of_week === order.dayOfWeek,
      );
      const dayProteins = proteins
        .filter((p) => p.day_of_week === order.dayOfWeek)
        .map((p) => p.name);
      const daySwallows = swallows
        .filter((s) => s.day_of_week === order.dayOfWeek)
        .map((s) => s.name);

      // Protein is expected when the customer's menu has protein options for
      // this day. A matched line without a required protein will become an exception.
      const proteinExpected = dayProteins.length > 0;

      // ── Step 0: detect no-lunch entries ("NO LUNCH REQUIRED", "nil", "N/A") ──
      // Must run before any decomposition or matching.  No order_line, no
      // exception, not counted in production (Business Rule §1b).
      if (isNoLunchEntry(order.rawMealText)) {
        if (process.env.NODE_ENV === "development") {
          console.log("[resolveOrders] NoLunch (skipped)", {
            employee: order.employeeName,
            raw: order.rawMealText,
          });
        }
        return {
          ...order,
          menuItemId: null,
          matchType: "NoLunch" as const,
          matchScore: null,
          bestGuessId: null,
          bestScore: null,
          proteinName: null,
          swallowName: null,
          sideItems: [],
          mealCore: order.rawMealText,
          proteinExpected: false,
          proteinRequirement: null,
        };
      }

      // ── Step 0a: detect "Fruits Only" on the raw text (pre-decompose) ──────
      // We check here first because the raw text is unambiguous.
      if (isFruitsOnly(order.rawMealText)) {
        if (process.env.NODE_ENV === "development") {
          console.log("[resolveOrders] FruitsOnly (raw)", {
            employee: order.employeeName,
            raw: order.rawMealText,
          });
        }
        return {
          ...order,
          menuItemId: null,
          matchType: "FruitsOnly" as const,
          matchScore: null,
          bestGuessId: null,
          bestScore: null,
          proteinName: null,
          swallowName: null,
          sideItems: [],
          mealCore: order.rawMealText,
          proteinExpected: false,
          proteinRequirement: "not_required" as const,
        };
      }

      // ── No-protein annotation (Business Rule §10) ────────────────────────
      // Detect "(No Extra Protein)" / "(No Protein)" / "Without Protein" etc.
      // in the raw order text.  When found:
      //   • strip the phrase before decomposing so it does not interfere with
      //     menu matching (the phrase appears as spurious words once parens are
      //     stripped by normalize()).
      //   • mark proteinRequirement = "not_required" on the resolved order so
      //     no protein exception is created and no release blocker fires.
      const orderNoProtein = hasNoProteinAnnotation(order.rawMealText);
      const effectiveMealText = orderNoProtein
        ? stripNoProteinAnnotation(order.rawMealText)
        : order.rawMealText;

      // ── Decompose: separator-based parsing (Business Rules §1-§8) ──────────
      const decomposed = decomposeMeal(
        effectiveMealText,
        dayProteins,
        daySwallows,
      );

      // Explicit protein/swallow columns (Elcrest/Energia) take precedence over
      // values extracted from the meal text (AVON/HGI).
      const proteinName =
        order.proteinRaw !== undefined
          ? canonicalizeVocab(order.proteinRaw, dayProteins)
          : decomposed.proteinName;
      // Explicit-column parsers (ELCREST / Heirs) supply swallowRaw directly.
      // canonicalizeVocab handles specific swallow names ("Eba", "Semo", …).
      // When it returns null the raw value may still be a generic-swallow phrase
      // ("Swallow", "Any Swallow", "Preferred Swallow") — fall back to
      // isGenericSwallow so these are stored as "Not Selected" rather than
      // silently dropped (Business Rule §11).
      const swallowName: string | null =
        order.swallowRaw !== undefined
          ? (() => {
              const vocab = canonicalizeVocab(order.swallowRaw, daySwallows);
              if (vocab !== null) return vocab;
              const rawLower = (order.swallowRaw ?? "").toLowerCase().trim();
              return rawLower && isGenericSwallow(rawLower)
                ? GENERIC_SWALLOW_VALUE
                : null;
            })()
          : decomposed.swallowName;
      const mealRemainder = decomposed.mealRemainder;
      const sideItems     = decomposed.sideItems;

      // ── Step 0b: detect "Fruits Only" on the meal remainder (post-decompose) ─
      // Catches "Fruits Only + Chicken" where decomposeMeal stripped "Chicken".
      if (isFruitsOnly(mealRemainder)) {
        if (process.env.NODE_ENV === "development") {
          console.log("[resolveOrders] FruitsOnly (remainder)", {
            employee: order.employeeName,
            raw: order.rawMealText,
            mealRemainder,
          });
        }
        return {
          ...order,
          menuItemId: null,
          matchType: "FruitsOnly" as const,
          matchScore: null,
          bestGuessId: null,
          bestScore: null,
          proteinName,
          swallowName,
          sideItems,
          mealCore: mealRemainder,
          proteinExpected: false,
          proteinRequirement: "not_required" as const,
        };
      }

      // ── Dev diagnostic: log parsed components ─────────────────────────────
      if (process.env.NODE_ENV === "development") {
        const { mainMeal, addOns } = parseOrderText(effectiveMealText);
        console.log("[resolveOrders] parsed", {
          employee:        order.employeeName,
          raw:             order.rawMealText,
          effectiveText:   orderNoProtein ? effectiveMealText : undefined,
          orderNoProtein:  orderNoProtein || undefined,
          mainMeal,
          addOns,
          mealRemainder,
          proteinName,
          swallowName,
          sideItems,
        });
      }

      // ── Match: Direct → Alias → Fuzzy on meal remainder (main meal) ────────
      const result = await matchMeal(mealRemainder, dayItems, aliases);

      if (result.matchType !== null) {
        const matchedItem = dayItems.find((item) => item.id === result.itemId);

        // ── Protein requirement — order annotation takes priority, then menu
        //    item annotation, then the stored protein_requirement field.
        // "No Extra Protein" / "(No Protein)" in either the order text or the
        // menu item's canonical name means protein is not required (§10).
        const menuItemNoProtein =
          matchedItem !== undefined &&
          hasNoProteinAnnotation(matchedItem.canonical_name);

        const resolvedProteinRequirement: "required" | "optional" | "not_required" =
          orderNoProtein || menuItemNoProtein
            ? "not_required"
            : (matchedItem?.protein_requirement ?? "required");

        if (process.env.NODE_ENV === "development") {
          console.log("[resolveOrders] matched", {
            employee:    order.employeeName,
            mealRemainder,
            matchType:   result.matchType,
            matchedItem: matchedItem?.canonical_name ?? result.itemId,
            resolvedProteinRequirement,
          });
        }

        return {
          ...order,
          menuItemId: result.itemId,
          matchType: result.matchType,
          matchScore: result.matchType === "Fuzzy" ? result.score : null,
          bestGuessId: null,
          bestScore: null,
          proteinName,
          swallowName,
          sideItems,
          mealCore: mealRemainder,
          proteinExpected,
          proteinRequirement: resolvedProteinRequirement,
        };
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[resolveOrders] no match", {
          employee:     order.employeeName,
          mealRemainder,
          bestGuessId:  result.bestGuessId ?? "none",
          bestScore:    Number(result.bestScore.toFixed(3)),
        });
      }

      return {
        ...order,
        menuItemId: null,
        matchType: null,
        matchScore: null,
        bestGuessId: result.bestGuessId,
        bestScore: result.bestScore,
        proteinName,
        swallowName,
        sideItems,
        mealCore: mealRemainder,
        proteinExpected,
        // When the order text carries a no-protein annotation, record it even
        // for unmatched orders so persistUpload does not create a protein
        // exception when the operator resolves the meal-not-on-menu exception.
        proteinRequirement: orderNoProtein ? "not_required" : null,
      };
    }),
  );
}

export async function fetchCustomerId(
  customerDisplayName: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("display_name", customerDisplayName)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to load customer ${customerDisplayName}: ${error?.message ?? "not found"}`,
    );
  }

  return data.id;
}

/**
 * Persist a parsed batch.  Matched orders (Direct/Alias/Fuzzy) become
 * order_line rows; unmatched orders become Open order_exception rows so
 * nothing silently enters the production count.  Employees already counted
 * for the same customer + service day are treated as duplicates and skipped
 * (Keep-first rule).
 */
export async function persistUpload(params: {
  customerDisplayName: string;
  serviceDay: string;
  sourceFilename: string;
  orders: ResolvedOrder[];
}): Promise<{
  batchId: string;
  linesInserted: number;
  exceptionsInserted: number;
  duplicatesSkipped: number;
}> {
  const customerId = await fetchCustomerId(params.customerDisplayName);

  const { data: batch, error: batchError } = await supabase
    .from("order_batch")
    .insert({
      customer_id: customerId,
      service_day: params.serviceDay,
      source_filename: params.sourceFilename,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(
      `Failed to create order batch: ${batchError?.message ?? "unknown error"}`,
    );
  }

  // Duplicate detection: an employee already counted for this customer +
  // service day is a duplicate. Rule: Keep first — skip the new one.
  const serviceDays = Array.from(
    new Set(
      params.orders.map((o) => lineServiceDay(params.serviceDay, o.dayOfWeek)),
    ),
  );

  const dedupKey = (employeeRef: string, serviceDay: string) =>
    `${employeeRef.trim().toLowerCase()}__${serviceDay}`;
  const seen = new Set<string>();

  if (serviceDays.length > 0) {
    const [existingLines, existingExceptions] = await Promise.all([
      supabase
        .from("order_line")
        .select("employee_ref, service_day")
        .eq("customer_id", customerId)
        .in("service_day", serviceDays),
      // Check ALL exception statuses — without this, a re-upload after
      // resolving exceptions would not detect those employees as duplicates.
      supabase
        .from("order_exception")
        .select("employee_ref, service_day")
        .eq("customer_id", customerId)
        .in("service_day", serviceDays),
    ]);

    for (const row of existingLines.data ?? []) {
      seen.add(dedupKey(row.employee_ref, row.service_day));
    }
    for (const row of existingExceptions.data ?? []) {
      seen.add(dedupKey(row.employee_ref, row.service_day));
    }
  }

  const lineRows: Record<string, unknown>[] = [];
  const exceptionRows: Record<string, unknown>[] = [];
  let duplicatesSkipped = 0;

  for (const order of params.orders) {
    // No-lunch entries must be silently dropped — they produce no order_line,
    // no exception, and do not affect the duplicate-detection set.
    if (order.matchType === "NoLunch") continue;

    const serviceDay = lineServiceDay(params.serviceDay, order.dayOfWeek);
    const key = dedupKey(order.employeeName, serviceDay);
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);

    if (order.matchType === "FruitsOnly") {
      // Auto-accepted: insert as a matched order_line with a "(No protein)"
      // sentinel so release Guard 4 is not triggered.  menu_item_id stays null
      // (no canonical menu item exists for this order) and Guard 3 excludes
      // FruitsOnly lines via match_type filter.
      lineRows.push({
        order_batch_id: batch.id,
        customer_id: customerId,
        service_day: serviceDay,
        menu_item_id: null,
        meal_name_raw: order.rawMealText,
        employee_ref: order.employeeName,
        quantity: 1,
        match_type: "FruitsOnly",
        protein_name: "(No protein)",
        swallow_name: order.swallowName,
      });
    } else if (order.matchType !== null) {
      // For meals where protein is not required and no protein was provided,
      // write the "(No protein)" sentinel so Guard 4 is not triggered.
      const proteinValue =
        order.proteinName !== null
          ? order.proteinName
          : order.proteinRequirement !== "required"
            ? "(No protein)"
            : null;

      lineRows.push({
        order_batch_id: batch.id,
        customer_id: customerId,
        service_day: serviceDay,
        menu_item_id: order.menuItemId,
        meal_name_raw: order.rawMealText,
        employee_ref: order.employeeName,
        quantity: 1,
        match_type: order.matchType,
        protein_name: proteinValue,
        swallow_name: order.swallowName,
      });

      // When protein is expected, none was found, AND the meal requires
      // protein — create a "Protein not recognised" exception.
      if (
        order.proteinExpected &&
        order.proteinName === null &&
        order.proteinRequirement === "required"
      ) {
        exceptionRows.push({
          order_batch_id: batch.id,
          customer_id: customerId,
          service_day: serviceDay,
          raw_value: order.rawMealText,
          // For parsers with an explicit protein column, store the raw text so
          // the operator can see what was provided.
          meal_core: order.proteinRaw ?? null,
          employee_ref: order.employeeName,
          exception_type: PROTEIN_EXCEPTION_TYPE,
          suggested_item_id: null,
          suggested_score: null,
          status: "Open",
        });
      }
    } else {
      // Unmatched meal — create a "Meal not on menu" exception.
      exceptionRows.push({
        order_batch_id: batch.id,
        customer_id: customerId,
        service_day: serviceDay,
        raw_value: order.rawMealText,
        // meal_core stores the normalised main meal so the exception resolver
        // can display what was extracted, and so alias saving uses the right key.
        meal_core: order.mealCore,
        employee_ref: order.employeeName,
        exception_type: "Meal not on menu",
        suggested_item_id: order.bestGuessId,
        suggested_score: order.bestScore,
        status: "Open",
      });
    }
  }

  let linesInserted = 0;
  if (lineRows.length > 0) {
    const { data: inserted, error: linesError } = await supabase
      .from("order_line")
      .insert(lineRows)
      .select("id");

    if (linesError) {
      throw new Error(`Failed to insert order lines: ${linesError.message}`);
    }
    linesInserted = inserted?.length ?? 0;
  }

  let exceptionsInserted = 0;
  if (exceptionRows.length > 0) {
    const { data: insertedExceptions, error: exceptionError } = await supabase
      .from("order_exception")
      .insert(exceptionRows)
      .select("id");

    if (exceptionError) {
      throw new Error(
        `Failed to insert order exceptions: ${exceptionError.message}`,
      );
    }
    exceptionsInserted = insertedExceptions?.length ?? 0;
  }

  return { batchId: batch.id, linesInserted, exceptionsInserted, duplicatesSkipped };
}

// ─── Manual Order types ───────────────────────────────────────────────────────

export type ManualOrderSource =
  | "manual_corporate_addon"
  | "manual_corporate_direct"
  | "special_order";

export type ManualOrderLine = {
  /** Matched menu item ID; null for FruitsOnly. */
  menuItemId: string | null;
  /** Display label used as meal_name_raw. */
  mealNameRaw: string;
  /** Always "Direct" for menu-selected items or "FruitsOnly". */
  matchType: "Direct" | "FruitsOnly";
  proteinName: string | null;
  swallowName: string | null;
  sideName: string | null;
  quantity: number;
  notes: string | null;
  orderSource: ManualOrderSource;
};

/**
 * Persist manually entered orders.  Unlike persistUpload(), this function:
 *   • Skips employee-deduplication (no per-employee concept for manual orders).
 *   • Inserts order_source on each line.
 *   • Supports quantity > 1 per line.
 *   • Does NOT create order_exception rows (caller validates before calling).
 *   • Does NOT call resolveOrders() — items are already resolved by the form.
 */
export async function persistManualOrders(params: {
  customerId: string;
  serviceDay: string;
  createdBy: string;
  batchNotes?: string;
  // Special order fields (only for special_order source)
  contactName?: string;
  contactPhone?: string;
  pickupDelivery?: "Pickup" | "Delivery";
  deliveryNotes?: string;
  lines: ManualOrderLine[];
}): Promise<{ batchId: string; linesInserted: number }> {
  const { data: batch, error: batchError } = await supabase
    .from("order_batch")
    .insert({
      customer_id: params.customerId,
      service_day: params.serviceDay,
      source_filename: null,
      channel: "ManualEntry",
      created_by: params.createdBy,
      batch_notes: params.batchNotes ?? null,
      contact_name: params.contactName ?? null,
      contact_phone: params.contactPhone ?? null,
      pickup_delivery: params.pickupDelivery ?? null,
      delivery_notes: params.deliveryNotes ?? null,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(
      `Failed to create manual order batch: ${batchError?.message ?? "unknown error"}`,
    );
  }

  if (params.lines.length === 0) {
    return { batchId: batch.id, linesInserted: 0 };
  }

  const lineRows = params.lines.map((line) => ({
    order_batch_id: batch.id,
    customer_id: params.customerId,
    service_day: params.serviceDay,
    menu_item_id: line.menuItemId,
    meal_name_raw: line.mealNameRaw,
    employee_ref: null,
    quantity: line.quantity,
    match_type: line.matchType,
    protein_name:
      line.matchType === "FruitsOnly" ? "(No protein)" : (line.proteinName ?? null),
    swallow_name: line.swallowName ?? null,
    side_name: line.sideName ?? null,
    line_notes: line.notes ?? null,
    order_source: line.orderSource,
  }));

  const { data: inserted, error: linesError } = await supabase
    .from("order_line")
    .insert(lineRows)
    .select("id");

  if (linesError) {
    // Roll back the batch we just created so we don't leave an orphan.
    await supabase.from("order_batch").delete().eq("id", batch.id);
    throw new Error(`Failed to insert manual order lines: ${linesError.message}`);
  }

  return { batchId: batch.id, linesInserted: inserted?.length ?? 0 };
}

/**
 * Reject (hard-delete) a specific upload batch.
 *
 * Deletes all order_line and order_exception rows that belong to this batch,
 * then deletes the batch record itself.  Throws if an active (non-revoked)
 * dashboard_release exists for the same customer + service day — the release
 * must be revoked first before the underlying data can be discarded.
 */
export async function rejectUploadBatch(batchId: string): Promise<{
  linesDeleted: number;
  exceptionsDeleted: number;
}> {
  // ── 1. Fetch batch metadata ────────────────────────────────────────────────
  const { data: batch, error: batchErr } = await supabase
    .from("order_batch")
    .select("id, customer_id, service_day")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) throw new Error(`Failed to load batch: ${batchErr.message}`);
  if (!batch) throw new Error("Upload batch not found.");

  // ── 2. Guard: block if the batch has already been released ─────────────────
  const { data: activeRelease } = await supabase
    .from("dashboard_release")
    .select("id")
    .eq("customer_id", batch.customer_id)
    .eq("service_day", batch.service_day)
    .is("revoked_at", null)
    .maybeSingle();

  if (activeRelease) {
    throw new Error(
      "This upload has already been released for production. " +
        "Revoke the release first, then reject the upload.",
    );
  }

  // ── 3. Delete order lines belonging to this batch ──────────────────────────
  const { data: deletedLines, error: linesErr } = await supabase
    .from("order_line")
    .delete()
    .eq("order_batch_id", batchId)
    .select("id");

  if (linesErr)
    throw new Error(`Failed to delete order lines: ${linesErr.message}`);

  // ── 4. Delete exceptions belonging to this batch ───────────────────────────
  const { data: deletedExceptions, error: exceptionsErr } = await supabase
    .from("order_exception")
    .delete()
    .eq("order_batch_id", batchId)
    .select("id");

  if (exceptionsErr)
    throw new Error(`Failed to delete exceptions: ${exceptionsErr.message}`);

  // ── 5. Delete the batch record itself ──────────────────────────────────────
  const { error: batchDeleteErr } = await supabase
    .from("order_batch")
    .delete()
    .eq("id", batchId);

  if (batchDeleteErr)
    throw new Error(`Failed to delete batch: ${batchDeleteErr.message}`);

  return {
    linesDeleted: deletedLines?.length ?? 0,
    exceptionsDeleted: deletedExceptions?.length ?? 0,
  };
}
