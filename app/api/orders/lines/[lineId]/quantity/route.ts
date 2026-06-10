/**
 * PATCH /api/orders/lines/[lineId]/quantity
 *
 * Adjusts the quantity on a manual order line.
 *
 * Body: { quantity: number }  — must be ≥ 1
 *
 * Guards:
 *   • Authenticated + manage_orders permission.
 *   • No active release for the customer+day.
 *   • Line must not already be deleted.
 *   • Only manual order lines (order_source in ['manual_*', 'special_order'])
 *     support quantity edits. Bulk-upload lines always have qty=1 and should
 *     be removed individually, not quantity-adjusted.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAppSession, logAuditEvent } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> },
) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lineId } = await params;

  let newQty: number;
  try {
    const body = (await request.json()) as { quantity?: unknown };
    newQty = Number(body.quantity);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Number.isInteger(newQty) || newQty < 1) {
    return NextResponse.json(
      { error: "Quantity must be a whole number of at least 1." },
      { status: 400 },
    );
  }

  // ── 1. Load the order line ────────────────────────────────────────────────
  const { data: line, error: lineErr } = await supabase
    .from("order_line")
    .select("id, customer_id, service_day, order_source, quantity, deleted_at")
    .eq("id", lineId)
    .maybeSingle();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
  if (!line) return NextResponse.json({ error: "Order line not found." }, { status: 404 });
  if (line.deleted_at) {
    return NextResponse.json({ error: "Order has already been removed." }, { status: 409 });
  }

  const src = line.order_source as string | null;
  const isManual =
    src === "manual_corporate_addon" ||
    src === "manual_corporate_direct" ||
    src === "special_order";

  if (!isManual) {
    return NextResponse.json(
      { error: "Quantity can only be adjusted on manually-entered orders." },
      { status: 422 },
    );
  }

  const { customer_id: customerId, service_day: serviceDay } = line;

  // ── 2. Release guard ─────────────────────────────────────────────────────
  const { data: release } = await supabase
    .from("dashboard_release")
    .select("id")
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .is("revoked_at", null)
    .maybeSingle();

  if (release) {
    return NextResponse.json(
      {
        error:
          "This customer has already been released for production. Revoke the release before editing orders.",
        released: true,
      },
      { status: 409 },
    );
  }

  // ── 3. Update quantity ───────────────────────────────────────────────────
  const oldQty = Number(line.quantity) || 1;

  const { error: updateErr } = await supabase
    .from("order_line")
    .update({
      quantity: newQty,
      quantity_before: oldQty,
      quantity_after: newQty,
    })
    .eq("id", lineId);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // ── 4. Audit log ─────────────────────────────────────────────────────────
  await logAuditEvent({
    event_type: "order_line_quantity_updated",
    actor_user_id: session.user.id,
    actor_role: session.selectedRole.role,
    target_type: "order_line",
    target_id: lineId,
    customer_id: customerId,
    before: { quantity: oldQty },
    after: { quantity: newQty, service_day: serviceDay },
  });

  return NextResponse.json({ ok: true, oldQty, newQty });
}
