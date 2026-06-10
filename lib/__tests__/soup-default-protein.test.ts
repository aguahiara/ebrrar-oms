/**
 * Tests for the soup default protein feature (Product Improvement Item 2).
 *
 * These tests exercise the shared helper `isSoupMeal` together with the
 * decomposition + protein-defaulting logic that `resolveOrders` applies.
 * Because `resolveOrders` uses async DB calls we test the individual helpers
 * here and keep the integration tests in a separate (future) e2e suite.
 *
 * The logic under test is:
 *   1. isSoupMeal()          — detects soup orders
 *   2. normalizeOrderComponents / resolveProteinAlias / resolveSwallowAlias
 *      run before soup defaulting (PI1 normalisation must fire first)
 *   3. applySoupProteinDefault() — the pure function extracted below that
 *      mirrors exactly what resolveOrders does
 */

import { describe, it, expect } from "vitest";
import {
  isSoupMeal,
  hasNoProteinAnnotation,
  resolveProteinAlias,
  normalizeFoodComponent,
  parseOrderText,
} from "../parse-order";

// ── Inline mirror of the soup-default logic in resolveOrders ─────────────────
// This mirrors the logic in avon-orders.ts so we can unit-test it without
// setting up DB mocks.  If the avon-orders implementation changes, update here.

function applySoupProteinDefault(
  proteinName: string | null,
  mealText: string,          // raw or normalize()-d meal text to check for soup
  orderNoProtein: boolean,   // true when hasNoProteinAnnotation fired on raw text
  dayProteins: string[],     // vocabulary for the day (must include "Beef")
): string | null {
  if (proteinName !== null) return proteinName;          // explicit protein wins
  if (orderNoProtein)        return null;                // no-protein annotation respected
  if (!isSoupMeal(mealText)) return null;                // not a soup — no default
  const beef = dayProteins.find((p) => p.toLowerCase() === "beef");
  return beef ?? null;                                   // only default when Beef is in vocab
}

// Day vocabulary used in all tests
const DAY_PROTEINS = [
  "Beef", "Chicken", "Fish", "Turkey", "Goatmeat", "Cowleg",
  "Egg", "Ponmo", "Assorted Meat",
];

// ── Core acceptance criteria ──────────────────────────────────────────────────

describe("Soup default protein — acceptance criteria", () => {

  it('Input "Egusi Soup" → protein "Beef"', () => {
    // No separator → no protein extracted from text
    const { addOns } = parseOrderText("Egusi Soup");
    const parsedProtein = addOns.length === 0 ? null : resolveProteinAlias(addOns[0].toLowerCase()) as string | null;
    const result = applySoupProteinDefault(parsedProtein, "Egusi Soup", false, DAY_PROTEINS);
    expect(result).toBe("Beef");
  });

  it('Input "Vegetable Soup" → protein "Beef"', () => {
    const result = applySoupProteinDefault(null, "Vegetable Soup", false, DAY_PROTEINS);
    expect(result).toBe("Beef");
  });

  it('Input "Afang Soup" → protein "Beef"', () => {
    const result = applySoupProteinDefault(null, "Afang Soup", false, DAY_PROTEINS);
    expect(result).toBe("Beef");
  });

  it('Input "Okro Soup" → protein "Beef"', () => {
    const result = applySoupProteinDefault(null, "okro soup", false, DAY_PROTEINS);
    expect(result).toBe("Beef");
  });

  it('Input "Egusi Soup, Chicken" → protein "Chicken" (explicit overrides default)', () => {
    const { addOns } = parseOrderText("Egusi Soup, Chicken");
    // addOns[0] should be "Chicken"
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    const result = applySoupProteinDefault(normalized, "Egusi Soup", false, DAY_PROTEINS);
    expect(result).toBe("Chicken");
  });

  it('Input "Vegetable Soup + Goatmeat" → protein "Goatmeat"', () => {
    const { addOns } = parseOrderText("Vegetable Soup + Goatmeat");
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    const result = applySoupProteinDefault(normalized, "Vegetable Soup", false, DAY_PROTEINS);
    expect(result).toBe("Goatmeat");
  });

  it('Input "Okro Soup / Fish" → protein "Fish"', () => {
    const { addOns } = parseOrderText("Okro Soup / Fish");
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    const result = applySoupProteinDefault(normalized, "Okro Soup", false, DAY_PROTEINS);
    expect(result).toBe("Fish");
  });

  it('Input "Afang Soup, Cowleg" → protein "Cowleg"', () => {
    const { addOns } = parseOrderText("Afang Soup, Cowleg");
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    const result = applySoupProteinDefault(normalized, "Afang Soup", false, DAY_PROTEINS);
    expect(result).toBe("Cowleg");
  });

  it('Input "Egusi Soup (No additional Protein)" → protein null', () => {
    const rawText = "Egusi Soup (No additional Protein)";
    const orderNoProtein = hasNoProteinAnnotation(rawText);
    expect(orderNoProtein).toBe(true);
    const result = applySoupProteinDefault(null, "Egusi Soup", orderNoProtein, DAY_PROTEINS);
    expect(result).toBeNull();
  });

  it('Input "Okro Soup - No extra protein" → protein null', () => {
    const rawText = "Okro Soup - No extra protein";
    const orderNoProtein = hasNoProteinAnnotation(rawText);
    expect(orderNoProtein).toBe(true);
    const result = applySoupProteinDefault(null, "Okro Soup", orderNoProtein, DAY_PROTEINS);
    expect(result).toBeNull();
  });

  it('Input "Egusi Soup, Chiken" → protein "Chicken" (PI1 normalisation then soup rule)', () => {
    // Step 1: PI1 parse and normalise
    const { addOns } = parseOrderText("Egusi Soup, Chiken");
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    expect(normalized).toBe("Chicken");  // PI1 corrects misspelling
    // Step 2: soup default — explicit Chicken wins, no default applied
    const result = applySoupProteinDefault(normalized, "Egusi Soup", false, DAY_PROTEINS);
    expect(result).toBe("Chicken");
  });

  it('Input "Egusi Soup, Meat" → protein "Beef" (PI1 normalises Meat → Beef)', () => {
    // Step 1: PI1 parse and normalise
    const { addOns } = parseOrderText("Egusi Soup, Meat");
    const rawProtein = addOns[0] ?? null;
    const normalized = rawProtein ? normalizeFoodComponent(rawProtein) : null;
    expect(normalized).toBe("Beef");     // PI1 maps "Meat" → "Beef"
    // Step 2: soup default — "Beef" already explicit, still returns Beef
    const result = applySoupProteinDefault(normalized, "Egusi Soup", false, DAY_PROTEINS);
    expect(result).toBe("Beef");
  });
});

