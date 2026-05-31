import { addCalendarDays } from "@/lib/calendar-date";
import { canonicalizeVocab, decomposeMeal } from "@/lib/decompose";
import { matchMeal, type MenuItemAliasForMatch } from "@/lib/matchMeal";
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
  matchType: "Direct" | "Alias" | "Fuzzy" | null;
  // Populated only for Fuzzy matches (the similarity score that cleared the threshold).
  matchScore: number | null;
  // Populated only when unmatched: the best fuzzy guess + score, surfaced on the exception.
  bestGuessId: string | null;
  bestScore: number | null;
  // Protein/swallow extracted from the raw order text (FRD 4c), null if none found.
  proteinName: string | null;
  swallowName: string | null;
  // The normalised meal core (raw minus protein/swallow) the matcher compared.
  mealCore: string;
};

export type MatchSummary = {
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  exceptions: {
    employeeName: string;
    dayOfWeek: DayOfWeek;
    rawMealText: string;
    bestScore: number | null;
  }[];
};

export function buildMatchSummary(orders: ResolvedOrder[]): MatchSummary {
  const exceptions = orders
    .filter((order) => order.matchType === null)
    .map(({ employeeName, dayOfWeek, rawMealText, bestScore }) => ({
      employeeName,
      dayOfWeek,
      rawMealText,
      bestScore,
    }));

  return {
    totalOrders: orders.length,
    matchedDirect: orders.filter((order) => order.matchType === "Direct").length,
    matchedAlias: orders.filter((order) => order.matchType === "Alias").length,
    matchedFuzzy: orders.filter((order) => order.matchType === "Fuzzy").length,
    proteinsCaptured: orders.filter((order) => order.proteinName !== null).length,
    swallowsCaptured: orders.filter((order) => order.swallowName !== null).length,
    exceptions,
  };
}

export function lineServiceDay(
  weekStart: string,
  dayOfWeek: DayOfWeek,
): string {
  return addCalendarDays(weekStart, WEEKDAY_OFFSET[dayOfWeek]);
}

/**
 * Resolve every parsed order (FRD 4c + 8.4): first decompose the raw text into
 * meal core + protein + swallow, then run the three-step reconciliation
 * (Direct -> Alias -> Fuzzy) on the meal core. menuItems/proteins/swallows are
 * filtered to the order's day; matchMeal restricts aliases to that day's items.
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

      const decomposed = decomposeMeal(
        order.rawMealText,
        dayProteins,
        daySwallows,
      );
      // Explicit protein/swallow columns (Elcrest/Energia) take precedence over
      // values extracted from the meal text (AVON/HGI).
      const proteinName =
        order.proteinRaw !== undefined
          ? canonicalizeVocab(order.proteinRaw, dayProteins)
          : decomposed.proteinName;
      const swallowName =
        order.swallowRaw !== undefined
          ? canonicalizeVocab(order.swallowRaw, daySwallows)
          : decomposed.swallowName;
      const mealRemainder = decomposed.mealRemainder;

      const result = await matchMeal(mealRemainder, dayItems, aliases);

      if (result.matchType !== null) {
        return {
          ...order,
          menuItemId: result.itemId,
          matchType: result.matchType,
          matchScore: result.matchType === "Fuzzy" ? result.score : null,
          bestGuessId: null,
          bestScore: null,
          proteinName,
          swallowName,
          mealCore: mealRemainder,
        };
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
        mealCore: mealRemainder,
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
 * Persist a parsed batch. Matched orders (Direct/Alias/Fuzzy) become order_line rows;
 * unmatched orders become Open order_exception rows so nothing silently enters the
 * production count (FRD 5.9). Employees already counted for the same customer +
 * service day are treated as duplicates and skipped (FR-OV-2, Keep-first rule).
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

  // Duplicate detection (FR-OV-2): an employee already counted for this
  // customer + service day is a duplicate. Rule: Keep first — skip the new one.
  // (Per-customer Keep-first/Keep-last/Reject rules are a future enhancement.)
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
      // Check ALL exception statuses, not just Open.
      // Without this, a re-upload after resolving exceptions (Dropped / AcceptedAsIs)
      // would not detect those employees as duplicates and would re-insert them.
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
    const serviceDay = lineServiceDay(params.serviceDay, order.dayOfWeek);
    const key = dedupKey(order.employeeName, serviceDay);
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);

    if (order.matchType !== null) {
      lineRows.push({
        order_batch_id: batch.id,
        customer_id: customerId,
        service_day: serviceDay,
        menu_item_id: order.menuItemId,
        meal_name_raw: order.rawMealText,
        employee_ref: order.employeeName,
        quantity: 1,
        match_type: order.matchType,
        protein_name: order.proteinName,
        swallow_name: order.swallowName,
      });
    } else {
      exceptionRows.push({
        order_batch_id: batch.id,
        customer_id: customerId,
        service_day: serviceDay,
        raw_value: order.rawMealText,
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

  return {
    batchId: batch.id,
    linesInserted,
    exceptionsInserted,
    duplicatesSkipped,
  };
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
