import { parseCalendarDate, addCalendarDays } from "@/lib/calendar-date";
import type { AvonMenuItem } from "@/lib/avon-menu";
import { fetchMenuItems } from "@/lib/avon-menu";
import type { DayOfWeek } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The four possible values stored in order_exception.status. */
export type ExceptionStatusFilter = "Open" | "Resolved" | "AcceptedAsIs" | "All";

export type CustomerSummary = {
  id: string;
  display_name: string;
};

export type BulkScope = "service_day" | "all";

export type OpenOrderException = {
  id: string;
  raw_value: string;
  employee_ref: string;
  service_day: string;
  order_batch_id: string;
  customer_id: string;
  exception_type: string;
  suggested_item_id: string | null;
  suggested_score: number | null;
  suggested_canonical_name: string | null;
  meal_core: string | null;
  status: string;
};

// ─── Day-of-week helper ───────────────────────────────────────────────────────

const JS_DAY_TO_DOW: Partial<Record<number, DayOfWeek>> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

export function serviceDayToAvonDay(serviceDay: string): DayOfWeek | null {
  const { year, month, day } = parseCalendarDate(serviceDay);
  return JS_DAY_TO_DOW[new Date(year, month - 1, day).getDay()] ?? null;
}

// ─── Generic queries ──────────────────────────────────────────────────────────

/** All active customers, ordered alphabetically. */
export async function fetchAllCustomers(): Promise<CustomerSummary[]> {
  const { data, error } = await supabase
    .from("customer")
    .select("id, display_name, status")
    .order("display_name");

  if (error) throw new Error(`Failed to load customers: ${error.message}`);

  return (data ?? [])
    .filter((c) => c.status !== "Inactive")
    .map((c) => ({ id: c.id, display_name: c.display_name }));
}

/**
 * Fetch exceptions for a specific customer + service day (or a full service week).
 *
 * Pass `serviceWeekStart` (a Monday YYYY-MM-DD) to load all exceptions for
 * the Mon–Fri range.  Pass `serviceDay` to load a single day.
 * Pass `statusFilter: "All"` to skip the status clause entirely.
 */
export async function fetchExceptions(params: {
  customerId: string;
  serviceDay?: string;
  serviceWeekStart?: string;
  statusFilter?: ExceptionStatusFilter;
}): Promise<OpenOrderException[]> {
  const { customerId, serviceDay, serviceWeekStart, statusFilter = "Open" } = params;

  let query = supabase
    .from("order_exception")
    .select(
      `
      id,
      raw_value,
      employee_ref,
      service_day,
      order_batch_id,
      customer_id,
      exception_type,
      suggested_item_id,
      suggested_score,
      status,
      meal_core,
      suggested_item:menu_item!suggested_item_id (
        canonical_name
      )
    `,
    )
    .eq("customer_id", customerId)
    .order("service_day")
    .order("employee_ref");

  if (serviceWeekStart) {
    // Mon (+0) through Fri (+4)
    const weekDates = [0, 1, 2, 3, 4].map((n) => addCalendarDays(serviceWeekStart, n));
    query = query.in("service_day", weekDates);
  } else {
    query = query.eq("service_day", serviceDay ?? "");
  }

  if (statusFilter !== "All") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load exceptions: ${error.message}`);

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
      exception_type: row.exception_type as string,
      suggested_item_id: row.suggested_item_id,
      suggested_score: row.suggested_score,
      suggested_canonical_name: suggestedItem?.canonical_name ?? null,
      meal_core: row.meal_core ?? null,
      status: row.status,
    };
  });
}

/**
 * Count Open exceptions that match the bulk-correction criteria:
 *   same customer, same raw_value, same exception_type, status = "Open",
 *   excluding the exception that triggered the correction.
 *
 * scope = "service_day" → also restricts to the same service_day.
 * scope = "all"         → all future/current unresolved occurrences.
 */
export async function countSimilarExceptions(params: {
  customerId: string;
  rawValue: string;
  exceptionType: string;
  excludeId: string;
  scope: BulkScope;
  serviceDay: string;
}): Promise<number> {
  const { customerId, rawValue, exceptionType, excludeId, scope, serviceDay } =
    params;

  let query = supabase
    .from("order_exception")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("raw_value", rawValue)
    .eq("exception_type", exceptionType)
    .eq("status", "Open")
    .neq("id", excludeId);

  if (scope === "service_day") {
    query = query.eq("service_day", serviceDay);
  }

  const { count, error } = await query;
  if (error) throw new Error(`Failed to count similar exceptions: ${error.message}`);
  return count ?? 0;
}

/**
 * Published menu items for a customer on the weekday matching serviceDay.
 * Returns an empty array when the service day falls on a weekend.
 */
export async function fetchMenuItemsForServiceDay(
  customerDisplayName: string,
  serviceDay: string,
): Promise<AvonMenuItem[]> {
  const day = serviceDayToAvonDay(serviceDay);
  if (!day) return [];
  const items = await fetchMenuItems(customerDisplayName);
  return items.filter((item) => item.day_of_week === day);
}

// ─── Legacy exports (AVON-specific, kept for backward compatibility) ──────────

const AVON_CUSTOMER_NAME = "AVON";

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
  return fetchExceptions({ customerId, serviceDay, statusFilter: "Open" });
}

/** @deprecated Use fetchMenuItemsForServiceDay with an explicit customer name. */
export async function fetchAvonMenuItemsForServiceDay(
  serviceDay: string,
): Promise<AvonMenuItem[]> {
  return fetchMenuItemsForServiceDay(AVON_CUSTOMER_NAME, serviceDay);
}
