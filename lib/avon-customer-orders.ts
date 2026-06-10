/**
 * lib/avon-customer-orders.ts
 *
 * Data-fetching helpers for the Daily Customer Order Details screen (PI5).
 *
 * Fetches all order_line rows for a given customer + service day, enriched
 * with menu item metadata, batch metadata, and active release status.
 */

import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderLineDetail = {
  id: string;
  employeeRef: string | null;
  mealNameRaw: string;
  /** Canonical menu item name, or null for FruitsOnly / unmatched. */
  canonicalName: string | null;
  /** Menu item category (e.g. "Main", "Swallow"). */
  category: string | null;
  swallowName: string | null;
  sideName: string | null;
  proteinName: string | null;
  quantity: number;
  matchType: string | null;
  orderSource: string | null;
  lineNotes: string | null;
  /** Which batch this line belongs to (for edit linking). */
  batchId: string;
  /** order_batch.channel — "ManualEntry" | "BulkUpload" | etc. */
  batchChannel: string;
  /** True when this line came from a manually-entered batch (not bulk upload). */
  isManual: boolean;
};

export type ReleaseStatus =
  | { state: "released"; releasedAt: string }
  | { state: "not_released" }
  | { state: "revoked"; revokedAt: string };

export type CustomerDayOrdersResult = {
  customerId: string;
  customerName: string;
  serviceDay: string;
  releaseStatus: ReleaseStatus;
  lines: OrderLineDetail[];
  /** Total number of line rows. */
  lineCount: number;
  /** Sum of all line quantities. */
  totalQuantity: number;
  /** Protein name → total quantity (excludes "(No protein)" sentinel). */
  proteinTotals: { protein: string; total: number }[];
  /** Swallow name → total quantity (non-null swallow lines only). */
  swallowTotals: { swallow: string; total: number }[];
  /** Canonical meal name → total quantity. */
  mealTotals: { meal: string; total: number }[];
  /**
   * Batches that are eligible for editing via the Manual Orders form.
   * A batch is eligible when:
   *   • channel = 'ManualEntry'
   *   • The customer+day is not released
   */
  editableBatchIds: string[];
  /** Summary of each unique order_batch for removal UI. */
  batches: BatchSummary[];
};

export type BatchSummary = {
  id: string;
  channel: string;
  sourceFilename: string | null;
  createdAt: string;
  createdBy: string | null;
  /** Active (non-deleted) lines in this batch for this customer+day. */
  lineCount: number;
  /** Open exceptions linked to this batch for this customer+day. */
  openExceptionCount: number;
};

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Fetches all order lines for a given customer + service day, together with
 * release status and aggregated totals.
 *
 * Returns null when the customer does not exist (caller should 404).
 */