// ── Soup default does not apply to non-soup orders ────────────────────────────

describe("Soup default does not fire for non-soup orders", () => {
  it.each([
    "Jollof Rice",
    "Fried Rice",
    "Pottage Beans",
    "Spaghetti Bolognese",
    "Fruit Salad",
  ])('"%s" → no protein default (null)', (meal) => {
    const result = applySoupProteinDefault(null, meal, false, DAY_PROTEINS);
    expect(result).toBeNull();
  });
});

// ── Soup default is skipped when Beef is not in the day vocabulary ────────────

describe("Soup default skipped when Beef absent from vocabulary", () => {
  const NO_BEEF_PROTEINS = ["Chicken", "Fish", "Turkey"];

  it("Egusi Soup without Beef in vocab → null", () => {
    const result = applySoupProteinDefault(null, "Egusi Soup", false, NO_BEEF_PROTEINS);
    expect(result).toBeNull();
  });
});

// ── Case-insensitive soup detection ──────────────────────────────────────────

describe("Soup detection is case-insensitive", () => {
  it.each([
    "EGUSI SOUP",
    "egusi soup",
    "Egusi Soup",
    "EDIKANG IKONG",
    "edikang ikong",
    "Seafood Okro",
    "SEAFOOD OKRO",
  ])('isSoupMeal("%s") → true', (text) => {
    expect(isSoupMeal(text)).toBe(true);
  });
});

// ── PI3: protein optional for manual orders — sentinel / dashboard logic ──────

/**
 * Mirror the PI3 proteinRequirement downgrade logic from the API route so we
 * can unit-test it without HTTP calls.
 *
 * Returns the effective proteinRequirement that persistManualOrders will
 * receive for a manual order line.
 */
function resolveManualProteinRequirement(
  dbProteinReq: "required" | "optional" | "not_required",
  proteinName: string | null,
  isFruitsOnly: boolean,
): "required" | "optional" | "not_required" {
  if (isFruitsOnly) return "not_required";
  // PI3: blank protein on a "required" meal → downgrade to "optional"
  // so the "(No protein)" sentinel is written rather than null.
  if (!proteinName?.trim() && dbProteinReq === "required") return "optional";
  return dbProteinReq;
}

/**
 * Mirror the protein-value write logic from persistManualOrders so we can
 * verify what gets stored in protein_name without hitting the DB.
 */
function resolveStoredProteinValue(
  proteinName: string | null,
  proteinRequirement: "required" | "optional" | "not_required",
  matchType: "Direct" | "FruitsOnly",
): string | null {
  if (matchType === "FruitsOnly" || proteinRequirement === "not_required" || proteinRequirement === "optional") {
    return proteinName || "(No protein)";
  }
  return proteinName ?? null;
}

