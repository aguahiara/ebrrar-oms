import { parseCalendarDate, addCalendarDays } from "@/lib/calendar-date";
import type { AvonMenuItem, MenuVocabItem } from "@/lib/avon-menu";
export type { MenuVocabItem };
import { fetchMenuItems, fetchProteins } from "@/lib/avon-menu";
import { PROTEIN_EXCEPTION_TYPE } from "@/lib/avon-orders";
import type { DayOfWeek } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

// ─── Week-start helper ────────────────────────────────────────────────────────

/**
 * Given any calendar date (Mon–Fri), return the Monday of its ISO week.
 * Used to align a specific exception service_day to the menu version that was
 * uploaded for that week.
 */
export function getMondayOfWeek(serviceDay: string): string {
  const { year, month, day } = parseCalendarDate(serviceDay);
  const d = new Date(year, month - 1, day);
  const jsDay = d.getDay(); // 0=Sun 1=Mon … 6=Sat
  // Monday offset: Mon=0, Tue=-1, Wed=-2, Thu=-3, Fri=-4
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  return addCalendarDays(serviceDay, offset);
}

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
 * Count Open exceptions that match the bulk-correction criteria,
 * excluding the exception that triggered the correction.
 *
 * scope = "service_day" → also restricts to the same service_day.
 * scope = "all"         → all future/current unresolved occurrences.
 *
 * For protein exceptions (exceptionType === PROTEIN_EXCEPTION_TYPE) the
 * similarity criterion is the matched menu_item_id, not raw_value.
 * Provide orderBatchId + employeeRef so the function can look up the
 * order_line to obtain menu_item_id (same two-step logic as the resolve
 * route's bulk path).  Falls back to raw_value matching when the lookup
 * fails or the parameters are absent.
 */
export async function countSimilarExceptions(params: {
  customerId: string;
  rawValue: string;
  exceptionType: string;
  excludeId: string;
  scope: BulkScope;
  serviceDay: string;
  /** Needed for protein exception menu_item_id lookup */
  orderBatchId?: string;
  /** Needed for protein exception menu_item_id lookup */
  employeeRef?: string;
}): Promise<number> {
  const {
    customerId,
    rawValue,
    exceptionType,
    excludeId,
    scope,
    serviceDay,
    orderBatchId,
    employeeRef,
  } = params;

  // ── Protein exceptions: group by menu_item_id ─────────────────────────────
  if (exceptionType === PROTEIN_EXCEPTION_TYPE && orderBatchId && employeeRef) {
    // Step 1 — look up this exception's order_line → get menu_item_id
    const { data: line } = await supabase
      .from("order_line")
      .select("menu_item_id")
      .eq("order_batch_id", orderBatchId)
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("employee_ref", employeeRef)
      .maybeSingle();

    const targetMenuItemId = line?.menu_item_id as string | null;

    if (targetMenuItemId) {
      // Step 2 — all order_lines for that menu item with protein still null
      let linesQuery = supabase
        .from("order_line")
        .select("order_batch_id, employee_ref, service_day")
        .eq("customer_id", customerId)
        .eq("menu_item_id", targetMenuItemId)
        .is("protein_name", null);

      if (scope === "service_day") {
        linesQuery = linesQuery.eq("service_day", serviceDay);
      }

      const { data: matchingLines } = await linesQuery;
      if (!matchingLines || matchingLines.length === 0) return 0;

      // Build a lookup set; exclude the current exception's own line
      const lineKeys = new Set(
        matchingLines.map(
          (l) => `${l.order_batch_id}\x00${l.employee_ref}\x00${l.service_day}`,
        ),
      );
      lineKeys.delete(`${orderBatchId}\x00${employeeRef}\x00${serviceDay}`);
      if (lineKeys.size === 0) return 0;

      // Step 3 — open protein exceptions for this customer/scope
      let exQuery = supabase
        .from("order_exception")
        .select("id, order_batch_id, employee_ref, service_day")
        .eq("customer_id", customerId)
        .eq("exception_type", PROTEIN_EXCEPTION_TYPE)
        .eq("status", "Open")
        .neq("id", excludeId);

      if (scope === "service_day") {
        exQuery = exQuery.eq("service_day", serviceDay);
      }

      const { data: candidates } = await exQuery;

      // Cross-reference: count those whose order_line key is in our set
      return (candidates ?? []).filter((ex) =>
        lineKeys.has(
          `${ex.order_batch_id}\x00${ex.employee_ref}\x00${ex.service_day}`,
        ),
      ).length;
    }
    // Fall through to raw_value matching if menu_item_id lookup failed
  }

  // ── Default: raw_value matching (meal exceptions + protein fallback) ───────
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
 * All published menu items for a customer for the whole service week that
 * contains `serviceWeekStart` (a Monday YYYY-MM-DD).
 *
 * Returns items from the applicable published menu version — either the version
 * the customer is assigned to for this week, or the latest published global menu
 * for this week, or the latest global menu of any week as a last resort.
 *
 * All returned items carry `menuSource` ("assigned" | "general") so callers can
 * show users where the data comes from.
 */
export async function fetchMenuItemsForWeek(
  customerDisplayName: string,
  serviceWeekStart: string,
): Promise<AvonMenuItem[]> {
  return fetchMenuItems(customerDisplayName, serviceWeekStart);
}

/**
 * Published menu items for a customer on the weekday matching `serviceDay`.
 *
 * Derives the service week start (Monday) from `serviceDay`, resolves the
 * correct published menu version for that week, then filters to the day's items.
 * Returns an empty array when the service day falls on a weekend.
 */
export async function fetchMenuItemsForServiceDay(
  customerDisplayName: string,
  serviceDay: string,
): Promise<AvonMenuItem[]> {
  const day = serviceDayToAvonDay(serviceDay);
  if (!day) return [];
  const serviceWeekStart = getMondayOfWeek(serviceDay);
  const items = await fetchMenuItems(customerDisplayName, serviceWeekStart);
  return items.filter((item) => item.day_of_week === day);
}

/**
 * All protein vocabulary entries for a customer (all days).
 * The caller can filter by day_of_week as needed.
 * Re-exported here so the exceptions page has a single import point.
 */
export async function fetchAllProteinsForCustomer(
  customerDisplayName: string,
): Promise<MenuVocabItem[]> {
  return fetchProteins(customerDisplayName);
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