export async function fetchCustomerDayOrders(
  customerId: string,
  serviceDay: string,
): Promise<CustomerDayOrdersResult | null> {
  // Four parallel queries: customer meta, order lines, release status, open exceptions.
  const [custRes, linesRes, releaseRes, exceptionsRes] = await Promise.all([
    supabase
      .from("customer")
      .select("id, display_name")
      .eq("id", customerId)
      .maybeSingle(),

    supabase
      .from("order_line")
      .select(
        `id,
         employee_ref,
         meal_name_raw,
         swallow_name,
         side_name,
         protein_name,
         quantity,
         match_type,
         order_source,
         line_notes,
         order_batch_id,
         menu_item ( canonical_name, category ),
         order_batch ( id, channel, source_filename, created_at, created_by )`,
      )
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .is("deleted_at", null)
      .order("order_batch_id")
      .order("id"),

    supabase
      .from("dashboard_release")
      .select("released_at, revoked_at")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Open exceptions per batch — needed for the batch-removal confirmation modal.
    supabase
      .from("order_exception")
      .select("order_batch_id")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .eq("status", "Open"),
  ]);

  if (custRes.error) throw new Error(`Customer fetch failed: ${custRes.error.message}`);
  if (!custRes.data) return null;
  if (linesRes.error) throw new Error(`Order lines fetch failed: ${linesRes.error.message}`);

  // Build a per-batch open-exception count map
  const openExByBatch = new Map<string, number>();
  for (const ex of exceptionsRes.data ?? []) {
    const bid = ex.order_batch_id as string;
    openExByBatch.set(bid, (openExByBatch.get(bid) ?? 0) + 1);
  }

  const customerName = custRes.data.display_name as string;

  // ── Determine release status ────────────────────────────────────────────
  let releaseStatus: ReleaseStatus;
  const rel = releaseRes.data;
  if (rel) {
    if (rel.revoked_at) {
      releaseStatus = { state: "revoked", revokedAt: rel.revoked_at as string };
    } else {
      releaseStatus = { state: "released", releasedAt: rel.released_at as string };
    }
  } else {
    releaseStatus = { state: "not_released" };
  }

  const isReleased = releaseStatus.state === "released";

  // ── Map raw DB rows to typed lines ─────────────────────────────────────
  const lines: OrderLineDetail[] = [];
  const proteinMap = new Map<string, number>();
  const swallowMap = new Map<string, number>();
  const mealMap = new Map<string, number>();
  const editableBatchIdsSet = new Set<string>();
  // Accumulate batch summaries keyed by batch id
  const batchSummaryMap = new Map<string, BatchSummary>();

  let totalQuantity = 0;

  for (const row of linesRes.data ?? []) {
    const r = row as Record<string, unknown>;

    // Resolve order_batch join
    const batchRaw = Array.isArray(r.order_batch) ? r.order_batch[0] : r.order_batch;
    const batchObj =
      batchRaw && typeof batchRaw === "object"
        ? (batchRaw as Record<string, unknown>)
        : null;
    const batchId  = String(batchObj?.id ?? r.order_batch_id ?? "");
    const batchChannel = String(batchObj?.channel ?? "");
    const isManual = batchChannel === "ManualEntry";

    // Resolve menu_item join
    const miRaw = Array.isArray(r.menu_item) ? r.menu_item[0] : r.menu_item;
    const miObj =
      miRaw && typeof miRaw === "object"
        ? (miRaw as Record<string, unknown>)
        : null;
    const canonicalName = miObj?.canonical_name ? String(miObj.canonical_name) : null;
    const category = miObj?.category ? String(miObj.category) : null;

    const qty = Math.max(1, Number(r.quantity) || 1);
    totalQuantity += qty;

    // Build/update batch summary (must be after qty is computed)
    if (!batchSummaryMap.has(batchId)) {
      batchSummaryMap.set(batchId, {
        id: batchId,
        channel: batchChannel,
        sourceFilename: batchObj?.source_filename ? String(batchObj.source_filename) : null,
        createdAt: batchObj?.created_at ? String(batchObj.created_at) : "",
        createdBy: batchObj?.created_by ? String(batchObj.created_by) : null,
        lineCount: 0,
        openExceptionCount: openExByBatch.get(batchId) ?? 0,
      });
    }
    batchSummaryMap.get(batchId)!.lineCount += qty;

    const protein = r.protein_name ? String(r.protein_name) : null;
    const swallow = r.swallow_name ? String(r.swallow_name) : null;

    // Protein totals — skip "(No protein)" sentinel
    if (protein && protein !== "(No protein)") {
      proteinMap.set(protein, (proteinMap.get(protein) ?? 0) + qty);
    }

    // Swallow totals
    if (swallow) {
      swallowMap.set(swallow, (swallowMap.get(swallow) ?? 0) + qty);
    }

    // Meal totals — prefer canonical name, fall back to raw
    const mealLabel = canonicalName ?? (r.meal_name_raw ? String(r.meal_name_raw) : "Unknown");
    mealMap.set(mealLabel, (mealMap.get(mealLabel) ?? 0) + qty);

    // Mark batch as editable if manual + not released
    if (isManual && !isReleased) {
      editableBatchIdsSet.add(batchId);
    }

    lines.push({
      id: String(r.id ?? ""),
      employeeRef: r.employee_ref ? String(r.employee_ref) : null,
      mealNameRaw: r.meal_name_raw ? String(r.meal_name_raw) : "",
      canonicalName,
      category,
      swallowName: swallow,
      sideName: r.side_name ? String(r.side_name) : null,
      proteinName: protein,
      quantity: qty,
      matchType: r.match_type ? String(r.match_type) : null,
      orderSource: r.order_source ? String(r.order_source) : null,
      lineNotes: r.line_notes ? String(r.line_notes) : null,
      batchId,
      batchChannel,
      isManual,
    });
  }

  const proteinTotals = [...proteinMap.entries()]
    .map(([protein, total]) => ({ protein, total }))
    .sort((a, b) => b.total - a.total);

  const swallowTotals = [...swallowMap.entries()]
    .map(([swallow, total]) => ({ swallow, total }))
    .sort((a, b) => b.total - a.total);

  const mealTotals = [...mealMap.entries()]
    .map(([meal, total]) => ({ meal, total }))
    .sort((a, b) => b.total - a.total);

  return {
    customerId,
    customerName,
    serviceDay,
    releaseStatus,
    lines,
    lineCount: lines.length,
    totalQuantity,
    proteinTotals,
    swallowTotals,
    mealTotals,
    editableBatchIds: [...editableBatchIdsSet],
    batches: [...batchSummaryMap.values()],
  };
}
