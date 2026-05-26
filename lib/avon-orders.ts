import { addCalendarDays } from "@/lib/calendar-date";
import { decomposeMeal } from "@/lib/decompose";
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

      const { proteinName, swallowName, mealRemainder } = decomposeMeal(
        order.rawMealText,
        dayProteins,
        daySwallows,
      );

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
 * production count (FRD 5.9).
 */
export async function persistUpload(params: {
  customerDisplayName: string;
  serviceDay: string;
  sourceFilename: string;
  orders: ResolvedOrder[];
}): Promise<{ batchId: string; linesInserted: number; exceptionsInserted: number }> {
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
      protein_name: order.proteinName,
      swallow_name: order.swallowName,
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
      meal_core: order.mealCore,
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
