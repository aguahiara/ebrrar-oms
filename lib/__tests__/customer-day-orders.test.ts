/**
 * Tests for PI5 — Customer drill-down order detail screen.
 *
 * We test the pure helper logic that drives the detail page:
 *   1. Release status display logic
 *   2. Editable-batch eligibility (manual + not released)
 *   3. Protein display filtering ((No protein) sentinel → "none")
 *   4. Source label mapping
 *   5. Back-navigation label logic
 *   6. Totals aggregation
 *
 * Because fetchCustomerDayOrders uses Supabase (can't run in Vitest without mocks),
 * we mirror the relevant pure logic inline — the same pattern used by
 * soup-default-protein.test.ts and manual-order-edit.test.ts.
 */

import { describe, it, expect } from "vitest";
import type { ReleaseStatus } from "../avon-customer-orders";

// ─── 1. Release status display ────────────────────────────────────────────────

function releaseStatusLabel(status: ReleaseStatus): string {
  if (status.state === "released")    return "Released for Production";
  if (status.state === "revoked")     return "Release Revoked";
  return "Not Released";
}

describe("PI5 — Release status display", () => {
  it("released → 'Released for Production'", () => {
    const s: ReleaseStatus = { state: "released", releasedAt: "2026-06-07T10:00:00Z" };
    expect(releaseStatusLabel(s)).toBe("Released for Production");
  });

  it("not_released → 'Not Released'", () => {
    const s: ReleaseStatus = { state: "not_released" };
    expect(releaseStatusLabel(s)).toBe("Not Released");
  });

  it("revoked → 'Release Revoked'", () => {
    const s: ReleaseStatus = { state: "revoked", revokedAt: "2026-06-07T12:00:00Z" };
    expect(releaseStatusLabel(s)).toBe("Release Revoked");
  });
});

// ─── 2. Editable batch eligibility ───────────────────────────────────────────

/**
 * Mirrors the logic in fetchCustomerDayOrders:
 *   isManual && !isReleased → add to editableBatchIds
 */
function computeEditableBatches(
  batches: { id: string; channel: string }[],
  isReleased: boolean,
): Set<string> {
  const editable = new Set<string>();
  for (const b of batches) {
    if (b.channel === "ManualEntry" && !isReleased) {
      editable.add(b.id);
    }
  }
  return editable;
}

describe("PI5 — Editable batch eligibility", () => {
  const manualBatch = { id: "batch-1", channel: "ManualEntry" };
  const bulkBatch   = { id: "batch-2", channel: "BulkUpload" };

  it("Case 7: not released + manual batch → editable", () => {
    const editable = computeEditableBatches([manualBatch], false);
    expect(editable.has("batch-1")).toBe(true);
  });

  it("Case 6: released + manual batch → NOT editable", () => {
    const editable = computeEditableBatches([manualBatch], true);
    expect(editable.has("batch-1")).toBe(false);
  });

  it("bulk upload batch is never editable", () => {
    const editable = computeEditableBatches([bulkBatch], false);
    expect(editable.has("batch-2")).toBe(false);
  });

  it("mixed: only manual batch is editable, bulk is not", () => {
    const editable = computeEditableBatches([manualBatch, bulkBatch], false);
    expect(editable.has("batch-1")).toBe(true);
    expect(editable.has("batch-2")).toBe(false);
  });
});

// ─── 3. Protein display — (No protein) sentinel ───────────────────────────────

/**
 * Mirrors the rendering logic in <OrderTable>:
 * "(No protein)" → display "none"; real protein → display as-is; null → "—"
 */
function proteinDisplay(proteinName: string | null): string {
  if (proteinName === "(No protein)") return "none";
  if (proteinName) return proteinName;
  return "—";
}

describe("PI5 — Protein display (Case 9 & 10)", () => {
  it("Case 9: blank protein (sentinel) → displays 'none', not undefined/null", () => {
    expect(proteinDisplay("(No protein)")).toBe("none");
  });

  it("Case 10: Beef (soup default) → displays 'Beef'", () => {
    expect(proteinDisplay("Beef")).toBe("Beef");
  });

  it("null protein → displays '—'", () => {
    expect(proteinDisplay(null)).toBe("—");
  });

  it("explicit protein → displayed as-is", () => {
    expect(proteinDisplay("Chicken")).toBe("Chicken");
  });
});

// ─── 4. Source label mapping ──────────────────────────────────────────────────

function sourceLabel(orderSource: string | null, batchChannel: string): string {
  if (orderSource === "manual_corporate_addon")    return "Add-on";
  if (orderSource === "manual_corporate_direct")   return "Direct";
  if (orderSource === "special_order")             return "Special";
  if (orderSource === "bulk_upload" || batchChannel === "BulkUpload") return "Bulk";
  return orderSource ?? "—";
}

describe("PI5 — Source label", () => {
  it("manual_corporate_addon → 'Add-on'", () => {
    expect(sourceLabel("manual_corporate_addon", "ManualEntry")).toBe("Add-on");
  });

  it("manual_corporate_direct → 'Direct'", () => {
    expect(sourceLabel("manual_corporate_direct", "ManualEntry")).toBe("Direct");
  });

  it("special_order → 'Special'", () => {
    expect(sourceLabel("special_order", "ManualEntry")).toBe("Special");
  });

  it("bulk_upload → 'Bulk'", () => {
    expect(sourceLabel("bulk_upload", "BulkUpload")).toBe("Bulk");
  });

  it("null source with BulkUpload channel → 'Bulk'", () => {
    expect(sourceLabel(null, "BulkUpload")).toBe("Bulk");
  });
});

