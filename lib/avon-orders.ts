import type { AvonDayOfWeek, AvonOrderRecord } from "@/lib/avon-excel";
import type { AvonMenuItem } from "@/lib/avon-menu";
import { addCalendarDays } from "@/lib/calendar-date";
import { matchMeal, type MenuItemAliasForMatch } from "@/lib/matchMeal";
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
  matchType: "Direct" | "Alias" | "Fuzzy" | null;
  // Populated only for Fuzzy matches (the similarity score that cleared the threshold).
  matchScore: number | null;
  // Populated only when unmatched: the best fuzzy guess + score, surfaced on the exception.
  bestGuessId: string | null;
  bestScore: number | null;
};

export type AvonMatchSummary = {
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  exceptions: {
    employeeName: string;
    dayOfWeek: AvonDayOfWeek;
    rawMealText: string;
    bestScore: number | null;
  }[];
};

export function buildMatchSummary(orders: ResolvedAvonOrder[]): AvonMatchSummary {
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
    exceptions,
  };
}

export function lineServiceDay(
  weekStart: string,
  dayOfWeek: AvonDayOfWeek,
): string {
  return addCalendarDays(weekStart, WEEKDAY_OFFSET[dayOfWeek]);
}

/**
 * Run the FRD 8.4 three-step reconciliation (Direct -> Alias -> Fuzzy) for every
 * parsed order. menuItems are filtered to the order's day before matching;
 * matchMeal restricts aliases to that day's item ids internally.
 */
export async function resolveAvonOrders(
  orders: AvonOrderRecord[],
  menuItems: AvonMenuItem[],
  aliases: MenuItemAliasForMatch[],
): Promise<ResolvedAvonOrder[]> {
  return Promise.all(
    orders.map(async (order) => {
      const dayItems = menuItems.filter(
        (item) => item.day_of_week === order.dayOfWeek,
      );
      const result = await matchMeal(order.rawMealText, dayItems, aliases);

      if (result.matchType !== null) {
        return {
          ...order,
          menuItemId: result.itemId,
          matchType: result.matchType,
          matchScore: result.matchType === "Fuzzy" ? result.score : null,
          bestGuessId: null,
          bestScore: null,
        };
      }

      return {
        ...order,
        menuItemId: null,
        matchType: null,
        matchScore: null,
        bestGuessId: result.bestGuessId,
        bestScore: result.bestScore,
      };
    }),
  );
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

/**
 * Persist a parsed batch. Matched orders (Direct/Alias/Fuzzy) become order_line rows;
 * unmatched orders become Open order_exception rows so nothing silently enters the
 * production count (FRD 5.9).
 */
export async function persistAvonUpload(params: {
  serviceDay: string;
  sourceFilename: string;
  orders: ResolvedAvonOrder[];
}): Promise<{ batchId: string; linesInserted: number; exceptionsInserted: number }> {
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

  const matched = params.orders.filter((order) => order.matchType !== null);
  const unmatched = params.orders.filter((order) => order.matchType === null);

  let linesInserted = 0;
  if (matched.length > 0) {
    const lines = matched.map((order) => ({
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

    linesInserted = inserted?.length ?? 0;
  }

  let exceptionsInserted = 0;
  if (unmatched.length > 0) {
    const exceptions = unmatched.map((order) => ({
      order_batch_id: batch.id,
      customer_id: customerId,
      service_day: lineServiceDay(params.serviceDay, order.dayOfWeek),
      raw_value: order.rawMealText,
      employee_ref: order.employeeName,
      exception_type: "Meal not on menu",
      suggested_item_id: order.bestGuessId,
      suggested_score: order.bestScore,
      status: "Open",
    }));

    const { data: insertedExceptions, error: exceptionError } = await supabase
      .from("order_exception")
      .insert(exceptions)
      .select("id");

    if (exceptionError) {
      throw new Error(
        `Failed to insert order exceptions: ${exceptionError.message}`,
      );
    }

    exceptionsInserted = insertedExceptions?.length ?? 0;
  }

  return { batchId: batch.id, linesInserted, exceptionsInserted };
}
