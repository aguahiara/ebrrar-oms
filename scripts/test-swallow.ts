/**
 * Acceptance tests — generic swallow classification (Business Rules §4 / §11).
 *
 * Run with:
 *   npx tsx scripts/test-swallow.ts
 *
 * Tests cover:
 *   A  — generic "with swallow" → "Not Selected", no exception, counted in totals
 *   B  — generic "+ Swallow"    → "Not Selected"
 *   C  — specific "with Eba"    → "Eba"
 *   D  — "with Garri"           → "Eba"  (Garri → Eba alias)
 *   E  — "with Semo"            → "Semo"
 *   F  — "with Poundo"          → "Poundo"
 *   G  — mixed: "Egusi + Swallow and Goat meat" → swallow "Not Selected", protein "Goat meat"
 *   H  — "any swallow"          → "Not Selected"
 *   I  — "choice of swallow"    → "Not Selected"
 *   J  — case-insensitivity     → "SWALLOW" → "Not Selected"
 *   K  — swallow w/ annotation  → "swallow (any)" → "Not Selected"
 *   L  — no swallow at all      → swallow_name = null
 */

import { classifyAddOns, classifyForDisplay, isGenericSwallow, GENERIC_SWALLOW_VALUE, parseOrderText } from "../lib/parse-order.js";

// ── Test vocabulary ────────────────────────────────────────────────────────────

const SWALLOWS = ["Eba", "Semo", "Poundo", "Amala", "Wheat"];
const PROTEINS = ["Chicken", "Goat meat", "Beef", "Fish", "Assorted"];

// ── Helper ─────────────────────────────────────────────────────────────────────

type Case = {
  label: string;
  rawText: string;
  expectedSwallow: string | null;
  expectedProtein?: string | null;
  expectedMainMeal?: string;
};

let passed = 0;
let failed = 0;

function run(tc: Case): void {
  const { mainMeal, addOns, hasSeparator } = parseOrderText(tc.rawText);
  const classified = classifyAddOns(addOns, PROTEINS, SWALLOWS);

  const swallowOk = classified.swallowName === tc.expectedSwallow;
  const proteinOk =
    tc.expectedProtein === undefined ||
    classified.proteinName === tc.expectedProtein;
  const mainOk =
    tc.expectedMainMeal === undefined ||
    mainMeal.toLowerCase().trim() === tc.expectedMainMeal.toLowerCase().trim();

  const ok = swallowOk && proteinOk && mainOk;
  if (ok) {
    console.log(`  ✓  ${tc.label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${tc.label}`);
    if (!swallowOk)
      console.error(
        `     swallow   expected=${JSON.stringify(tc.expectedSwallow)} got=${JSON.stringify(classified.swallowName)}`,
      );
    if (!proteinOk)
      console.error(
        `     protein   expected=${JSON.stringify(tc.expectedProtein)} got=${JSON.stringify(classified.proteinName)}`,
      );
    if (!mainOk)
      console.error(
        `     mainMeal  expected=${JSON.stringify(tc.expectedMainMeal)} got=${JSON.stringify(mainMeal)}`,
      );
    console.error(`     raw="${tc.rawText}"  addOns=${JSON.stringify(addOns)}  hasSeparator=${hasSeparator}`);
    failed += 1;
  }
}

// ── isGenericSwallow unit tests ────────────────────────────────────────────────

function assertGeneric(lower: string, expected: boolean): void {
  const got = isGenericSwallow(lower);
  if (got === expected) {
    console.log(`  ✓  isGenericSwallow(${JSON.stringify(lower)}) = ${expected}`);
    passed += 1;
  } else {
    console.error(`  ✗  isGenericSwallow(${JSON.stringify(lower)}) expected=${expected} got=${got}`);
    failed += 1;
  }
}

// ── Run tests ──────────────────────────────────────────────────────────────────

