import { isCalendarDate } from "@/lib/calendar-date";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

type ReleaseBody = {
  customer?: string;
  serviceDay?: string;
  action?: "release" | "acceptAllAndRelease";
  reason?: string;
};

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { customer, serviceDay, action, reason } =
      (await request.json()) as ReleaseBody;

    if (!customer || !serviceDay || !isCalendarDate(serviceDay) || !action) {
      return NextResponse.json(
        { error: "customer, valid serviceDay, and action are required." },
        { status: 400 },
      );
    }

    // ── Resolve customer name → ID ────────────────────────────────────────────
    const { data: customerRow } = await supabase
      .from("customer")
      .select("id")
      .eq("display_name", customer)
      .maybeSingle();

    if (!customerRow) {
      return NextResponse.json(
        { error: `Customer "${customer}" not found.` },
        { status: 404 },
      );
    }
    const customerId = customerRow.id;

    // ── Guard 0: reject if already released for this day ─────────────────────
    // Checked before all other guards so the caller always gets a clear "already
    // released" message rather than a misleading data-integrity error.
    const { data: existingRelease, error: existingReleaseError } = await supabase
      .from("dashboard_release")
      .select("id, released_at")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .maybeSingle();

    if (existingReleaseError)
      throw new Error(
        `Failed to check release status: ${existingReleaseError.message}`,
      );

    if (existingRelease) {
      return NextResponse.json(
        {
          error: `Already released. ${customer} was released for ${serviceDay} on ${new Date(existingRelease.released_at as string).toLocaleString()}.`,
          alreadyReleased: true,
        },
        { status: 409 },
      );
    }

    // ── Guard 1: must have at least one order for this day ───────────────────
    const { count: orderCount, error: orderCountError } = await supabase
      .from("order_line")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay);

    if (orderCountError)
      throw new Error(`Failed to check order count: ${orderCountError.message}`);

    if ((orderCount ?? 0) === 0) {
      return NextResponse.json(
        { error: `Cannot release: no orders found for ${customer} on ${serviceDay}.` },
        { status: 409 },
      );
    }

    // ── acceptAllAndRelease: accept every open exception first ────────────────
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

      if (acceptError)
        throw new Error(`Failed to accept exceptions: ${acceptError.message}`);
    }

    // ── Guard 2: no open exceptions may remain ───────────────────────────────
    const { count: openCount, error: openCountError } = await supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("status", "Open");

    if (openCountError)
      throw new Error(`Failed to check exceptions: ${openCountError.message}`);

    if ((openCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot release: ${openCount} open exception${openCount !== 1 ? "s" : ""} remain. Resolve them or accept all as-is.`,
          openCount,
        },
        { status: 409 },
      );
    }

    // ── Guard 3: no unreconciled order lines (menu_item_id IS NULL) ──────────
    const { count: unmatchedCount, error: unmatchedError } = await supabase
      .from("order_line")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .is("menu_item_id", null);

    if (unmatchedError)
      throw new Error(
        `Failed to check unmatched orders: ${unmatchedError.message}`,
      );

    if ((unmatchedCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot release: ${unmatchedCount} unreconciled order line${unmatchedCount !== 1 ? "s" : ""} remain. All orders must be matched to a menu item.`,
          unmatchedCount,
        },
        { status: 409 },
      );
    }

    // ── Guard 4: no order lines with missing protein ──────────────────────────
    const { count: missingProteinCount, error: proteinError } = await supabase
      .from("order_line")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .is("protein_name", null);

    if (proteinError)
      throw new Error(`Failed to check protein data: ${proteinError.message}`);

    if ((missingProteinCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot release: ${missingProteinCount} order line${missingProteinCount !== 1 ? "s" : ""} are missing protein data. Ensure all orders have a protein assigned.`,
          missingProteinCount,
        },
        { status: 409 },
      );
    }

    // ── Snapshot: total exceptions at release time (for audit) ───────────────
    const { count: totalExceptionCount } = await supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay);

    // ── Release ───────────────────────────────────────────────────────────────
    // Use INSERT (not upsert): Guard 0 above confirmed no record exists.
    const { error: releaseError } = await supabase
      .from("dashboard_release")
      .insert({
        customer_id: customerId,
        service_day: serviceDay,
        released_by: "operator",
        reason: reason?.trim() ?? null,
        released_at: new Date().toISOString(),
        meal_count: orderCount,
        exception_count: totalExceptionCount ?? 0,
      });

    if (releaseError)
      throw new Error(`Failed to release dashboard: ${releaseError.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Release failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
