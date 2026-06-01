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

import { classifyAddOns, isGenericSwallow, GENERIC_SWALLOW_VALUE, parseOrderText } from "../lib/parse-order.js";

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

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
