import { isCalendarDate } from "@/lib/calendar-date";
import { getAppSession, logAuditEvent } from "@/lib/auth";
import { checkPortionReadiness } from "@/lib/portion-readiness";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type ReleaseBody = {
  customer?: string;
  serviceDay?: string;
  action?: "release" | "acceptAllAndRelease" | "revoke";
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

    // ── Resolve customer name → ID ─────────────────────────────────────────
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
    const customerId = customerRow.id as string;

    // ── Fetch existing release record (active OR revoked) ──────────────────
    // We always need this row for both release guards and revoke logic.
    const { data: existingRelease, error: existingReleaseError } =
      await supabase
        .from("dashboard_release")
        .select("id, released_at, revoked_at")
        .eq("customer_id", customerId)
        .eq("service_day", serviceDay)
        .maybeSingle();

    if (existingReleaseError)
      throw new Error(
        `Failed to check release status: ${existingReleaseError.message}`,
      );

    // ── REVOKE action — Super Admin only ───────────────────────────────────
    if (action === "revoke") {
      if (session.selectedRole.role !== "ebrrar_super_admin") {
        return NextResponse.json(
          { error: "Only Super Admins can revoke a release." },
          { status: 403 },
        );
      }

      if (!reason?.trim()) {
        return NextResponse.json(
          { error: "A reason is required to revoke a release." },
          { status: 400 },
        );
      }

      // Must have a currently-active (non-revoked) release to revoke
      if (!existingRelease || existingRelease.revoked_at !== null) {
        return NextResponse.json(
          {
            error:
              "No active release found for this customer and service day.",
          },
          { status: 404 },
        );
      }

      const now = new Date().toISOString();

      const { error: revokeErr } = await supabase
        .from("dashboard_release")
        .update({
          revoked_at: now,
          revoked_by: session.user.email,
          revoke_reason: reason.trim(),
        })
        .eq("id", existingRelease.id);

      if (revokeErr)
        throw new Error(`Failed to revoke release: ${revokeErr.message}`);

      // Mark any saved production quantity runs for this service day as
      // Superseded so the kitchen knows to regenerate.
      await supabase
        .from("production_quantity_runs")
        .update({ status: "Superseded" })
        .eq("service_day", serviceDay)
        .neq("status", "Superseded");

      // Permanent audit record — preserved even when the release row is
      // later overwritten on re-release.
      await logAuditEvent({
        event_type: "release_revoked",
        actor_user_id: session.user.id,
        actor_role: session.selectedRole.role,
        target_type: "dashboard_release",
        target_id: existingRelease.id as string,
        customer_id: customerId,
        before: { released_at: existingRelease.released_at },
        after: { revoked_at: now, revoke_reason: reason.trim() },
      });

      return NextResponse.json({ ok: true });
    }

    // ── Guard 0: reject if currently released and NOT revoked ─────────────
    if (existingRelease && existingRelease.revoked_at === null) {
      return NextResponse.json(
        {
          error: `Already released. ${customer} was released for ${serviceDay} on ${new Date(existingRelease.released_at as string).toLocaleString()}.`,
          alreadyReleased: true,
        },
        { status: 409 },
      );
    }

    // ── Guard 1: must have at least one order for this day ────────────────
    const { count: orderCount, error: orderCountError } = await supabase
      .from("order_line")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay);

    if (orderCountError)
      throw new Error(
        `Failed to check order count: ${orderCountError.message}`,
      );

    if ((orderCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: `Cannot release: no orders found for ${customer} on ${serviceDay}.`,
        },
        { status: 409 },
      );
    }

    // ── acceptAllAndRelease: bulk-accept open exceptions first ────────────
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

    // ── Guard 2: no open exceptions may remain ────────────────────────────
    const { count: openCount, error: openCountError } = await supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("status", "Open");

    if (openCountError)
      throw new Error(
        `Failed to check exceptions: ${openCountError.message}`,
      );

    if ((openCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Cannot release: ${openCount} open exception${openCount !== 1 ? "s" : ""} remain. Resolve them or accept all as-is.`,
          openCount,
        },
        { status: 409 },
      );
    }

    // ── Guard 3: no unreconciled order lines (menu_item_id IS NULL) ───────
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

    // ── Guard 4: no order lines with missing protein ───────────────────────
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

    // ── Guard 5: portion profile readiness ────────────────────────────────
    // Must run after the order-data guards so we only hit the profile lookup
    // when orders are clean.  Reuses the same logic as Kitchen Quantities so
    // release validation and quantity generation never disagree.
    const portionReadiness = await checkPortionReadiness(
      customerId,
      customer,
      serviceDay,
    );

    if (portionReadiness.status !== "ready") {
      return NextResponse.json(
        { error: portionReadiness.message, portionReadiness },
        { status: 409 },
      );
    }

    // ── Snapshot: total exceptions at release time (for audit) ────────────
    const { count: totalExceptionCount } = await supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay);

    const releasePayload = {
      customer_id: customerId,
      service_day: serviceDay,
      released_by: session.user.email,
      reason: reason?.trim() ?? null,
      released_at: new Date().toISOString(),
      meal_count: orderCount,
      exception_count: totalExceptionCount ?? 0,
      // Clear any revocation data from a previous revoke on this row
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
    };

    // ── Release ────────────────────────────────────────────────────────────
    // If a revoked row exists for this customer+day, UPDATE it (the unique
    // constraint on (customer_id, service_day) prevents a second INSERT).
    // Otherwise INSERT a fresh record.
    let releaseError: { message: string } | null = null;

    if (existingRelease) {
      // Re-release after revoke: update the existing row in place.
      const { error } = await supabase
        .from("dashboard_release")
        .update(releasePayload)
        .eq("id", existingRelease.id);
      releaseError = error;
    } else {
      const { error } = await supabase
        .from("dashboard_release")
        .insert(releasePayload);
      releaseError = error;
    }

    if (releaseError)
      throw new Error(`Failed to release dashboard: ${releaseError.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Release failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
