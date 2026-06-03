import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { rejectUploadBatch } from "@/lib/avon-orders";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

/**
 * DELETE /api/orders/manual/batch/[batchId]
 *
 * Hard-deletes a manual order batch and all its lines.
 * Blocked if the batch has already been released.
 * Requires manage_orders permission.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId } = await params;

  // Verify the batch is a manual entry batch, not an upload batch.
  const { data: batch, error: batchErr } = await supabase
    .from("order_batch")
    .select("id, channel, customer_id, service_day")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) {
    return NextResponse.json({ error: batchErr.message }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.channel !== "ManualEntry") {
    return NextResponse.json(
      { error: "This endpoint only deletes manual order batches. Use the upload reject endpoint for uploaded batches." },
      { status: 400 },
    );
  }

  try {
    // rejectUploadBatch already checks for an active release and throws if found.
    const result = await rejectUploadBatch(batchId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Release guard throws with a specific message — surface it clearly.
    if (msg.includes("already been released")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