console.log("\n── isGenericSwallow() unit checks ───────────────────────────────────");
assertGeneric("swallow", true);
assertGeneric("any swallow", true);
assertGeneric("choice of swallow", true);
assertGeneric("your choice of swallow", true);
assertGeneric("swallow of choice", true);
assertGeneric("with swallow", true);
assertGeneric("swallow (any)", true);          // startsWith "swallow "
assertGeneric("swallow option", true);
assertGeneric("preferred swallow", true);
assertGeneric("eba", false);
assertGeneric("semo", false);
assertGeneric("garri", false);
assertGeneric("goat meat", false);
assertGeneric("swallowroo", false);            // no space after "swallow"
assertGeneric("", false);

console.log("\n── Acceptance tests ─────────────────────────────────────────────────");

// Test A — Business Rule example: "Okro Soup with Swallow"
run({
  label: "A — Okro Soup with Swallow → Not Selected",
  rawText: "Okro Soup with Swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
  expectedMainMeal: "Okro Soup",
});

// Test B — "Egusi Soup + Swallow"
run({
  label: "B — Egusi Soup + Swallow → Not Selected",
  rawText: "Egusi Soup + Swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
  expectedMainMeal: "Egusi Soup",
});

// Test C — "Oha Soup with Eba"
run({
  label: "C — Oha Soup with Eba → Eba",
  rawText: "Oha Soup with Eba",
  expectedSwallow: "Eba",
  expectedMainMeal: "Oha Soup",
});

// Test D — "Oha Soup with Garri" (Garri → Eba)
run({
  label: "D — Oha Soup with Garri → Eba",
  rawText: "Oha Soup with Garri",
  expectedSwallow: "Eba",
  expectedMainMeal: "Oha Soup",
});

// Test E — "Oha Soup with Semo"
run({
  label: "E — Oha Soup with Semo → Semo",
  rawText: "Oha Soup with Semo",
  expectedSwallow: "Semo",
});

// Test F — "Egusi Soup + Semo"
run({
  label: "F — Egusi Soup + Semo → Semo",
  rawText: "Egusi Soup + Semo",
  expectedSwallow: "Semo",
});

// Test G — mixed add-ons: protein + generic swallow
run({
  label: "G — Egusi + Swallow and Goat meat → swallow=Not Selected, protein=Goat meat",
  rawText: "Egusi Soup + Swallow and Goat meat",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
  expectedProtein: "Goat meat",
  expectedMainMeal: "Egusi Soup",
});

// Test H — "any swallow" phrase
run({
  label: "H — Okro Soup with any swallow → Not Selected",
  rawText: "Okro Soup with any swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
});

// Test I — "choice of swallow"
run({
  label: "I — Oha Soup with choice of swallow → Not Selected",
  rawText: "Oha Soup with choice of swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
});

// Test J — case-insensitivity
run({
  label: "J — SWALLOW (uppercase) → Not Selected",
  rawText: "Egusi Soup + SWALLOW",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
});

// Test K — annotated generic swallow
run({
  label: "K — swallow (any) → Not Selected",
  rawText: "Egusi Soup with swallow (any)",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
});

// Test L — no swallow → null
run({
  label: "L — no swallow in order → swallow_name = null",
  rawText: "Jollof Rice + Chicken",
  expectedSwallow: null,
  expectedProtein: "Chicken",
  expectedMainMeal: "Jollof Rice",
});

// Test M — order with no separator → no swallow extracted
run({
  label: "M — no separator → no add-ons, swallow_name = null",
  rawText: "Jollof Rice",
  expectedSwallow: null,
  expectedMainMeal: "Jollof Rice",
});

// Test N — "with Gari" (alternate Garri spelling) → Eba
run({
  label: "N — with Gari → Eba",
  rawText: "Egusi Soup with Gari",
  expectedSwallow: "Eba",
});

// Test O — "served with swallow" separator
run({
  label: "O — served with swallow → Not Selected",
  rawText: "Oha Soup served with swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
});

// Test P — "preferred swallow" (text path)
run({
  label: "P — Oha Soup with preferred swallow → Not Selected",
  rawText: "Oha Soup with preferred swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
  expectedMainMeal: "Oha Soup",
});

// Test Q — "Oha Soup and Swallow" (and-separator path)
run({
  label: "Q — Oha Soup and Swallow (and-separator) → Not Selected",
  rawText: "Oha Soup and Swallow",
  expectedSwallow: GENERIC_SWALLOW_VALUE,
  expectedMainMeal: "Oha Soup",
});

