import { getAppSession } from "@/lib/auth";
import { fetchMenuItems, fetchProteins, fetchSwallows } from "@/lib/avon-menu";
import { addCalendarDays, isCalendarDate, parseCalendarDate } from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";
import type { DayOfWeek } from "@/lib/order-types";
import { NextResponse } from "next/server";

const ISO_DOW_TO_NAME: Record<number, DayOfWeek> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

/** Compute the Monday of the ISO week containing a given calendar date. */
function mondayOfWeek(dateStr: string): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const d = new Date(year, month - 1, day);
  const iso = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const offset = iso === 0 ? -6 : 1 - iso;
  return addCalendarDays(dateStr, offset);
}

/**
 * GET /api/orders/manual/menu?customerId=<uuid>&serviceDay=<YYYY-MM-DD>
 *
 * Returns the applicable menu items, proteins, and swallows for the selected
 * customer + service day.  All items for the full week are returned; the client
 * uses dayOfWeek to filter to the specific day's options.
 */
export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const serviceDay = searchParams.get("serviceDay");

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }
  if (!serviceDay || !isCalendarDate(serviceDay)) {
    return NextResponse.json(
      { error: "serviceDay must be a valid YYYY-MM-DD date" },
      { status: 400 },
    );
  }

  // Resolve customer display name (needed by the menu fetch functions).
  const { data: customer, error: custErr } = await supabase
    .from("customer")
    .select("id, display_name, is_system_customer")
    .eq("id", customerId)
    .neq("status", "Inactive")
    .maybeSingle();

  if (custErr) {
    return NextResponse.json({ error: custErr.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Compute the day-of-week name and the week start (Monday).
  const { year, month, day } = parseCalendarDate(serviceDay);
  const d = new Date(year, month - 1, day);
  const isoDow = d.getDay();
  const dayOfWeek = ISO_DOW_TO_NAME[isoDow];

  if (!dayOfWeek) {
    return NextResponse.json(
      { error: "Service day must be a weekday (Mon–Fri)" },
      { status: 400 },
    );
  }

  const serviceWeekStart = mondayOfWeek(serviceDay);

  const [menuItems, proteins, swallows] = await Promise.all([
    fetchMenuItems(customer.display_name, serviceWeekStart),
    fetchProteins(customer.display_name, serviceWeekStart),
    fetchSwallows(customer.display_name, serviceWeekStart),
  ]);

  return NextResponse.json({
    customerId: customer.id,
    customerName: customer.display_name,
    isSystemCustomer: customer.is_system_customer ?? false,
    serviceDay,
    dayOfWeek,
    serviceWeekStart,
    menuItems: menuItems
      .filter((item) => item.day_of_week === dayOfWeek)
      .map((item) => ({
        id: item.id,
        canonicalName: item.canonical_name,
        proteinRequirement: item.protein_requirement,
      })),
    proteins: proteins
      .filter((p) => p.day_of_week === dayOfWeek)
      .map((p) => p.name),
    swallows: swallows
      .filter((s) => s.day_of_week === dayOfWeek)
      .map((s) => s.name),
  });
}
