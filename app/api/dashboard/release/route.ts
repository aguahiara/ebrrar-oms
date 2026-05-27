import { isCalendarDate } from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type ReleaseBody = {
  customer?: string;
  serviceDay?: string;
  action?: "release" | "acceptAllAndRelease";
  reason?: string;
};

export async function POST(request: Request) {
  try {
    const { customer, serviceDay, action, reason } =
      (await request.json()) as ReleaseBody;

    if (!customer || !serviceDay || !isCalendarDate(serviceDay) || !action) {
      return NextResponse.json(
        { error: "customer, valid serviceDay, and action are required." },
        { status: 400 },
      );
    }

    const { data: customerRow } = await supabase
      .from("customer")
      .select("id")
      .eq("display_name", customer)
      .maybeSingle();

    if (!customerRow) {
      return NextResponse.json(
        { error: `Customer ${customer} not found.` },
        { status: 404 },
      );
    }
    const customerId = customerRow.id;

    if (action === "acceptAllAndRelease") {
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { error: "A reason is required to accept exceptions as-is." },
          { status: 400 },
        );
      }

      const { error: acceptError } = await supabase
        .from("order_exception")
        .update({
          status: "AcceptedAsIs",
          resolution_reason: reason.trim(),
          resolved_by: "operator",
          resolved_at: new Date().toISOString(),
        })
        .eq("customer_id", customerId)
        .eq("service_day", serviceDay)
        .eq("status", "Open");

      if (acceptError) {
        throw new Error(`Failed to accept exceptions: ${acceptError.message}`);
      }
    }

    // Block release while any exceptions remain open for this customer + day.
    const { count: openCount, error: countError } = await supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("status", "Open");

    if (countError) {
      throw new Error(`Failed to check exceptions: ${countError.message}`);
    }

    if ((openCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot release: ${openCount} open exception(s) remain. Resolve them or accept all as-is.`,
          openCount,
        },
        { status: 409 },
      );
    }

    const { error: releaseError } = await supabase
      .from("dashboard_release")
      .upsert(
        {
          customer_id: customerId,
          service_day: serviceDay,
          released_by: "operator",
          reason: reason?.trim() ?? null,
          released_at: new Date().toISOString(),
        },
        { onConflict: "customer_id,service_day" },
      );

    if (releaseError) {
      throw new Error(`Failed to release dashboard: ${releaseError.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Release failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