// ── Explicit-column simulation (ELCREST / Heirs swallowRaw column) ────────────

/**
 * For explicit-column parsers (ELCREST / Heirs), avon-orders.ts calls
 * canonicalizeVocab(swallowRaw, daySwallows).  When that returns null
 * (e.g. "Swallow" is not a vocabulary term), the fix falls back to
 * isGenericSwallow(rawLower).  These tests verify that the fallback is correct
 * by exercising isGenericSwallow against representative swallowRaw column values.
 */

console.log("\n── Explicit-column generic swallow fallback (isGenericSwallow) ──────");

function assertExplicitColumn(swallowRaw: string, expected: string | null): void {
  // Mirrors the fix in avon-orders.ts (the canonicalizeVocab-returns-null branch):
  //   const rawLower = (order.swallowRaw ?? "").toLowerCase().trim();
  //   return rawLower && isGenericSwallow(rawLower) ? GENERIC_SWALLOW_VALUE : null;
  const rawLower = swallowRaw.toLowerCase().trim();
  const got = rawLower && isGenericSwallow(rawLower) ? GENERIC_SWALLOW_VALUE : null;
  if (got === expected) {
    console.log(`  ✓  explicit column "${swallowRaw}" → ${JSON.stringify(expected)}`);
    passed += 1;
  } else {
    console.error(
      `  ✗  explicit column "${swallowRaw}" expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`,
    );
    failed += 1;
  }
}

// Generic phrases that appear in ELCREST / Heirs swallow columns
assertExplicitColumn("Swallow",           GENERIC_SWALLOW_VALUE);
assertExplicitColumn("swallow",           GENERIC_SWALLOW_VALUE);
assertExplicitColumn("Any Swallow",       GENERIC_SWALLOW_VALUE);
assertExplicitColumn("any swallow",       GENERIC_SWALLOW_VALUE);
assertExplicitColumn("Preferred Swallow", GENERIC_SWALLOW_VALUE);
assertExplicitColumn("preferred swallow", GENERIC_SWALLOW_VALUE);
assertExplicitColumn("Choice of Swallow", GENERIC_SWALLOW_VALUE);
assertExplicitColumn("Swallow Option",    GENERIC_SWALLOW_VALUE);
// Specific swallow names go through canonicalizeVocab (not this fallback) — verify
// that they do NOT match here so canonicalizeVocab remains the sole handler.
assertExplicitColumn("Eba",   null);   // vocabulary term handled by canonicalizeVocab
assertExplicitColumn("Semo",  null);   // vocabulary term handled by canonicalizeVocab
assertExplicitColumn("",      null);   // empty → null

// ── Multi-separator tests (regression: "Semo with beef" was not split) ────────
//
// These reproduce the protein-extraction regression where ADDON_SEP_RE did not
// include `with`, causing "Semo with Beef" to remain as one undivided token.
// The fix adds `with` to ADDON_SEP_RE and adds `served with` to PRIMARY_SEP_RE.

console.log("\n── Multi-separator parsing (regression tests) ───────────────────────");

// Test R — "Served with" as main-meal separator, then second "with" splits add-on
run({
  label: "R — Edikiankong Soup Served with Semo with beef → swallow=Semo, protein=Beef",
  rawText: "Edikiankong Soup Served with Semo with beef",
  expectedSwallow: "Semo",
  expectedProtein:  "Beef",
  expectedMainMeal: "Edikiankong Soup",
});

// Test S — "Dodo with fish": Dodo is a side, Fish is protein
run({
  label: "S — Pottage Beans With Dodo with fish → side=Dodo, protein=Fish",
  rawText: "Pottage Beans With Dodo with fish",
  expectedSwallow: null,
  expectedProtein:  "Fish",
  expectedMainMeal: "Pottage Beans",
});

// Test T — "Served with" stripping + second "with" splits Eba / Fish
run({
  label: "T — Okro Soup Served with Eba with Fish → swallow=Eba, protein=Fish",
  rawText: "Okro Soup Served with Eba with Fish",
  expectedSwallow: "Eba",
  expectedProtein:  "Fish",
  expectedMainMeal: "Okro Soup",
});

