import {
  formatCalendarDateLabel,
  isCalendarDate,
} from "@/lib/calendar-date";
import {
  checkPortionReadiness,
  type PortionReadiness,
} from "@/lib/portion-readiness";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_SERVICE_DAY = "2026-05-11";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConsolidatedRow = {
  label: string;
  counts: Record<string, number>;
  total: number;
};

/**
 * Operational readiness of one customer for a service day.
 *   ready      — all lines matched, no open exceptions, not yet released
 *   needs_work — open exceptions or unmatched order lines exist
 *   released   — dashboard_release record exists for this customer+day
 */
export type CustomerStatus = "ready" | "needs_work" | "released";

// Re-export so client components can import from a single dashboard module.
export type { PortionReadiness };

export type CustomerDashboardCard = {
  customerId: string;
  customerName: string;
  /**
   * True upload count — matched order_lines (excl. exception-mapped lines)
   * plus ALL exception rows regardless of status.  This is what was actually
   * in the customer's order file for this service day.
   */
  totalUploaded: number;
  /** Matched order_line rows (menu_item_id IS NOT NULL) — production-ready meals */
  matchedOrders: number;
  /** Lines where menu_item_id IS NULL (unmatched / unreconciled — should be 0) */
  unmatchedOrders: number;
  /**
   * Matched lines where protein_name IS NULL AND menu_item.protein_requirement
   * = 'required'.  Lines for optional/non-required protein meals are excluded
   * because they are not a release blocker.
   */
  missingProtein: number;
  /** Open order_exception rows for this customer + service day */
  openExceptionCount: number;
  releasedAt: string | null;
  status: CustomerStatus;
  mealCounts: { meal: string; total: number }[];
  proteinCounts: { protein: string; total: number }[];
  /** Portion profile readiness — "ready" means release is not blocked by profile gaps. */
  portionReadiness: PortionReadiness;
  /**
   * Order lines from bulk file upload (order_source = 'bulk_upload' or NULL).
   * Excludes exception-mapped lines (same accounting as totalUploaded).
   */
  bulkUploadCount: number;
  /**
   * Order lines entered manually (order_source starts with 'manual_' or
   * = 'special_order').
   */
  manualOrderCount: number;
};

/** Customer identity record used for column headers and drill-down links. */
export type CustomerRef = { id: string; name: string };

export type ConsolidatedDashboard = {
  serviceDay: string;
  /** Customers that have ≥1 order line — includes id for drill-down links. */
  customers: CustomerRef[];
  mealRows: ConsolidatedRow[];
  proteinRows: ConsolidatedRow[];
  grandTotal: number;
  cards: CustomerDashboardCard[];
  /**
   * True when order_exception rows exist for this service day but no
   * order_line rows.  This means orders were uploaded but are still
   * awaiting exception resolution — none have been mapped into order lines
   * yet so the dashboard is empty.  Use this flag to show an actionable
   * empty state instead of the generic "nothing uploaded" message.
   */
  unresolvedExceptionsOnly: boolean;
};

// ─── Pivot helper ─────────────────────────────────────────────────────────────

function pivot<T extends { customerName: string }>(
  perCustomer: T[],
  pick: (d: T) => { label: string; total: number }[],
): ConsolidatedRow[] {
  const labels = new Set<string>();
  for (const d of perCustomer) {
    for (const r of pick(d)) labels.add(r.label);
  }

  return [...labels]
    .map((label) => {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const d of perCustomer) {
        const n = pick(d).find((r) => r.label === label)?.total ?? 0;
        counts[d.customerName] = n;
        total += n;
      }
      return { label, counts, total };
    })
    .sort((a, b) => b.total - a.total);
}

// ─── Main query ───────────────────────────────────────────────────────────────

/**
 * Consolidated production view for a service day.
 *
 * The query starts from order_line — customers appear only when they have
 * at least one order record for the selected day.  Three parallel fetches:
 *
 *   1. All order lines (with customer name + matched meal name joins)
 *   2. All open exceptions
 *   3. All release records
 *
 * Everything is grouped in-process; no N+1 per-customer queries.
 */
