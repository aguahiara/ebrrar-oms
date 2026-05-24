import type { AvonDayOfWeek, AvonOrderRecord } from "@/lib/avon-excel";
import type { AvonMenuItem } from "@/lib/avon-menu";
import { addCalendarDays } from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";

const AVON_CUSTOMER_NAME = "AVON";

const WEEKDAY_OFFSET: Record<AvonDayOfWeek, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
};

export type ResolvedAvonOrder = AvonOrderRecord & {
  menuItemId: string | null;
  matchType: "Direct" | null;
};

export type AvonMatchSummary = {
  totalOrders: number;
  matchedDirectly: number;
  unmatched: {
    employeeName: string;
    dayOfWeek: AvonDayOfWeek;
    rawMealText: string;
  }[];
};

export function buildMatchSummary(orders: ResolvedAvonOrder[]): AvonMatchSummary {
  const unmatched = orders
    .filter((order) => order.matchType === null)
    .map(({ employeeName, dayOfWeek, rawMealText }) => ({
      employeeName,
      dayOfWeek,
      rawMealText,
    }));

  return {
    totalOrders: orders.length,
    matchedDirectly: orders.length - unmatched.length,
    unmatched,
  };
}

function normalizeMealText(value: string): string {
  return value.trim().toLowerCase();
}

export function lineServiceDay(
  weekStart: string,
  dayOfWeek: AvonDayOfWeek,
): string {
  return addCalendarDays(weekStart, WEEKDAY_OFFSET[dayOfWeek]);
}

export function resolveAvonOrders(
  orders: AvonOrderRecord[],
  menuItems: AvonMenuItem[],
): ResolvedAvonOrder[] {
  return orders.map((order) => {
    const normalizedMeal = normalizeMealText(order.rawMealText);
    const match = menuItems.find(
      (item) =>
        item.day_of_week === order.dayOfWeek &&
        normalizeMealText(item.canonical_name) === normalizedMeal,
    );

    return {
      ...order,
      menuItemId: match?.id ?? null,
      matchType: match ? "Direct" : null,
    };
  });
}

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

export async function persistAvonUpload(params: {
  serviceDay: string;
  sourceFilename: string;
  orders: ResolvedAvonOrder[];
}): Promise<{ batchId: string; linesInserted: number }> {
  const customerId = await fetchAvonCustomerId();

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

  if (params.orders.length === 0) {
    return { batchId: batch.id, linesInserted: 0 };
  }

  const lines = params.orders.map((order) => ({
    order_batch_id: batch.id,
    customer_id: customerId,
    service_day: lineServiceDay(params.serviceDay, order.dayOfWeek),
    menu_item_id: order.menuItemId,
    meal_name_raw: order.rawMealText,
    employee_ref: order.employeeName,
    quantity: 1,
    match_type: order.matchType,
  }));

  const { data: inserted, error: linesError } = await supabase
    .from("order_line")
    .insert(lines)
    .select("id");

  if (linesError) {
    throw new Error(`Failed to insert order lines: ${linesError.message}`);
  }

  return {
    batchId: batch.id,
    linesInserted: inserted?.length ?? 0,
  };
}
