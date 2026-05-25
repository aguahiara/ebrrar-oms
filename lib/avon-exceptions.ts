import { parseCalendarDate } from "@/lib/calendar-date";
import type { AvonMenuItem } from "@/lib/avon-menu";
import { fetchMenuItems } from "@/lib/avon-menu";
import type { DayOfWeek } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

const AVON_CUSTOMER_NAME = "AVON";

const JS_DAY_TO_AVON: Partial<Record<number, DayOfWeek>> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

export type OpenOrderException = {
  id: string;
  raw_value: string;
  employee_ref: string;
  service_day: string;
  order_batch_id: string;
  customer_id: string;
  suggested_item_id: string | null;
  suggested_score: number | null;
  suggested_canonical_name: string | null;
};

export function serviceDayToAvonDay(serviceDay: string): DayOfWeek | null {
  const { year, month, day } = parseCalendarDate(serviceDay);
  return JS_DAY_TO_AVON[new Date(year, month - 1, day).getDay()] ?? null;
}

export async function fetchAvonCustomerId(): Promise<string> {
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

export async function fetchOpenExceptions(
  serviceDay: string,
): Promise<OpenOrderException[]> {
  const customerId = await fetchAvonCustomerId();

  const { data, error } = await supabase
    .from("order_exception")
    .select(
      `
      id,
      raw_value,
      employee_ref,
      service_day,
      order_batch_id,
      customer_id,
      suggested_item_id,
      suggested_score,
      suggested_item:menu_item!suggested_item_id (
        canonical_name
      )
    `,
    )
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .eq("status", "Open")
    .order("employee_ref");

  if (error) {
    throw new Error(`Failed to load exceptions: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const suggested = row.suggested_item as
      | { canonical_name: string }
      | { canonical_name: string }[]
      | null;

    const suggestedItem = Array.isArray(suggested) ? suggested[0] : suggested;

    return {
      id: row.id,
      raw_value: row.raw_value,
      employee_ref: row.employee_ref,
      service_day: row.service_day,
      order_batch_id: row.order_batch_id,
      customer_id: row.customer_id,
      suggested_item_id: row.suggested_item_id,
      suggested_score: row.suggested_score,
      suggested_canonical_name: suggestedItem?.canonical_name ?? null,
    };
  });
}

/** Published AVON menu items for the weekday of the given service day. */
export async function fetchAvonMenuItemsForServiceDay(
  serviceDay: string,
): Promise<AvonMenuItem[]> {
  const avonDay = serviceDayToAvonDay(serviceDay);
  if (!avonDay) {
    return [];
  }

  const items = await fetchMenuItems(AVON_CUSTOMER_NAME);
  return items.filter((item) => item.day_of_week === avonDay);
}
