import {
  formatCalendarDateLabel,
  isCalendarDate,
} from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";

export const CUSTOMERS = ["AVON", "HGI", "ELCREST", "HEIRS", "HLA"];
export const DEFAULT_CUSTOMER = "AVON";
export const DEFAULT_SERVICE_DAY = "2026-05-11";

export type MealCountRow = {
  meal: string;
  total: number;
};

export type ProteinCountRow = {
  protein: string;
  total: number;
};

export type DashboardData = {
  customerName: string;
  serviceDay: string;
  mealCounts: MealCountRow[];
  proteinCounts: ProteinCountRow[];
  grandTotal: number;
  unmatchedCount: number;
  openExceptionCount: number;
  releasedAt: string | null;
};

async function fetchDashboardCustomerId(
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

export async function fetchDashboard(
  customerDisplayName: string,
  serviceDay: string,
): Promise<DashboardData> {
  const customerId = await fetchDashboardCustomerId(customerDisplayName);

  const { data: lines, error } = await supabase
    .from("order_line")
    .select(
      `
      menu_item_id,
      protein_name,
      menu_item ( canonical_name )
    `,
    )
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay);

  if (error) {
    throw new Error(`Failed to load order lines: ${error.message}`);
  }

  const counts = new Map<string, number>();
  const proteins = new Map<string, number>();
  let unmatchedCount = 0;

  for (const line of lines ?? []) {
    if (line.protein_name) {
      const p = String(line.protein_name);
      proteins.set(p, (proteins.get(p) ?? 0) + 1);
    }

    if (line.menu_item_id === null) {
      unmatchedCount += 1;
      continue;
    }

    const menuItem = Array.isArray(line.menu_item)
      ? line.menu_item[0]
      : line.menu_item;
    const meal =
      menuItem &&
      typeof menuItem === "object" &&
      "canonical_name" in menuItem
        ? String(menuItem.canonical_name)
        : null;

    if (!meal) {
      continue;
    }

    counts.set(meal, (counts.get(meal) ?? 0) + 1);
  }

  const mealCounts = [...counts.entries()]
    .map(([meal, total]) => ({ meal, total }))
    .sort((a, b) => b.total - a.total);

  const proteinCounts = [...proteins.entries()]
    .map(([protein, total]) => ({ protein, total }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = mealCounts.reduce((sum, row) => sum + row.total, 0);

  const [{ count: openExceptionCount }, { data: release }] = await Promise.all([
    supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("status", "Open"),
    supabase
      .from("dashboard_release")
      .select("released_at")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .maybeSingle(),
  ]);

  return {
    customerName: customerDisplayName,
    serviceDay,
    mealCounts,
    proteinCounts,
    grandTotal,
    unmatchedCount,
    openExceptionCount: openExceptionCount ?? 0,
    releasedAt: release?.released_at ?? null,
  };
}

export function parseCustomerParam(value: string | undefined): string {
  if (value && CUSTOMERS.includes(value)) {
    return value;
  }
  return DEFAULT_CUSTOMER;
}

export type ConsolidatedRow = {
  label: string;
  counts: Record<string, number>;
  total: number;
};

export type ConsolidatedCustomerStatus = {
  customer: string;
  total: number;
  openExceptionCount: number;
  releasedAt: string | null;
};

export type ConsolidatedDashboard = {
  serviceDay: string;
  customers: string[];
  mealRows: ConsolidatedRow[];
  proteinRows: ConsolidatedRow[];
  grandTotal: number;
  statuses: ConsolidatedCustomerStatus[];
};

function pivot(
  perCustomer: DashboardData[],
  pick: (d: DashboardData) => { label: string; total: number }[],
): ConsolidatedRow[] {
  const labels = new Set<string>();
  for (const d of perCustomer) {
    for (const r of pick(d)) {
      labels.add(r.label);
    }
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

/**
 * Consolidated production view for a service day: one row per meal (and per
 * protein), one column per customer, plus totals — the single all-orders
 * dashboard the kitchen works from.
 */
export async function fetchConsolidatedDashboard(
  serviceDay: string,
): Promise<ConsolidatedDashboard> {
  const perCustomer = await Promise.all(
    CUSTOMERS.map((c) => fetchDashboard(c, serviceDay)),
  );

  const mealRows = pivot(perCustomer, (d) =>
    d.mealCounts.map((r) => ({ label: r.meal, total: r.total })),
  );
  const proteinRows = pivot(perCustomer, (d) =>
    d.proteinCounts.map((r) => ({ label: r.protein, total: r.total })),
  );

  const grandTotal = perCustomer.reduce((sum, d) => sum + d.grandTotal, 0);

  const statuses = perCustomer.map((d) => ({
    customer: d.customerName,
    total: d.grandTotal,
    openExceptionCount: d.openExceptionCount,
    releasedAt: d.releasedAt,
  }));

  return {
    serviceDay,
    customers: CUSTOMERS,
    mealRows,
    proteinRows,
    grandTotal,
    statuses,
  };
}

export function parseServiceDayParam(value: string | undefined): string {
  if (value && isCalendarDate(value)) {
    return value;
  }

  return DEFAULT_SERVICE_DAY;
}

export function formatServiceDayLabel(serviceDay: string): string {
  return formatCalendarDateLabel(serviceDay);
}
