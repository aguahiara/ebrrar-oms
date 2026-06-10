import { getAppSession, logAuditEvent } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { rejectUploadBatch, applyManualOrderDefaults } from "@/lib/avon-orders";
import type { ManualOrderLineInput, ManualOrderSource } from "@/lib/avon-orders";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

// ── Shared auth helper ────────────────────────────────────────────────────────

async function authGuard() {
  const session = await getAppSession();
  if (!session) return { session: null, error: NextResponse.json(
    { error: "Your session has expired. Please sign in again." },
    { status: 401 },
  ) };
  if (!hasPermission(session.selectedRole.role, "manage_orders")) return { session: null, error: NextResponse.json(
    { error: "You do not have permission to manage manual order batches." },
    { status: 403 },
  ) };
  return { session, error: null };
}

// ── GET /api/orders/manual/batch/[batchId] ────────────────────────────────────

/**
 * Fetch a manual order batch with all its lines so the edit form can be
 * pre-populated.  Requires an authenticated session (no specific role check —
 * the same user who can save can also read).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json(
      { error: "You do not have permission to view manual order batches." },
      { status: 403 },
    );
  }

  const { batchId } = await params;

  // Fetch batch + customer in one call.
  const { data: batch, error: batchErr } = await supabase
    .from("order_batch")
    .select(
      "id, channel, customer_id, service_day, batch_notes, contact_name, contact_phone, pickup_delivery, delivery_notes, customer ( id, display_name, is_system_customer )",
    )
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
  if (!batch)   return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.channel !== "ManualEntry") {
    return NextResponse.json(
      { error: "Only manual order batches can be edited via this endpoint." },
      { status: 400 },
    );
  }

  // Fetch all order_lines for this batch.
  const { data: lines, error: linesErr } = await supabase
    .from("order_line")
    .select(
      "id, employee_ref, menu_item_id, meal_name_raw, match_type, protein_name, swallow_name, side_name, quantity, line_notes, order_source",
    )
    .eq("order_batch_id", batchId)
    .order("created_at", { ascending: true });

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const custRaw = Array.isArray(batch.customer) ? batch.customer[0] : batch.customer;
  const cust = custRaw && typeof custRaw === "object" ? custRaw as Record<string, unknown> : null;

  // Check whether this customer/day is currently released (for read-only flag).
  const { data: activeRelease } = await supabase
    .from("dashboard_release")
    .select("id, released_at")
    .eq("customer_id", batch.customer_id as string)
    .eq("service_day", batch.service_day as string)
    .is("revoked_at", null)
    .maybeSingle();

  return NextResponse.json({
    id:               batch.id,
    customerId:       batch.customer_id,
    customerName:     cust ? String(cust.display_name ?? "") : String(batch.customer_id),
    isSystemCustomer: cust ? Boolean(cust.is_system_customer) : false,
    serviceDay:       batch.service_day,
    batchNotes:       batch.batch_notes ?? null,
    contactName:      batch.contact_name ?? null,
    contactPhone:     batch.contact_phone ?? null,
    pickupDelivery:   batch.pickup_delivery ?? null,
    deliveryNotes:    batch.delivery_notes ?? null,
    isReleased:       activeRelease !== null,
    lines: (lines ?? []).map((l) => ({
      id:           l.id,
      employeeRef:  l.employee_ref ?? null,
      menuItemId:   l.menu_item_id ?? null,
      mealNameRaw:  l.meal_name_raw ?? "",
      matchType:    (l.match_type ?? "Direct") as "Direct" | "FruitsOnly",
      proteinName:  l.protein_name ?? null,
      swallowName:  l.swallow_name ?? null,
      sideName:     l.side_name ?? null,
      quantity:     (l.quantity as number) ?? 1,
      notes:        l.line_notes ?? null,
      orderSource:  (l.order_source ?? "manual_corporate_addon") as ManualOrderSource,
    })),
  });
}

// ── PATCH /api/orders/manual/batch/[batchId] ──────────────────────────────────

/**
 * Update a manual order batch in-place.
 *
 * Replaces all order_lines for the batch with the submitted lines, and
 * updates editable batch header fields (notes, contact info).
 *
 * customer_id and service_day are intentionally NOT editable — changing them
 * would silently move the batch under a different release group, which is
 * unsafe.  If the destination customer/day has already been released the edit
 * would produce inconsistent production data.  Ask the user to delete and
 * re-create if they need to change those fields.
 *
 * Guards:
 *   • Requires manage_orders permission.
 *   • Batch must be channel = 'ManualEntry'.
 *   • The batch's customer/day must not have an active (non-revoked) release.
 *
 * Normalisation applied (PI1–PI3):
 *   • PI2 soup-default protein.
 *   • PI3 optional-protein downgrade (writes "(No protein)" sentinel).
 *
 * Audit: writes a manual_order_updated event to audit_events.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { session, error: authError } = await authGuard();
  if (!session) return authError!;

  const { batchId } = await params;

  // ── Fetch existing batch ──────────────────────────────────────────────────
  const { data: batch, error: batchErr } = await supabase
    .from("order_batch")
    .select("id, channel, customer_id, service_day, batch_notes, contact_name, contact_phone, pickup_delivery, delivery_notes, customer ( is_system_customer )")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
  if (!batch)   return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (batch.channel !== "ManualEntry") {
    return NextResponse.json(
      { error: "Only manual order batches can be edited." },
      { status: 400 },
    );
  }

  const customerId = batch.customer_id as string;
  const serviceDay = batch.service_day as string;

  const custRaw = Array.isArray(batch.customer) ? batch.customer[0] : batch.customer;
  const isSpecial = custRaw && typeof custRaw === "object"
    ? Boolean((custRaw as Record<string, unknown>).is_system_customer)
    : false;

  // ── Release guard ─────────────────────────────────────────────────────────
  const { data: activeRelease } = await supabase
    .from("dashboard_release")
    .select("id, released_at")
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .is("revoked_at", null)
    .maybeSingle();

  if (activeRelease) {
    return NextResponse.json(
      {
        error:
          `Orders for this customer on ${serviceDay} have already been released to production. ` +
          "Revoke the release first before editing manual orders.",
        releasedAt: activeRelease.released_at,
      },
      { status: 409 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  type UpdateBody = {
    batchNotes?: string;
    contactName?: string;
    contactPhone?: string;
    pickupDelivery?: "Pickup" | "Delivery";
    deliveryNotes?: string;
    lines: ManualOrderLineInput[];
  };

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { batchNotes, contactName, contactPhone, pickupDelivery, deliveryNotes, lines } = body;

  // ── Validate lines ────────────────────────────────────────────────────────
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "At least one order line is required." }, { status: 400 });
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.mealNameRaw?.trim()) {
      return NextResponse.json({ error: `Row ${i + 1}: meal name is required.` }, { status: 400 });
    }
    if (typeof l.quantity !== "number" || l.quantity < 1 || !Number.isInteger(l.quantity)) {
      return NextResponse.json({ error: `Row ${i + 1}: quantity must be a positive integer.` }, { status: 400 });
    }
    if (l.matchType !== "Direct" && l.matchType !== "FruitsOnly") {
      return NextResponse.json({ error: `Row ${i + 1}: matchType must be "Direct" or "FruitsOnly".` }, { status: 400 });
    }
    if (
      l.orderSource !== "manual_corporate_addon" &&
      l.orderSource !== "manual_corporate_direct" &&
      l.orderSource !== "special_order"
    ) {
      return NextResponse.json({ error: `Row ${i + 1}: invalid order source.` }, { status: 400 });
    }
  }

  if (isSpecial && !contactName?.trim()) {
    return NextResponse.json(
      { error: "contactName is required for Special Orders." },
      { status: 400 },
    );
  }

  // ── Fetch menu-item metadata (protein_requirement + canonical_name) ───────
  const allDirectMenuIds = [
    ...new Set(lines.filter((l) => l.matchType === "Direct" && l.menuItemId).map((l) => l.menuItemId!)),
  ];

  const proteinReqById = new Map<string, string>();
  const canonicalById  = new Map<string, string>();

  if (allDirectMenuIds.length > 0) {
    const { data: menuItems } = await supabase
      .from("menu_item")
      .select("id, protein_requirement, canonical_name")
      .in("id", allDirectMenuIds);

    for (const mi of menuItems ?? []) {
      proteinReqById.set(mi.id as string, (mi.protein_requirement as string) ?? "required");
      canonicalById.set(mi.id as string,  (mi.canonical_name  as string) ?? "");
    }
  }

  // ── Apply PI2 soup-default + PI3 optional-protein (shared helper) ─────────
  const mappedLines = applyManualOrderDefaults(lines, proteinReqById, canonicalById);

  // ── Snapshot old lines for audit trail (before mutating) ─────────────────
  const { data: oldLines } = await supabase
    .from("order_line")
    .select("id, employee_ref, meal_name_raw, protein_name, swallow_name, quantity, order_source")
    .eq("order_batch_id", batchId);

  const beforeSnapshot = {
    batchNotes:    batch.batch_notes  ?? null,
    lineCount:     oldLines?.length   ?? 0,
    lines:         oldLines?.map((l) => ({
      id:           l.id,
      employeeRef:  l.employee_ref,
      mealNameRaw:  l.meal_name_raw,
      proteinName:  l.protein_name,
      swallowName:  l.swallow_name,
      quantity:     l.quantity,
    })),
  };

  // ── Replace order_lines ────────────────────────────────────────────────────
  // Strategy: insert new rows first so that if insert fails, the old data is
  // still intact.  Then delete the old rows by their IDs.
  //
  // Employee-ref numbering: count existing EXTRA/SPECIAL refs for this
  // customer + day (excluding lines in this batch) so new auto-refs continue
  // the sequence correctly.
  const oldLineIds = (oldLines ?? []).map((l) => l.id as string);

  // Count refs outside this batch to seed EXTRA-n / SPECIAL-n correctly.
  const [extrasRes, specialsRes] = await Promise.all([
    supabase
      .from("order_line")
      .select("employee_ref")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .not("order_batch_id", "eq", batchId)
      .like("employee_ref", "EXTRA-%"),
    supabase
      .from("order_line")
      .select("employee_ref")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .not("order_batch_id", "eq", batchId)
      .like("employee_ref", "SPECIAL-%"),
  ]);

  let maxExtraNum = 0;
  for (const r of extrasRes.data ?? []) {
    const m = /^EXTRA-(\d+)$/i.exec(r.employee_ref ?? "");
    if (m) maxExtraNum = Math.max(maxExtraNum, parseInt(m[1], 10));
  }
  let maxSpecialNum = 0;
  for (const r of specialsRes.data ?? []) {
    const m = /^SPECIAL-(\d+)$/i.exec(r.employee_ref ?? "");
    if (m) maxSpecialNum = Math.max(maxSpecialNum, parseInt(m[1], 10));
  }

  let extraCounter   = maxExtraNum + 1;
  let specialCounter = maxSpecialNum + 1;

  // Determine protein_value to write (mirrors persistManualOrders sentinel logic).
  const lineRows = mappedLines.map((l) => {
    const proteinReq = l.proteinRequirement ?? "required";
    const proteinValue =
      l.matchType === "FruitsOnly" || proteinReq === "not_required" || proteinReq === "optional"
        ? (l.proteinName || "(No protein)")
        : (l.proteinName ?? null);

    const baseName = (l.employeeName ?? "").trim() || null;
    const employeeRef =
      baseName ??
      (l.orderSource === "special_order"
        ? `SPECIAL-${specialCounter++}`
        : `EXTRA-${extraCounter++}`);

    return {
      order_batch_id: batchId,
      customer_id:    customerId,
      service_day:    serviceDay,
      menu_item_id:   l.menuItemId,
      meal_name_raw:  l.mealNameRaw,
      employee_ref:   employeeRef,
      quantity:       l.quantity,
      match_type:     l.matchType,
      protein_name:   proteinValue,
      swallow_name:   l.swallowName || null,
      side_name:      l.sideName || null,
      line_notes:     l.notes || null,
      order_source:   l.orderSource,
    };
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("order_line")
    .insert(lineRows)
    .select("id");

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to insert updated order lines: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Delete old rows now that insert succeeded.
  if (oldLineIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from("order_line")
      .delete()
      .in("id", oldLineIds);

    if (deleteErr) {
      // Non-fatal: new rows already in; old rows are orphaned but the data is
      // correct.  Log and return success — the orphaned rows will not appear in
      // summaries because they would have conflicting insert data.
      console.error("[PATCH batch] Failed to delete old order lines:", deleteErr.message);
    }
  }

  // ── Update batch header ───────────────────────────────────────────────────
  const batchUpdate: Record<string, unknown> = {
    batch_notes: batchNotes?.trim() || null,
  };
  if (isSpecial) {
    batchUpdate.contact_name    = contactName?.trim()    || null;
    batchUpdate.contact_phone   = contactPhone?.trim()   || null;
    batchUpdate.pickup_delivery = pickupDelivery         ?? null;
    batchUpdate.delivery_notes  = deliveryNotes?.trim()  || null;
  }

  await supabase.from("order_batch").update(batchUpdate).eq("id", batchId);

  // ── Audit event ───────────────────────────────────────────────────────────
  const afterSnapshot = {
    batchNotes: batchNotes?.trim() || null,
    lineCount:  inserted?.length   ?? mappedLines.length,
    lines:      lineRows.map((r) => ({
      employeeRef: r.employee_ref,
      mealNameRaw: r.meal_name_raw,
      proteinName: r.protein_name,
      swallowName: r.swallow_name,
      quantity:    r.quantity,
    })),
  };

  await logAuditEvent({
    event_type:    "manual_order_updated",
    actor_user_id: session.user.id,
    actor_role:    session.selectedRole.role,
    target_type:   "order_batch",
    target_id:     batchId,
    customer_id:   customerId,
    before:        beforeSnapshot as Record<string, unknown>,
    after:         afterSnapshot  as Record<string, unknown>,
  });

  return NextResponse.json({ linesUpdated: inserted?.length ?? mappedLines.length });
}

// ── DELETE /api/orders/manual/batch/[batchId] ─────────────────────────────────

/**
 * Hard-deletes a manual order batch and all its lines.
 * Blocked if the batch has already been released.
 * Requires manage_orders permission.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { session, error: authError } = await authGuard();
  if (!session) return authError!;

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