export async function fetchConsolidatedDashboard(
  serviceDay: string,
): Promise<ConsolidatedDashboard> {
  const [linesRes, exceptionsRes, releasesRes] = await Promise.all([
    supabase
      .from("order_line")
      .select(
        `customer_id,
         menu_item_id,
         match_type,
         protein_name,
         order_source,
         quantity,
         customer ( display_name ),
         menu_item ( canonical_name, category, protein_requirement )`,
      )
      .eq("service_day", serviceDay)
      .is("deleted_at", null),

    // Fetch ALL exceptions (all statuses) so we can compute both the open count
    // and the true "total uploaded" figure (see totalUploaded on the card type).
    supabase
      .from("order_exception")
      .select("customer_id, status, resolved_item_id")
      .eq("service_day", serviceDay),

    supabase
      .from("dashboard_release")
      .select("customer_id, released_at")
      .eq("service_day", serviceDay)
      .is("revoked_at", null), // only active (non-revoked) releases
  ]);

  if (linesRes.error)
    throw new Error(`Failed to load orders: ${linesRes.error.message}`);
  if (exceptionsRes.error)
    throw new Error(`Failed to load exceptions: ${exceptionsRes.error.message}`);
  if (releasesRes.error)
    throw new Error(`Failed to load releases: ${releasesRes.error.message}`);

  // ── Build lookup maps ────────────────────────────────────────────────────

  // Three separate tallies so we can derive totalUploaded accurately:
  //   openExByCustomer   — Open exceptions (block release)
  //   allExByCustomer    — ALL exceptions regardless of status
  //   mappedExByCustomer — Resolved exceptions that produced an order_line
  //                        (status="Resolved" AND resolved_item_id IS NOT NULL)
  //
  // totalUploaded = (order_lines excl. mapped ones) + all exceptions
  //               = totalOrders - mappedExCount + allExCount
  // This correctly counts: original matched uploads + all uploaded-but-unmatched
  // orders without double-counting the ones that were later mapped to order_lines.
  const openExByCustomer = new Map<string, number>();
  const allExByCustomer = new Map<string, number>();
  const mappedExByCustomer = new Map<string, number>();

  for (const ex of exceptionsRes.data ?? []) {
    const cid = ex.customer_id as string;
    allExByCustomer.set(cid, (allExByCustomer.get(cid) ?? 0) + 1);
    if (ex.status === "Open") {
      openExByCustomer.set(cid, (openExByCustomer.get(cid) ?? 0) + 1);
    }
    // A mapped exception has status="Resolved" and resolved_item_id set.
    if (ex.status === "Resolved" && ex.resolved_item_id !== null) {
      mappedExByCustomer.set(cid, (mappedExByCustomer.get(cid) ?? 0) + 1);
    }
  }

  const releaseByCustomer = new Map<string, string>();
  for (const rel of releasesRes.data ?? []) {
    if (rel.released_at) releaseByCustomer.set(rel.customer_id, rel.released_at);
  }

  // ── Group order lines by customer ────────────────────────────────────────

  type LineGroup = {
    id: string;
    name: string;
    totalOrders: number;
    matchedOrders: number;
    missingProtein: number;
    mealMap: Map<string, number>;
    proteinMap: Map<string, number>;
    /** Distinct menu_item.category values seen in matched lines. */
    categorySet: Set<string>;
    /** Lines from bulk upload (order_source = 'bulk_upload' or NULL). */
    bulkUploadCount: number;
    /** Lines entered manually (order_source starts with 'manual_' or = 'special_order'). */
    manualOrderCount: number;
  };

  const byCustomer = new Map<string, LineGroup>();

  for (const line of linesRes.data ?? []) {
    const custId = line.customer_id as string;

    if (!byCustomer.has(custId)) {
      const rel = Array.isArray(line.customer) ? line.customer[0] : line.customer;
      const name =
        rel && typeof rel === "object" && "display_name" in rel
          ? String((rel as Record<string, unknown>).display_name)
          : custId;

      byCustomer.set(custId, {
        id: custId,
        name,
        totalOrders: 0,
        matchedOrders: 0,
        missingProtein: 0,
        mealMap: new Map(),
        proteinMap: new Map(),
        categorySet: new Set(),
        bulkUploadCount: 0,
        manualOrderCount: 0,
      });
    }

    const g = byCustomer.get(custId)!;
    // quantity is stored per-row (Option A); sum rather than count for correct totals.
    const qty = Math.max(1, Number((line as Record<string, unknown>).quantity) || 1);
    g.totalOrders += qty;

    // Source breakdown: NULL or 'bulk_upload' = uploaded; anything else = manual.
    const lineSource = (line as Record<string, unknown>).order_source;
    if (lineSource === null || lineSource === undefined || lineSource === "bulk_upload") {
      g.bulkUploadCount += qty;
    } else {
      g.manualOrderCount += qty;
    }

    // Matched = has a menu_item_id OR is a FruitsOnly line (menu_item_id stays
    // null for FruitsOnly, but the order is production-ready).
    const isFruitsOnlyLine =
      (line as Record<string, unknown>).match_type === "FruitsOnly";

    if (line.menu_item_id !== null) {
      g.matchedOrders += qty;
      const mi = Array.isArray(line.menu_item) ? line.menu_item[0] : line.menu_item;
      const miObj =
        mi && typeof mi === "object" ? (mi as Record<string, unknown>) : null;
      const meal =
        miObj && "canonical_name" in miObj ? String(miObj.canonical_name) : null;
      if (meal) g.mealMap.set(meal, (g.mealMap.get(meal) ?? 0) + qty);
      const cat =
        miObj && "category" in miObj && miObj.category
          ? String(miObj.category)
          : null;
      if (cat) g.categorySet.add(cat);
    } else if (isFruitsOnlyLine) {
      // FruitsOnly orders are production-ready; count them as matched and add
      // a "Fruits Only" label to the meal breakdown.
      g.matchedOrders += qty;
      g.mealMap.set("Fruits Only", (g.mealMap.get("Fruits Only") ?? 0) + qty);
    }

    // Protein — skip the "(No protein)" sentinel used for FruitsOnly and
    // non-required meals so it doesn't pollute the protein counts table.
    if (line.protein_name) {
      const p = String(line.protein_name);
      if (p !== "(No protein)") {
        g.proteinMap.set(p, (g.proteinMap.get(p) ?? 0) + qty);
      }
    } else if (line.menu_item_id !== null) {
      // Only count as "missing protein" when:
      //   • the line has a matched menu item (menu_item_id is set), AND
      //   • that menu item actually requires a protein
      //     (protein_requirement = 'required').
      // Unmatched lines are already counted as unmatchedOrders; FruitsOnly
      // lines (menu_item_id = null) don't need a protein; optional/not_required
      // meals are intentionally proteinless and should not block release.
      const mi = Array.isArray(line.menu_item) ? line.menu_item[0] : line.menu_item;
      const miObj =
        mi && typeof mi === "object" ? (mi as Record<string, unknown>) : null;
      const req =
        miObj && "protein_requirement" in miObj
          ? String(miObj.protein_requirement)
          : "required"; // conservative default when join data is missing
      if (req === "required") {
        g.missingProtein += 1;
      }
    }
  }

  // ── Portion readiness: run checks in parallel for non-released customers ──
  // Released customers already passed this check at release time — skip them.
  // The categorySet is passed to avoid a redundant DB round-trip per customer.

  const READY_READINESS: PortionReadiness = {
    status: "ready",
    message: null,
    unmappedCategories: [],
  };

  const readinessMap = new Map<string, PortionReadiness>();
  await Promise.all(
    [...byCustomer.entries()]
      .filter(([custId]) => !releaseByCustomer.has(custId))
      .map(async ([custId, g]) => {
        const readiness = await checkPortionReadiness(
          custId,
          g.name,
          serviceDay,
          [...g.categorySet],
        );
        readinessMap.set(custId, readiness);
      }),
  );

  // ── Build customer cards ─────────────────────────────────────────────────

  const cards: CustomerDashboardCard[] = [];

  for (const [custId, g] of byCustomer) {
    const unmatchedOrders = g.totalOrders - g.matchedOrders;
    const openExceptionCount = openExByCustomer.get(custId) ?? 0;
    const allExceptionCount = allExByCustomer.get(custId) ?? 0;
    const mappedExceptionCount = mappedExByCustomer.get(custId) ?? 0;
    const releasedAt = releaseByCustomer.get(custId) ?? null;

    // totalUploaded = original matched lines (excl. mapped exceptions) + all exception rows
    // = g.totalOrders - mappedExceptionCount + allExceptionCount
    const totalUploaded = g.totalOrders - mappedExceptionCount + allExceptionCount;

    const mealCounts = [...g.mealMap.entries()]
      .map(([meal, total]) => ({ meal, total }))
      .sort((a, b) => b.total - a.total);

    const proteinCounts = [...g.proteinMap.entries()]
      .map(([protein, total]) => ({ protein, total }))
      .sort((a, b) => b.total - a.total);

    const portionReadiness = releasedAt
      ? READY_READINESS
      : (readinessMap.get(custId) ?? READY_READINESS);

    let status: CustomerStatus;
    if (releasedAt) {
      status = "released";
    } else if (
      openExceptionCount > 0 ||
      unmatchedOrders > 0 ||
      g.missingProtein > 0 ||
      portionReadiness.status !== "ready"
    ) {
      status = "needs_work";
    } else {
      status = "ready";
    }

    cards.push({
      customerId: custId,
      customerName: g.name,
      totalUploaded,
      matchedOrders: g.matchedOrders,
      unmatchedOrders,
      missingProtein: g.missingProtein,
      openExceptionCount,
      releasedAt,
      status,
      mealCounts,
      proteinCounts,
      portionReadiness,
      bulkUploadCount: g.bulkUploadCount,
      manualOrderCount: g.manualOrderCount,
    });
  }

  // Alphabetical by customer name
  cards.sort((a, b) => a.customerName.localeCompare(b.customerName));

  const customers: CustomerRef[] = cards.map((c) => ({ id: c.customerId, name: c.customerName }));
  // grandTotal drives the consolidated meal/protein tables and the page header count.
  // It uses matchedOrders (= production-ready lines) so it stays consistent with the
  // table rows, which are derived from mealCounts/proteinCounts (matched only).
  const grandTotal = cards.reduce((sum, c) => sum + c.matchedOrders, 0);

  const mealRows = pivot(cards, (c) =>
    c.mealCounts.map((r) => ({ label: r.meal, total: r.total })),
  );
  const proteinRows = pivot(cards, (c) =>
    c.proteinCounts.map((r) => ({ label: r.protein, total: r.total })),
  );

  // True when exceptions exist for this day but no order_lines at all.
  // Happens when all uploaded orders were unmatched (they go to order_exception
  // only) and none have been resolved via "map" yet (which creates order_lines).
  const unresolvedExceptionsOnly = byCustomer.size === 0 && allExByCustomer.size > 0;

  return { serviceDay, customers, mealRows, proteinRows, grandTotal, cards, unresolvedExceptionsOnly };
}

