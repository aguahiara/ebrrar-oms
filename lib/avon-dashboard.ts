import {
  formatCalendarDateLabel,
  isCalendarDate,
} from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";

const AVON_CUSTOMER_NAME = "AVON";
export const DEFAULT_SERVICE_DAY = "2026-05-11";

export type MealCountRow = {
  meal: string;
  total: number;
};

export type ProteinCountRow = {
  protein: string;
  total: number;
};

export type AvonDashboardData = {
  customerName: string;
  serviceDay: string;
  mealCounts: MealCountRow[];
  proteinCounts: ProteinCountRow[];
  grandTotal: number;
  unmatchedCount: number;
  openExceptionCount: number;
  releasedAt: string | null;
};

async function fetchAvonCustomerId(): Promise<string> {
  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("display_name", AVON_CUSTOMER_NAME)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load AVON customer: ${error?.message ?? "not found"}`);
  }

  return data.id;
}

export async function fetchAvonDashboard(
  serviceDay: string,
): Promise<AvonDashboardData> {
  const customerId = await fetchAvonCustomerId();

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
    customerName: AVON_CUSTOMER_NAME,
    serviceDay,
    mealCounts,
    proteinCounts,
    grandTotal,
    unmatchedCount,
    openExceptionCount: openExceptionCount ?? 0,
    releasedAt: release?.released_at ?? null,
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
