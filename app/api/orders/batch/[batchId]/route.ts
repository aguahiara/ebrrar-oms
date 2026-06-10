/**
 * DELETE /api/orders/batch/[batchId]
 *
 * Hard-deletes an entire order batch — all order_line and order_exception rows
 * for this batch are permanently removed, then the batch record itself.
 *
 * This route works for both uploaded batches (channel='ScheduleUpload') and
 * manually-entered batches (channel='ManualEntry').
 *
 * Body:
 *   reason  string  — one of the canonical reason keys (required)
 *   notes?  string  — optional free-text
 *
 * Guards:
 *   • Authenticated + manage_orders permission.
 *   • No active (non-revoked) release for the customer+day.
 *     If released → 409 with `released: true` flag.
 */
import { NextRequest, NextResponse } from "next/server";
import { rejectUploadBatch } from "@/lib/avon-orders";
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId } = await params;

  let reason: string, notes: string | undefined;
  try {
    const body = (await request.json()) as { reason?: string; notes?: string };
    reason = body.reason ?? "";
    notes = body.notes;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json(
      { error: "A valid removal reason is required." },
      { status: 400 },
    );
  }

  // Load batch metadata for audit before deletion
  const { data: batch, error: batchLoadErr } = await supabase
    .from("order_batch")
    .select("id, customer_id, service_day, channel, source_filename")
    .eq("id", batchId)
    .maybeSingle();

  if (batchLoadErr) return NextResponse.json({ error: batchLoadErr.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

  try {
    const { linesDeleted, exceptionsDeleted } = await rejectUploadBatch(batchId);

    await logAuditEvent({
      event_type: "order_batch_removed",
      actor_user_id: session.user.id,
      actor_role: session.selectedRole.role,
      target_type: "order_batch",
      target_id: batchId,
      customer_id: batch.customer_id as string,
      after: {
        service_day: batch.service_day,
        channel: batch.channel,
        source_filename: batch.source_filename ?? null,
        reason,
        notes: notes ?? null,
        lines_deleted: linesDeleted,
        exceptions_deleted: exceptionsDeleted,
      },
    });

    return NextResponse.json({ ok: true, linesDeleted, exceptionsDeleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove batch.";
    // Map the release-guard error to a 409 with a structured flag
    if (message.toLowerCase().includes("revoke the release")) {
      return NextResponse.json(
        {
          error:
            "This customer has already been released for production. Revoke the release before removing this batch.",
          released: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
