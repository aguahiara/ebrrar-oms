/**
 * POST /api/orders/lines/[lineId]/remove
 *
 * Soft-deletes one order_line and closes any open exceptions linked to it.
 *
 * Body:
 *   reason  string  — one of the canonical reason keys
 *   notes?  string  — optional free-text
 *   source? string  — 'order_review' | 'exceptions_page' (default 'order_review')
 *
 * Guards:
 *   • Caller must be authenticated and have manage_orders permission.
 *   • The customer+day must NOT have an active (non-revoked) release.
 *     If released, returns 409 with a message directing the user to revoke first.
 *   • The order_line must not already be deleted.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAppSession, logAuditEvent } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const VALID_REASONS = [
  "customer_cancelled",
  "duplicate_order",
  "wrong_customer",
  "wrong_service_date",
  "wrong_upload_file",
  "employee_no_longer_requires_meal",
  "incorrect_manual_entry",
  "other",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lineId: string }> },
) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lineId } = await params;

  let reason: string, notes: string | undefined, source: string;
  try {
    const body = (await request.json()) as {
      reason?: string;
      notes?: string;
      source?: string;
    };
    reason = body.reason ?? "";
    notes = body.notes;
    source = body.source ?? "order_review";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json(
      { error: "A valid removal reason is required." },
      { status: 400 },
    );
  }

  // ── 1. Load the order line ────────────────────────────────────────────────
  const { data: line, error: lineErr } = await supabase
    .from("order_line")
    .select("id, customer_id, service_day, order_batch_id, employee_ref, meal_name_raw, quantity, deleted_at")
    .eq("id", lineId)
    .maybeSingle();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
  if (!line) return NextResponse.json({ error: "Order line not found." }, { status: 404 });
  if (line.deleted_at) {
    return NextResponse.json({ error: "Order has already been removed." }, { status: 409 });
  }

  const { customer_id: customerId, service_day: serviceDay } = line;

  // ── 2. Release guard ─────────────────────────────────────────────────────
  const { data: release } = await supabase
    .from("dashboard_release")
    .select("id, released_at")
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .is("revoked_at", null)
    .maybeSingle();

  if (release) {
    return NextResponse.json(
      {
        error:
          "This customer has already been released for production. Revoke the release before removing orders.",
        released: true,
      },
      { status: 409 },
    );
  }

  // ── 3. Soft-delete the order line ────────────────────────────────────────
  const deletedAt = new Date().toISOString();
  const actorEmail = session.user.email;

  const { error: deleteErr } = await supabase
    .from("order_line")
    .update({
      deleted_at: deletedAt,
      deleted_by: actorEmail,
      delete_reason: reason,
      delete_notes: notes ?? null,
      deletion_source: source,
      deletion_scope: "individual",
    })
    .eq("id", lineId);

  if (deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  // ── 4. Close any linked open exceptions ──────────────────────────────────
  await supabase
    .from("order_exception")
    .update({
      status: "Resolved",
      resolved_by: actorEmail,
      resolved_at: deletedAt,
      resolution_reason: "order_removed",
    })
    .eq("order_batch_id", line.order_batch_id)
    .eq("employee_ref", line.employee_ref)
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .eq("status", "Open");

  // ── 5. Audit log ─────────────────────────────────────────────────────────
  await logAuditEvent({
    event_type: "order_line_removed",
    actor_user_id: session.user.id,
    actor_role: session.selectedRole.role,
    target_type: "order_line",
    target_id: lineId,
    customer_id: customerId,
    after: {
      service_day: serviceDay,
      reason,
      notes: notes ?? null,
      source,
      employee_ref: line.employee_ref,
      meal_name_raw: line.meal_name_raw,
    },
  });

  return NextResponse.json({ ok: true });
}