// Test U — side (Coleslaw) + protein (Chicken) after "Served with"
run({
  label: "U — Ebrrar Jollof Rice Served with Coleslaw with Chicken → protein=Chicken",
  rawText: "Ebrrar Jollof Rice Served with Coleslaw with Chicken",
  expectedSwallow: null,
  expectedProtein:  "Chicken",
  expectedMainMeal: "Ebrrar Jollof Rice",
});

// Test V — "+" primary separator, second "with" in add-on chain
run({
  label: "V — White Rice + Dodo + Spicy Asun Sauce with Beef → protein=Beef",
  rawText: "White Rice + Dodo + Spicy Asun Sauce with Beef",
  expectedSwallow: null,
  expectedProtein:  "Beef",
  expectedMainMeal: "White Rice",
});

// Test W — classic "with … and" multi-add-on (already worked; regression guard)
run({
  label: "W — Egusi Soup with Semo and Beef → swallow=Semo, protein=Beef",
  rawText: "Egusi Soup with Semo and Beef",
  expectedSwallow: "Semo",
  expectedProtein:  "Beef",
  expectedMainMeal: "Egusi Soup",
});

// ── HGI protein-extraction regression tests (Task 10) ────────────────────────
//
// These reproduce the four patterns reported by HGI that were still failing
// after the bd5fc0c multi-separator fix.  The root cause is that the restRaw
// produced by PRIMARY_SEP_RE can begin with a connector word ("and", "with")
// that ADDON_SEP_RE does not strip, resulting in malformed tokens such as
// "and Eba" that never match the swallow vocabulary.

console.log("\n── HGI protein-extraction regression tests ──────────────────────────");

// HGI-A — "Served with Semo and Assorted meat" (swallow first, protein second)
run({
  label: "HGI-A — Afang Soup Served with Semo and Assorted meat → swallow=Semo, protein=Assorted",
  rawText: "Afang Soup Served with Semo and Assorted meat",
  expectedSwallow: "Semo",
  expectedProtein: "Assorted",
  expectedMainMeal: "Afang Soup",
});

// HGI-B — "Served with Semo and Beef" (swallow first, protein second)
run({
  label: "HGI-B — Egusi Soup Served with Semo and Beef → swallow=Semo, protein=Beef",
  rawText: "Egusi Soup Served with Semo and Beef",
  expectedSwallow: "Semo",
  expectedProtein: "Beef",
  expectedMainMeal: "Egusi Soup",
});

// HGI-C — protein BEFORE swallow, split by two different separators
// "With Goat Meat" → main-meal separator splits first, restRaw = "Goat Meat Served with Semo"
// ADDON_SEP_RE then splits on the second "with" → ["Goat Meat Served", "Semo"]
// "Goat Meat Served" must still resolve to protein via alias starts-with
run({
  label: "HGI-C — Ofe Owerri With Goat Meat Served with Semo → protein=Goat meat, swallow=Semo",
  rawText: "Ofe Owerri With Goat Meat Served with Semo",
  expectedSwallow: "Semo",
  expectedProtein: "Goat meat",
  expectedMainMeal: "Ofe Owerri",
});

// HGI-D — leading "and" before swallow after PRIMARY split
// "Served With and Eba" → restRaw = "and Eba and Assorted meat"
// ADDON_SEP_RE does NOT strip the leading "and", so first token = "and Eba" (not "Eba")
// FIX REQUIRED: strip leading connectors from each token after the split
run({
  label: "HGI-D — Ogbono Soup Served With and Eba and Assorted meat → swallow=Eba, protein=Assorted",
  rawText: "Ogbono Soup Served With and Eba and Assorted meat",
  expectedSwallow: "Eba",
  expectedProtein: "Assorted",
  expectedMainMeal: "Ogbono Soup",
});