// ─── Production Daily Dashboard types & query ────────────────────────────────

export type ProductionCustomerRow = {
  customerId: string;
  customerName: string;
  releasedAt: string;
  totalMeals: number;
  mealCounts: { meal: string; total: number }[];
  proteinCounts: { protein: string; total: number }[];
  swallowCounts: { swallow: string; total: number }[];
};

export type ProductionDailyDashboard = {
  serviceDay: string;
  releasedCustomerCount: number;
  /** Released customers in alphabetical order — includes id for drill-down links. */
  customers: CustomerRef[];
  mealRows: ConsolidatedRow[];
  proteinRows: ConsolidatedRow[];
  swallowRows: ConsolidatedRow[];
  grandTotal: number;
  customerRows: ProductionCustomerRow[];
};

/**
 * Production-only view for a service day.
 *
 * Only customers with an active (non-revoked) dashboard_release record are
 * included. Order lines that belong to unreleased customers are ignored, so
 * this function is safe to render in kitchen-facing views.
 *
 * Flow:
 *   1. Fetch active releases for the day → released customer_id set.
 *   2. If empty → return an empty dashboard (triggers the "nothing released yet" UI).
 *   3. Fetch order_line rows for those customers + day (with meal name + customer name joins).
 *   4. Aggregate meals / proteins / swallows per customer + grand total.
 *   5. Build consolidated pivot tables (same ConsolidatedRow shape as Order Review).
 */