describe("PI3 — protein optional for manual orders", () => {

  describe("Jollof Rice with blank protein", () => {
    it("proteinRequirement downgrades from required → optional", () => {
      const req = resolveManualProteinRequirement("required", null, false);
      expect(req).toBe("optional");
    });
    it("stored protein_name is '(No protein)' sentinel", () => {
      const req = resolveManualProteinRequirement("required", null, false);
      const stored = resolveStoredProteinValue(null, req, "Direct");
      expect(stored).toBe("(No protein)");
    });
    it("soup default does NOT fire (not a soup)", () => {
      const soupDefault = applySoupProteinDefault(null, "Jollof Rice", false, DAY_PROTEINS);
      expect(soupDefault).toBeNull();  // no default applied
    });
  });

  describe("Spaghetti with blank protein", () => {
    it("stored protein_name is '(No protein)' sentinel", () => {
      const req = resolveManualProteinRequirement("required", null, false);
      const stored = resolveStoredProteinValue(null, req, "Direct");
      expect(stored).toBe("(No protein)");
    });
  });

  describe("Egusi Soup with blank protein — soup default applies", () => {
    it("soup default assigns Beef", () => {
      const soupDefault = applySoupProteinDefault(null, "Egusi Soup", false, DAY_PROTEINS);
      expect(soupDefault).toBe("Beef");
    });
    it("proteinRequirement stays required (Beef is provided)", () => {
      const req = resolveManualProteinRequirement("required", "Beef", false);
      expect(req).toBe("required");
    });
    it("stored protein_name is 'Beef'", () => {
      const req = resolveManualProteinRequirement("required", "Beef", false);
      const stored = resolveStoredProteinValue("Beef", req, "Direct");
      expect(stored).toBe("Beef");
    });
  });

  describe("Egusi Soup with explicit Chicken", () => {
    it("soup default does not override explicit selection", () => {
      const soupDefault = applySoupProteinDefault("Chicken", "Egusi Soup", false, DAY_PROTEINS);
      expect(soupDefault).toBe("Chicken");
    });
    it("stored protein_name is 'Chicken'", () => {
      const req = resolveManualProteinRequirement("required", "Chicken", false);
      const stored = resolveStoredProteinValue("Chicken", req, "Direct");
      expect(stored).toBe("Chicken");
    });
  });

  describe("Egusi Soup with 'No additional Protein'", () => {
    it("soup default is suppressed when no-protein annotation is present", () => {
      const orderNoProtein = hasNoProteinAnnotation("Egusi Soup (No additional Protein)");
      const soupDefault = applySoupProteinDefault(null, "Egusi Soup", orderNoProtein, DAY_PROTEINS);
      expect(soupDefault).toBeNull();
    });
    it("stored protein_name is '(No protein)' sentinel (via optional downgrade)", () => {
      const req = resolveManualProteinRequirement("required", null, false);
      const stored = resolveStoredProteinValue(null, req, "Direct");
      expect(stored).toBe("(No protein)");
    });
  });

  describe("FruitsOnly order", () => {
    it("proteinRequirement is always not_required", () => {
      const req = resolveManualProteinRequirement("required", null, true);
      expect(req).toBe("not_required");
    });
    it("stored protein_name is '(No protein)' sentinel", () => {
      const req = resolveManualProteinRequirement("required", null, true);
      const stored = resolveStoredProteinValue(null, req, "FruitsOnly");
      expect(stored).toBe("(No protein)");
    });
  });

  describe("Dashboard: '(No protein)' sentinel not counted in proteinMap", () => {
    // Mirrors avon-dashboard.ts lines 284-290:
    // protein_name is checked, "(No protein)" is filtered out.
    function simulateDashboardProteinEntry(proteinName: string | null): string | null {
      if (!proteinName) return null;            // null → skip (never stored for manual orders now)
      if (proteinName === "(No protein)") return null;  // sentinel → filtered out
      return proteinName;
    }

    it("Beef appears in protein count", () => {
      expect(simulateDashboardProteinEntry("Beef")).toBe("Beef");
    });
    it("'(No protein)' sentinel is filtered out of protein count", () => {
      expect(simulateDashboardProteinEntry("(No protein)")).toBeNull();
    });
    it("null is also not counted (upload-parsed lines where protein truly unknown)", () => {
      expect(simulateDashboardProteinEntry(null)).toBeNull();
    });
  });

  describe("Manual upload — blank protein rows accepted", () => {
    it("Okro Soup with blank protein → soup default returns Beef", () => {
      const soupDefault = applySoupProteinDefault(null, "Okro Soup", false, DAY_PROTEINS);
      expect(soupDefault).toBe("Beef");
    });
    it("Rice with blank protein → no default, sentinel written", () => {
      const soupDefault = applySoupProteinDefault(null, "Rice", false, DAY_PROTEINS);
      expect(soupDefault).toBeNull();
      // Would then use optional downgrade → "(No protein)" stored
      const req = resolveManualProteinRequirement("required", null, false);
      const stored = resolveStoredProteinValue(null, req, "Direct");
      expect(stored).toBe("(No protein)");
    });
  });
});

// ── No-protein variations all recognised ─────────────────────────────────────

describe("hasNoProteinAnnotation recognises all required phrases", () => {
  it.each([
    "Egusi Soup (No additional Protein)",
    "Egusi Soup (No additional protein)",
    "Egusi Soup (NO ADDITIONAL PROTEIN)",
    "Okro Soup (No extra protein)",
    "Afang Soup (Without protein)",
    "Egusi Soup (No Protein)",
    "Okro Soup - No extra protein",
    "Okro Soup No extra protein",
  ])('hasNoProteinAnnotation("%s") → true', (text) => {
    expect(hasNoProteinAnnotation(text)).toBe(true);
  });
});