// HGI-E — two consecutive "with" separators (swallow + protein)
run({
  label: "HGI-E — Okro Soup with Eba with Fish → swallow=Eba, protein=Fish",
  rawText: "Okro Soup with Eba with Fish",
  expectedSwallow: "Eba",
  expectedProtein: "Fish",
  expectedMainMeal: "Okro Soup",
});

// HGI-F — "and" splits protein + side (Dodo is a side, not a protein or swallow)
run({
  label: "HGI-F — Jollof Rice with Dodo and Chicken → protein=Chicken, swallow=null",
  rawText: "Jollof Rice with Dodo and Chicken",
  expectedSwallow: null,
  expectedProtein: "Chicken",
  expectedMainMeal: "Jollof Rice",
});

// ── classifyForDisplay tests ──────────────────────────────────────────────────

console.log("\n── classifyForDisplay() ─────────────────────────────────────────────");

function assertDisplay(
  label: string,
  rawText: string,
  expected: {
    mainMeal: string;
    swallow: string | null;
    protein: string | null;
    sides?: string[];
    unknownAddOns?: string[];
  },
): void {
  const c = classifyForDisplay(rawText);
  const mainOk    = c.mainMeal.toLowerCase().trim() === expected.mainMeal.toLowerCase().trim();
  const swallowOk = c.swallow === expected.swallow;
  const proteinOk = c.protein === expected.protein;
  const sidesOk   = expected.sides === undefined ||
    JSON.stringify(c.sides.map(s => s.toLowerCase())) ===
    JSON.stringify((expected.sides ?? []).map(s => s.toLowerCase()));
  const unknownOk = expected.unknownAddOns === undefined ||
    JSON.stringify(c.unknownAddOns.map(s => s.toLowerCase())) ===
    JSON.stringify((expected.unknownAddOns ?? []).map(s => s.toLowerCase()));

  const ok = mainOk && swallowOk && proteinOk && sidesOk && unknownOk;
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${label}`);
    if (!mainOk)    console.error(`     mainMeal  expected=${JSON.stringify(expected.mainMeal)} got=${JSON.stringify(c.mainMeal)}`);
    if (!swallowOk) console.error(`     swallow   expected=${JSON.stringify(expected.swallow)} got=${JSON.stringify(c.swallow)}`);
    if (!proteinOk) console.error(`     protein   expected=${JSON.stringify(expected.protein)} got=${JSON.stringify(c.protein)}`);
    if (!sidesOk)   console.error(`     sides     expected=${JSON.stringify(expected.sides)} got=${JSON.stringify(c.sides)}`);
    if (!unknownOk) console.error(`     unknowns  expected=${JSON.stringify(expected.unknownAddOns)} got=${JSON.stringify(c.unknownAddOns)}`);
    failed += 1;
  }
}

assertDisplay(
  "display: Edikiankong Soup Served with Semo with beef",
  "Edikiankong Soup Served with Semo with beef",
  { mainMeal: "Edikiankong Soup", swallow: "Semo", protein: "Beef" },
);

assertDisplay(
  "display: Pottage Beans With Dodo with fish",
  "Pottage Beans With Dodo with fish",
  { mainMeal: "Pottage Beans", swallow: null, protein: "Fish", sides: ["Dodo"] },
);

assertDisplay(
  "display: Jollof Rice Served with Coleslaw with Chicken",
  "Jollof Rice Served with Coleslaw with Chicken",
  { mainMeal: "Jollof Rice", swallow: null, protein: "Chicken", sides: ["Coleslaw"] },
);

assertDisplay(
  "display: White Rice + Dodo + Spicy Asun Sauce with Beef",
  "White Rice + Dodo + Spicy Asun Sauce with Beef",
  { mainMeal: "White Rice", swallow: null, protein: "Beef", sides: ["Dodo"], unknownAddOns: ["Spicy Asun Sauce"] },
);

assertDisplay(
  "display: Okro Soup with Eba with Fish",
  "Okro Soup with Eba with Fish",
  { mainMeal: "Okro Soup", swallow: "Eba", protein: "Fish" },
);

assertDisplay(
  "display: Egusi Soup (no separator) → hasSeparator=false",
  "Egusi Soup",
  { mainMeal: "Egusi Soup", swallow: null, protein: null },
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
