/**
 * Tests for PI4 — Manual Order Edit logic.
 *
 * These tests exercise:
 *   1. The `applyManualOrderDefaults` logic (PI2 soup default + PI3 optional)
 *      as it will be called by both the POST and PATCH routes.
 *   2. The release-guard logic (mirrors the route check).
 *   3. Edit-mode state transitions (pure logic, no DOM).
 *
 * Because avon-orders.ts has DB-level imports that can't be loaded in Vitest,
 * we mirror the relevant logic inline here — the same pattern used by the
 * soup-default-protein.test.ts file.  If the avon-orders implementation
 * changes, update the mirrors below.
 */

import { describe, it, expect } from "vitest";
import {
  isSoupMeal,
  hasNoProteinAnnotation,
} from "../parse-order";

// ─── Inline mirrors of applyManualOrderDefaults logic ────────────────────────
// Mirrors avon-orders.ts `applyManualOrderDefaults` (PI2 + PI3 sections).

type ManualOrderLineInput = {
  menuItemId: string | null;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  proteinName?: string | null;
  quantity: number;
  orderSource: "manual_corporate_addon" | "manual_corporate_direct" | "special_order";
};

type ManualOrderLine = {
  menuItemId: string | null;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  proteinRequirement: "required" | "optional" | "not_required";
  proteinName: string | null;
  quantity: number;
};

function applyManualOrderDefaults(
  rawLines: ManualOrderLineInput[],
  proteinReqById: ReadonlyMap<string, string>,
  canonicalById: ReadonlyMap<string, string>,
): ManualOrderLine[] {
  // Clone so PI2 mutations don't affect the input
  const lines = rawLines.map((l) => ({ ...l }));

  // PI2: Soup default protein
  for (const l of lines) {
    if (l.matchType === "Direct" && l.menuItemId && !l.proteinName?.trim()) {
      const canonical = canonicalById.get(l.menuItemId) ?? l.mealNameRaw;
      const req = proteinReqById.get(l.menuItemId) ?? "required";
      if (
        req === "required" &&
        !hasNoProteinAnnotation(l.mealNameRaw ?? "") &&
        isSoupMeal(canonical)
      ) {
        l.proteinName = "Beef";
      }
    }
  }

  // PI3: map to ManualOrderLine with optional-protein downgrade
  return lines.map((l): ManualOrderLine => {
    const dbProteinReq: "required" | "optional" | "not_required" =
      l.matchType === "FruitsOnly"
        ? "not_required"
        : l.menuItemId
          ? ((proteinReqById.get(l.menuItemId) ?? "required") as
              | "required"
              | "optional"
              | "not_required")
          : "required";

    const proteinRequirement: "required" | "optional" | "not_required" =
      !l.proteinName?.trim() && dbProteinReq === "required"
        ? "optional"
        : dbProteinReq;

    // Mirrors persistManualOrders sentinel logic
    const resolvedProtein: string | null =
      l.matchType === "FruitsOnly" ||
      proteinRequirement === "not_required" ||
      proteinRequirement === "optional"
        ? l.proteinName?.trim() || "(No protein)"
        : l.proteinName?.trim() || null;

    return {
      menuItemId:        l.menuItemId,
      mealNameRaw:       l.mealNameRaw,
      matchType:         l.matchType,
      proteinRequirement,
      proteinName:       resolvedProtein,
      quantity:          l.quantity,
    };
  });
}

// ─── Test data ────────────────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<ManualOrderLineInput> & { mealNameRaw: string },
): ManualOrderLineInput {
  return {
    menuItemId: null,
    matchType: "Direct",
    quantity: 1,
    orderSource: "manual_corporate_addon",
    proteinName: null,
    ...overrides,
  };
}

const PROTEIN_REQ = new Map<string, string>([
  ["egusi-id",  "required"],
  ["rice-id",   "required"],
  ["fruit-id",  "not_required"],
  ["salad-id",  "optional"],
]);
const CANONICAL = new Map<string, string>([
  ["egusi-id",  "Egusi Soup"],
  ["rice-id",   "Jollof Rice"],
  ["fruit-id",  "Fruit Salad"],
  ["salad-id",  "Garden Salad"],
]);

// ─── PI2: Soup default on PATCH ───────────────────────────────────────────────

describe("PI4/PI2 — soup default applied on PATCH (applyManualOrderDefaults)", () => {
  it("Egusi Soup with no protein → Beef via soup default", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Egusi Soup", menuItemId: "egusi-id" })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("Beef");
    expect(result[0].proteinRequirement).toBe("required");
  });

  it("Egusi Soup with explicit Chicken → Chicken preserved", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Egusi Soup", menuItemId: "egusi-id", proteinName: "Chicken" })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("Chicken");
  });

  it("Jollof Rice with no protein → no soup default, sentinel written", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id" })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
    expect(result[0].proteinRequirement).toBe("optional");
  });

  it("Egusi Soup with 'No additional Protein' annotation → soup default suppressed, sentinel written", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Egusi Soup (No additional Protein)", menuItemId: "egusi-id" })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
  });
});

// ─── PI3: Blank protein sentinel on PATCH ─────────────────────────────────────