// ─── 5. Back navigation label ─────────────────────────────────────────────────

/**
 * Mirrors the backLabel computation in CustomerOrdersPage:
 *   from=order-review → "Back to Order Review"
 *   from=dashboard    → "Back to Dashboard"
 *   anything else     → "Back"
 */
function backLabel(from: string | undefined): string {
  if (from === "order-review") return "Back to Order Review";
  if (from === "dashboard")    return "Back to Dashboard";
  return "Back";
}

describe("PI5 — Back navigation (Cases 3 & 4)", () => {
  it("Case 3: from=dashboard → 'Back to Dashboard'", () => {
    expect(backLabel("dashboard")).toBe("Back to Dashboard");
  });

  it("Case 4: from=order-review → 'Back to Order Review'", () => {
    expect(backLabel("order-review")).toBe("Back to Order Review");
  });

  it("unknown from → 'Back'", () => {
    expect(backLabel(undefined)).toBe("Back");
    expect(backLabel("other")).toBe("Back");
  });
});

// ─── 6. Totals aggregation (mirrors fetchCustomerDayOrders) ──────────────────

type MockLine = {
  proteinName: string | null;
  swallowName: string | null;
  canonicalName: string | null;
  mealNameRaw: string;
  quantity: number;
};

function computeTotals(lines: MockLine[]) {
  const proteinMap = new Map<string, number>();
  const swallowMap = new Map<string, number>();
  const mealMap    = new Map<string, number>();
  let totalQuantity = 0;

  for (const l of lines) {
    const qty = l.quantity;
    totalQuantity += qty;

    if (l.proteinName && l.proteinName !== "(No protein)") {
      proteinMap.set(l.proteinName, (proteinMap.get(l.proteinName) ?? 0) + qty);
    }
    if (l.swallowName) {
      swallowMap.set(l.swallowName, (swallowMap.get(l.swallowName) ?? 0) + qty);
    }
    const mealLabel = l.canonicalName ?? l.mealNameRaw;
    mealMap.set(mealLabel, (mealMap.get(mealLabel) ?? 0) + qty);
  }

  return {
    totalQuantity,
    proteinTotals: [...proteinMap.entries()].map(([p, t]) => ({ protein: p, total: t })).sort((a, b) => b.total - a.total),
    swallowTotals: [...swallowMap.entries()].map(([s, t]) => ({ swallow: s, total: t })).sort((a, b) => b.total - a.total),
    mealTotals:    [...mealMap.entries()].map(([m, t]) => ({ meal: m, total: t })).sort((a, b) => b.total - a.total),
  };
}

describe("PI5 — Totals aggregation (Case 5)", () => {
  it("Case 5: uploaded + manual lines both included in totals", () => {
    const lines: MockLine[] = [
      { proteinName: "Beef", swallowName: "Poundo", canonicalName: "Egusi Soup", mealNameRaw: "Egusi Soup", quantity: 3 },
      { proteinName: "Chicken", swallowName: null, canonicalName: "Jollof Rice", mealNameRaw: "Jollof Rice", quantity: 2 },
      { proteinName: "(No protein)", swallowName: null, canonicalName: "Fruit Salad", mealNameRaw: "Fruit Salad", quantity: 1 }, // manual
    ];
    const totals = computeTotals(lines);
    expect(totals.totalQuantity).toBe(6);
    expect(totals.proteinTotals).toEqual([
      { protein: "Beef", total: 3 },
      { protein: "Chicken", total: 2 },
      // "(No protein)" sentinel NOT in protein totals
    ]);
    expect(totals.swallowTotals).toEqual([
      { swallow: "Poundo", total: 3 },
    ]);
    expect(totals.mealTotals.length).toBe(3);
  });

  it("(No protein) sentinel excluded from protein totals", () => {
    const lines: MockLine[] = [
      { proteinName: "(No protein)", swallowName: null, canonicalName: "Fruit Salad", mealNameRaw: "Fruit Salad", quantity: 2 },
    ];
    const totals = computeTotals(lines);
    expect(totals.proteinTotals).toHaveLength(0);
    expect(totals.totalQuantity).toBe(2);
  });

  it("null protein excluded from protein totals", () => {
    const lines: MockLine[] = [
      { proteinName: null, swallowName: null, canonicalName: "Jollof Rice", mealNameRaw: "Jollof Rice", quantity: 1 },
    ];
    const totals = computeTotals(lines);
    expect(totals.proteinTotals).toHaveLength(0);
  });

  it("quantities summed, not counted", () => {
    const lines: MockLine[] = [
      { proteinName: "Beef", swallowName: null, canonicalName: "Egusi Soup", mealNameRaw: "Egusi Soup", quantity: 5 },
      { proteinName: "Beef", swallowName: null, canonicalName: "Egusi Soup", mealNameRaw: "Egusi Soup", quantity: 3 },
    ];
    const totals = computeTotals(lines);
    expect(totals.totalQuantity).toBe(8);
    expect(totals.proteinTotals[0].total).toBe(8);
  });
});

// ─── 7. Empty state (Case 11) ─────────────────────────────────────────────────

describe("PI5 — Empty state (Case 11)", () => {
  it("zero lines → empty state shown", () => {
    const totals = computeTotals([]);
    expect(totals.totalQuantity).toBe(0);
    expect(totals.proteinTotals).toHaveLength(0);
    expect(totals.mealTotals).toHaveLength(0);
  });
});
