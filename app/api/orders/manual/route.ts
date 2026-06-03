import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isCalendarDate } from "@/lib/calendar-date";
import { persistManualOrders } from "@/lib/avon-orders";
import type { ManualOrderLine, ManualOrderSource } from "@/lib/avon-orders";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

// ── Request body types ────────────────────────────────────────────────────────

type ManualOrderLineInput = {
  menuItemId: string | null;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  proteinName?: string | null;
  swallowName?: string | null;
  sideName?: string | null;
  quantity: number;
  notes?: string | null;
  orderSource: ManualOrderSource;
};

type SaveManualOrdersBody = {
  customerId: string;
  serviceDay: string;
  batchNotes?: string;
  // Special order fields
  contactName?: string;
  contactPhone?: string;
  pickupDelivery?: "Pickup" | "Delivery";
  deliveryNotes?: string;
  lines: ManualOrderLineInput[];
};

// ── Validation helper ─────────────────────────────────────────────────────────

function validateLines(lines: ManualOrderLineInput[]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "At least one order line is required.";
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.mealNameRaw?.trim()) {
      return `Row ${i + 1}: meal name is required.`;
    }
    if (typeof line.quantity !== "number" || line.quantity < 1 || !Number.isInteger(line.quantity)) {
      return `Row ${i + 1}: quantity must be a positive integer.`;
    }
    if (
      line.orderSource !== "manual_corporate_addon" &&
      line.orderSource !== "manual_corporate_direct" &&
      line.orderSource !== "special_order"
    ) {
      return `Row ${i + 1}: invalid order source.`;
    }
    if (line.matchType !== "Direct" && line.matchType !== "FruitsOnly") {
      return `Row ${i + 1}: matchType must be "Direct" or "FruitsOnly".`;
    }
  }
  return null;
}

// ── POST handler ──────────────────────────────────────────────────────────────

/**
 * POST /api/orders/manual
 *
 * Persists manually entered orders for a specific customer + service day.
 * Requires manage_orders permission.
 * Returns 409 if the customer/day has already been released.
 */
export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: SaveManualOrdersBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customerId, serviceDay, batchNotes, contactName, contactPhone, pickupDelivery, deliveryNotes, lines } = body;

  // ── Basic validation ──────────────────────────────────────────────────────
  if (!customerId || typeof customerId !== "string") {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }
  if (!serviceDay || !isCalendarDate(serviceDay)) {
    return NextResponse.json(
      { error: "serviceDay must be a valid YYYY-MM-DD date" },
      { status: 400 },
    );
  }

  const lineError = validateLines(lines);
  if (lineError) {
    return NextResponse.json({ error: lineError }, { status: 400 });
  }

  // ── Verify customer exists ────────────────────────────────────────────────
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

  // ── Special order contact fields required when saving to Special Orders ──
  const isSpecial = customer.is_system_customer === true;
  if (isSpecial && !contactName?.trim()) {
    return NextResponse.json(
      { error: "contactName is required for Special Orders" },
      { status: 400 },
    );
  }

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
          `Orders for ${customer.display_name} on ${serviceDay} have already been released to production. ` +
          "Revoke the release first before adding manual orders.",
        releasedAt: activeRelease.released_at,
      },
      { status: 409 },
    );
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    const mappedLines: ManualOrderLine[] = lines.map((l) => ({
      menuItemId: l.menuItemId ?? null,
      mealNameRaw: l.mealNameRaw.trim(),
      matchType: l.matchType,
      proteinName: l.proteinName ?? null,
      swallowName: l.swallowName ?? null,
      sideName: l.sideName ?? null,
      quantity: l.quantity,
      notes: l.notes ?? null,
      orderSource: l.orderSource,
    }));

    const result = await persistManualOrders({
      customerId,
      serviceDay,
      createdBy: session.user.id,
      batchNotes: batchNotes ?? undefined,
      contactName: contactName ?? undefined,
      contactPhone: contactPhone ?? undefined,
      pickupDelivery: pickupDelivery ?? undefined,
      deliveryNotes: deliveryNotes ?? undefined,
      lines: mappedLines,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
