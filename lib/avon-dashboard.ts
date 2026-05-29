import {
  formatCalendarDateLabel,
  isCalendarDate,
} from "@/lib/calendar-date";
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
  /** Lines where protein_name IS NULL (protein not captured or not matched) */
  missingProtein: number;
  /** Open order_exception rows for this customer + service day */
  openExceptionCount: number;
  releasedAt: string | null;
  status: CustomerStatus;
  mealCounts: { meal: string; total: number }[];
  proteinCounts: { protein: string; total: number }[];
};

export type ConsolidatedDashboard = {
  serviceDay: string;
  /** Display names — only customers that have ≥1 order line */
  customers: string[];
  mealRows: ConsolidatedRow[];
  proteinRows: ConsolidatedRow[];
  grandTotal: number;
  cards: CustomerDashboardCard[];
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
         protein_name,
         customer ( display_name ),
         menu_item ( canonical_name )`,
      )
      .eq("service_day", serviceDay),

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
      });
    }

    const g = byCustomer.get(custId)!;
    g.totalOrders += 1;

    // Matched = has a menu_item_id
    if (line.menu_item_id !== null) {
      g.matchedOrders += 1;
      const mi = Array.isArray(line.menu_item) ? line.menu_item[0] : line.menu_item;
      const meal =
        mi && typeof mi === "object" && "canonical_name" in mi
          ? String((mi as Record<string, unknown>).canonical_name)
          : null;
      if (meal) g.mealMap.set(meal, (g.mealMap.get(meal) ?? 0) + 1);
    }

    // Protein
    if (line.protein_name) {
      const p = String(line.protein_name);
      g.proteinMap.set(p, (g.proteinMap.get(p) ?? 0) + 1);
    } else {
      g.missingProtein += 1;
    }
  }

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

    let status: CustomerStatus;
    if (releasedAt) {
      status = "released";
    } else if (openExceptionCount > 0 || unmatchedOrders > 0 || g.missingProtein > 0) {
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
    });
  }

  // Alphabetical by customer name
  cards.sort((a, b) => a.customerName.localeCompare(b.customerName));

  const customers = cards.map((c) => c.customerName);
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

  return { serviceDay, customers, mealRows, proteinRows, grandTotal, cards };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function parseServiceDayParam(value: string | undefined): string {
  if (value && isCalendarDate(value)) return value;
  return DEFAULT_SERVICE_DAY;
}

export function formatServiceDayLabel(serviceDay: string): string {
  return formatCalendarDateLabel(serviceDay);
}