export async function fetchProductionDailyDashboard(
  serviceDay: string,
): Promise<ProductionDailyDashboard> {
  // ── 1. Active releases ───────────────────────────────────────────────────
  const { data: releases, error: releasesErr } = await supabase
    .from("dashboard_release")
    .select("customer_id, released_at")
    .eq("service_day", serviceDay)
    .is("revoked_at", null);

  if (releasesErr)
    throw new Error(`Failed to load releases: ${releasesErr.message}`);

  if (!releases || releases.length === 0) {
    return {
      serviceDay,
      releasedCustomerCount: 0,
      customers: [] as CustomerRef[],
      mealRows: [],
      proteinRows: [],
      swallowRows: [],
      grandTotal: 0,
      customerRows: [],
    };
  }

  const releasedCustomerIds = releases.map((r) => r.customer_id as string);
  const releaseAtById = new Map<string, string>(
    releases
      .filter((r) => r.released_at !== null)
      .map((r) => [r.customer_id as string, r.released_at as string]),
  );

  // ── 2. Order lines for released customers ────────────────────────────────
  const { data: lines, error: linesErr } = await supabase
    .from("order_line")
    .select(
      `
      customer_id,
      menu_item_id,
      match_type,
      protein_name,
      swallow_name,
      quantity,
      customer ( display_name ),
      menu_item ( canonical_name )
    `,
    )
    .eq("service_day", serviceDay)
    .in("customer_id", releasedCustomerIds)
    .is("deleted_at", null);

  if (linesErr)
    throw new Error(`Failed to load order lines: ${linesErr.message}`);

  // ── 3. Aggregate per customer ────────────────────────────────────────────

  type CustomerAgg = {
    name: string;
    totalMeals: number;
    mealMap: Map<string, number>;
    proteinMap: Map<string, number>;
    swallowMap: Map<string, number>;
  };

  const byCustomer = new Map<string, CustomerAgg>();

  for (const line of lines ?? []) {
    const custId = line.customer_id as string;

    if (!byCustomer.has(custId)) {
      const custRel = Array.isArray(line.customer) ? line.customer[0] : line.customer;
      const name =
        custRel && typeof custRel === "object" && "display_name" in custRel
          ? String((custRel as Record<string, unknown>).display_name)
          : custId;

      byCustomer.set(custId, {
        name,
        totalMeals: 0,
        mealMap: new Map(),
        proteinMap: new Map(),
        swallowMap: new Map(),
      });
    }

    const g = byCustomer.get(custId)!;
    // quantity is stored per-row (Option A); sum rather than count for correct totals.
    const qty = Math.max(1, Number((line as Record<string, unknown>).quantity) || 1);
    g.totalMeals += qty;

    // Meal name — FruitsOnly lines have menu_item_id = null but are still
    // production-ready meals that should appear in the breakdown.
    const isProdFruitsOnly =
      (line as Record<string, unknown>).match_type === "FruitsOnly";

    if (line.menu_item_id !== null) {
      const mi = Array.isArray(line.menu_item) ? line.menu_item[0] : line.menu_item;
      const miObj =
        mi && typeof mi === "object" ? (mi as Record<string, unknown>) : null;
      const meal =
        miObj && "canonical_name" in miObj ? String(miObj.canonical_name) : null;
      if (meal) g.mealMap.set(meal, (g.mealMap.get(meal) ?? 0) + qty);
    } else if (isProdFruitsOnly) {
      g.mealMap.set("Fruits Only", (g.mealMap.get("Fruits Only") ?? 0) + qty);
    }

    // Protein — skip the "(No protein)" sentinel used for FruitsOnly and
    // non-required meals so it doesn't pollute the protein counts table.
    if (line.protein_name) {
      const p = String(line.protein_name);
      if (p !== "(No protein)") {
        g.proteinMap.set(p, (g.proteinMap.get(p) ?? 0) + qty);
      }
    }

    // Swallow
    if (line.swallow_name) {
      const s = String(line.swallow_name);
      g.swallowMap.set(s, (g.swallowMap.get(s) ?? 0) + qty);
    }
  }

  // ── 4. Build customer rows ───────────────────────────────────────────────

  const customerRows: ProductionCustomerRow[] = [];

  for (const [custId, g] of byCustomer) {
    customerRows.push({
      customerId: custId,
      customerName: g.name,
      releasedAt: releaseAtById.get(custId) ?? "",
      totalMeals: g.totalMeals,
      mealCounts: [...g.mealMap.entries()]
        .map(([meal, total]) => ({ meal, total }))
        .sort((a, b) => b.total - a.total),
      proteinCounts: [...g.proteinMap.entries()]
        .map(([protein, total]) => ({ protein, total }))
        .sort((a, b) => b.total - a.total),
      swallowCounts: [...g.swallowMap.entries()]
        .map(([swallow, total]) => ({ swallow, total }))
        .sort((a, b) => b.total - a.total),
    });
  }

  // Alphabetical
  customerRows.sort((a, b) => a.customerName.localeCompare(b.customerName));

  const customers: CustomerRef[] = customerRows.map((r) => ({ id: r.customerId, name: r.customerName }));
  const grandTotal = customerRows.reduce((sum, r) => sum + r.totalMeals, 0);

  const mealRows = pivot(customerRows, (r) =>
    r.mealCounts.map((c) => ({ label: c.meal, total: c.total })),
  );
  const proteinRows = pivot(customerRows, (r) =>
    r.proteinCounts.map((c) => ({ label: c.protein, total: c.total })),
  );
  const swallowRows = pivot(customerRows, (r) =>
    r.swallowCounts.map((c) => ({ label: c.swallow, total: c.total })),
  );

  return {
    serviceDay,
    releasedCustomerCount: customerRows.length,
    customers,
    mealRows,
    proteinRows,
    swallowRows,
    grandTotal,
    customerRows,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function parseServiceDayParam(value: string | undefined): string {
  if (value && isCalendarDate(value)) return value;
  return DEFAULT_SERVICE_DAY;
}

export function formatServiceDayLabel(serviceDay: string): string {
  return formatCalendarDateLabel(serviceDay);
}