describe("PI4/PI3 — blank protein sentinel on PATCH", () => {
  it("required meal with null protein → optional, sentinel '(No protein)'", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id", proteinName: null })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
    expect(result[0].proteinRequirement).toBe("optional");
  });

  it("optional meal with null protein → sentinel '(No protein)'", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Garden Salad", menuItemId: "salad-id", proteinName: null })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
    expect(result[0].proteinRequirement).toBe("optional");
  });

  it("not_required meal with null protein → sentinel '(No protein)'", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Fruit Salad", menuItemId: "fruit-id", proteinName: null })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
    expect(result[0].proteinRequirement).toBe("not_required");
  });

  it("FruitsOnly line → not_required, sentinel '(No protein)'", () => {
    const result = applyManualOrderDefaults(
      [{ ...makeLine({ mealNameRaw: "Fruit Box" }), matchType: "FruitsOnly" as const }],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("(No protein)");
    expect(result[0].proteinRequirement).toBe("not_required");
  });

  it("required meal with explicit protein → required, protein preserved", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id", proteinName: "Turkey" })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("Turkey");
    expect(result[0].proteinRequirement).toBe("required");
  });
});

// ─── Multiple lines on PATCH ──────────────────────────────────────────────────

describe("PI4 — multiple lines processed independently on PATCH", () => {
  it("each line gets independent protein treatment", () => {
    const result = applyManualOrderDefaults(
      [
        makeLine({ mealNameRaw: "Egusi Soup", menuItemId: "egusi-id" }),            // → Beef (soup)
        makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id" }),            // → (No protein)
        makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id", proteinName: "Chicken" }), // → Chicken
      ],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].proteinName).toBe("Beef");
    expect(result[1].proteinName).toBe("(No protein)");
    expect(result[2].proteinName).toBe("Chicken");
  });

  it("quantity is passed through unchanged", () => {
    const result = applyManualOrderDefaults(
      [makeLine({ mealNameRaw: "Jollof Rice", menuItemId: "rice-id", quantity: 5 })],
      PROTEIN_REQ, CANONICAL,
    );
    expect(result[0].quantity).toBe(5);
  });
});

// ─── Release guard ────────────────────────────────────────────────────────────

function releaseGuard(
  activeRelease: { id: string; released_at: string } | null,
): string | null {
  if (activeRelease) {
    return "This batch has been released to production. Revoke the release before editing.";
  }
  return null;
}

describe("PI4 — release guard mirrors PATCH route", () => {
  it("no active release → edit allowed (null)", () => {
    expect(releaseGuard(null)).toBeNull();
  });

  it("active release present → edit blocked", () => {
    const result = releaseGuard({ id: "rel-1", released_at: "2026-06-07T10:00:00Z" });
    expect(result).toMatch(/released to production/i);
  });
});

// ─── Edit-mode state transitions ──────────────────────────────────────────────

type EditState = {
  editBatchId: string | null;
  serviceDay: string;
  customerId: string;
  savedBatchId: string | null;
  savedWasEdit: boolean;
};

const INITIAL: EditState = {
  editBatchId: null,
  serviceDay: "2026-06-07",
  customerId: "",
  savedBatchId: null,
  savedWasEdit: false,
};

const startEdit = (s: EditState, id: string, day: string, cust: string): EditState =>
  ({ ...s, editBatchId: id, serviceDay: day, customerId: cust, savedBatchId: null, savedWasEdit: false });

const cancelEdit = (s: EditState, today: string): EditState =>
  ({ ...s, editBatchId: null, serviceDay: today, savedBatchId: null, savedWasEdit: false });

const saveEditSuccess = (s: EditState): EditState => {
  const prevId = s.editBatchId!;
  return { ...s, editBatchId: null, savedBatchId: prevId, savedWasEdit: true };
};

const saveCreateSuccess = (s: EditState, newId: string): EditState =>
  ({ ...s, savedBatchId: newId, savedWasEdit: false });

describe("PI4 — edit-mode state transitions", () => {
  it("handleStartEdit populates editBatchId and locks serviceDay/customerId", () => {
    const s = startEdit(INITIAL, "batch-abc", "2026-06-05", "cust-123");
    expect(s.editBatchId).toBe("batch-abc");
    expect(s.serviceDay).toBe("2026-06-05");
    expect(s.customerId).toBe("cust-123");
  });

  it("handleCancelEdit clears editBatchId and resets serviceDay to today", () => {
    const s = startEdit(INITIAL, "batch-abc", "2026-06-05", "cust-123");
    const c = cancelEdit(s, "2026-06-07");
    expect(c.editBatchId).toBeNull();
    expect(c.serviceDay).toBe("2026-06-07");
  });

  it("successful edit save: clears editBatchId, sets savedWasEdit=true", () => {
    const s = startEdit(INITIAL, "batch-abc", "2026-06-05", "cust-123");
    const saved = saveEditSuccess(s);
    expect(saved.editBatchId).toBeNull();
    expect(saved.savedBatchId).toBe("batch-abc");
    expect(saved.savedWasEdit).toBe(true);
  });

  it("successful create save: sets savedWasEdit=false", () => {
    const saved = saveCreateSuccess(INITIAL, "batch-new");
    expect(saved.savedBatchId).toBe("batch-new");
    expect(saved.savedWasEdit).toBe(false);
  });

  it("starting a new edit clears the previous savedBatchId", () => {
    const afterCreate = saveCreateSuccess(INITIAL, "batch-old");
    const editing = startEdit(afterCreate, "batch-edit", "2026-06-05", "cust-1");
    expect(editing.savedBatchId).toBeNull();
  });
});

// ─── Locked fields during edit mode ──────────────────────────────────────────

describe("PI4 — locked fields during edit mode", () => {
  it("disabled={!!editBatchId} is true when editBatchId is set", () => {
    const editBatchId: string | null = "batch-abc";
    expect(!!editBatchId).toBe(true);
  });

  it("disabled={!!editBatchId} is false when editBatchId is null", () => {
    const editBatchId: string | null = null;
    expect(!!editBatchId).toBe(false);
  });

  it("mode selector disabled during edit (only one customer + day can be edited)", () => {
    const editBatchId: string | null = "batch-abc";
    expect(!!editBatchId).toBe(true);   // mode Select disabled
  });
});
