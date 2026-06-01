/**
 * Acceptance tests — no-lunch detection and protein alias normalization
 * (Business Rules §1b, §3, §5).
 *
 * Run with:
 *   npx tsx scripts/test-no-lunch.ts
 *
 * Tests cover:
 *   A  — "NO LUNCH REQUIRED" → isNoLunchEntry = true
 *   B  — "no lunch"          → isNoLunchEntry = true
 *   C  — "nil"               → isNoLunchEntry = true
 *   D  — "N/A"               → isNoLunchEntry = true
 *   E  — "na"                → isNoLunchEntry = true
 *   F  — "none"              → isNoLunchEntry = true
 *   G  — "no meal required"  → isNoLunchEntry = true
 *   H  — "not eating"        → isNoLunchEntry = true
 *   I  — real meal text      → isNoLunchEntry = false
 *   J  — "Jollof Rice + Assorted" → protein = "Assorted Meat" (alias)
 *   K  — "Egusi Soup + Goat"      → protein = "Goat Meat" (alias)
 *   L  — "Okro Soup + Cow Meat"   → protein = "Beef" (alias)
 *   M  — "Oha Soup with Boiled Egg" → protein = "Egg" (alias)
 *   N  — "Okro Soup + Eba + Fish"  → swallow = "Eba", protein = "Fish"
 *         (tests + splitting within add-on section, Business Rule §3)
 *   O  — "Egusi Soup + Semo and Beef" → swallow = "Semo", protein = "Beef"
 *         (tests `and` splitting within add-on section)
 *   P  — "no food"           → isNoLunchEntry = true
 *   Q  — Partial no-lunch phrase inside a real meal → isNoLunchEntry = false
 *         ("Noodles with no sauce" should NOT be detected as no-lunch)
 */

import {
  classifyAddOns,
  isNoLunchEntry,
  parseOrderText,
} from "../lib/parse-order.js";

// ── Test vocabulary ────────────────────────────────────────────────────────────

const SWALLOWS = ["Eba", "Semo", "Poundo", "Amala", "Wheat"];
const PROTEINS = [
  "Chicken",
  "Fish",
  "Beef",
  "Goat Meat",
  "Assorted Meat",
  "Egg",
  "Turkey",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assertNoLunch(raw: string, expected: boolean): void {
  const got = isNoLunchEntry(raw);
  if (got === expected) {
    console.log(`  ✓  isNoLunchEntry(${JSON.stringify(raw)}) = ${expected}`);
    passed += 1;
  } else {
    console.error(
      `  ✗  isNoLunchEntry(${JSON.stringify(raw)}) expected=${expected} got=${got}`,
    );
    failed += 1;
  }
}

type ParseCase = {
  label: string;
  rawText: string;
  expectedMainMeal?: string;
  expectedSwallow?: string | null;
  expectedProtein?: string | null;
  expectedAddOns?: string[];
};

function runParse(tc: ParseCase): void {
  const { mainMeal, addOns } = parseOrderText(tc.rawText);
  const classified = classifyAddOns(addOns, PROTEINS, SWALLOWS);

  const mainOk =
    tc.expectedMainMeal === undefined ||
    mainMeal.toLowerCase().trim() === tc.expectedMainMeal.toLowerCase().trim();
  const swallowOk =
    tc.expectedSwallow === undefined ||
    classified.swallowName === tc.expectedSwallow;
  const proteinOk =
    tc.expectedProtein === undefined ||
    classified.proteinName === tc.expectedProtein;
  const addOnsOk =
    tc.expectedAddOns === undefined ||
    JSON.stringify(addOns) === JSON.stringify(tc.expectedAddOns);

  const ok = mainOk && swallowOk && proteinOk && addOnsOk;

  if (ok) {
    console.log(`  ✓  ${tc.label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${tc.label}`);
    if (!mainOk)
      console.error(
        `     mainMeal  expected=${JSON.stringify(tc.expectedMainMeal)} got=${JSON.stringify(mainMeal)}`,
      );
    if (!swallowOk)
      console.error(
        `     swallow   expected=${JSON.stringify(tc.expectedSwallow)} got=${JSON.stringify(classified.swallowName)}`,
      );
    if (!proteinOk)
      console.error(
        `     protein   expected=${JSON.stringify(tc.expectedProtein)} got=${JSON.stringify(classified.proteinName)}`,
      );
    if (!addOnsOk)
      console.error(
        `     addOns    expected=${JSON.stringify(tc.expectedAddOns)} got=${JSON.stringify(addOns)}`,
      );
    console.error(`     raw="${tc.rawText}"`);
    failed += 1;
  }
}

// ── isNoLunchEntry tests ───────────────────────────────────────────────────────

console.log("\n── isNoLunchEntry() checks ──────────────────────────────────────────");

// Positive cases (should return true)
assertNoLunch("NO LUNCH REQUIRED", true);    // A
assertNoLunch("no lunch",           true);   // B
assertNoLunch("nil",                true);   // C
assertNoLunch("N/A",                true);   // D
assertNoLunch("na",                 true);   // E
assertNoLunch("none",               true);   // F
assertNoLunch("no meal required",   true);   // G
assertNoLunch("not eating",         true);   // H
assertNoLunch("no food",            true);   // P
assertNoLunch("  NO LUNCH  ",       true);   // leading/trailing whitespace
assertNoLunch("No Lunch Today",     true);   // mixed case variant
assertNoLunch("no meal today",      true);
assertNoLunch("lunch not required", true);

// Negative cases (should return false)
assertNoLunch("Jollof Rice",                         false);  // I
assertNoLunch("Noodles with no sauce",               false);  // Q
assertNoLunch("Okro Soup + Eba",                     false);
assertNoLunch("no lunch required meal",              false);  // extra word → not in set
assertNoLunch("",                                    false);

// ── Protein alias tests ────────────────────────────────────────────────────────

console.log("\n── Protein alias + add-on split tests ──────────────────────────────");

// Test J — "Assorted" → "Assorted Meat"
runParse({
  label: "J — Jollof Rice + Assorted → protein=Assorted Meat",
  rawText: "Jollof Rice + Assorted",
  expectedMainMeal: "Jollof Rice",
  expectedProtein: "Assorted Meat",
  expectedSwallow: null,
});

// Test K — "Goat" → "Goat Meat"
runParse({
  label: "K — Egusi Soup + Goat → protein=Goat Meat",
  rawText: "Egusi Soup + Goat",
  expectedMainMeal: "Egusi Soup",
  expectedProtein: "Goat Meat",
  expectedSwallow: null,
});

// Test L — "Cow Meat" → "Beef"
runParse({
  label: "L — Okro Soup + Cow Meat → protein=Beef",
  rawText: "Okro Soup + Cow Meat",
  expectedMainMeal: "Okro Soup",
  expectedProtein: "Beef",
  expectedSwallow: null,
});

// Test M — "Boiled Egg" → "Egg"
runParse({
  label: "M — Oha Soup with Boiled Egg → protein=Egg",
  rawText: "Oha Soup with Boiled Egg",
  expectedMainMeal: "Oha Soup",
  expectedProtein: "Egg",
  expectedSwallow: null,
});

// Test N — "Okro Soup + Eba + Fish" (+ splitting in add-on section)
runParse({
  label: "N — Okro Soup + Eba + Fish → swallow=Eba, protein=Fish",
  rawText: "Okro Soup + Eba + Fish",
  expectedMainMeal: "Okro Soup",
  expectedSwallow: "Eba",
  expectedProtein: "Fish",
  expectedAddOns: ["Eba", "Fish"],
});

// Test O — "Egusi Soup + Semo and Beef" (and splitting in add-on section)
runParse({
  label: "O — Egusi Soup + Semo and Beef → swallow=Semo, protein=Beef",
  rawText: "Egusi Soup + Semo and Beef",
  expectedMainMeal: "Egusi Soup",
  expectedSwallow: "Semo",
  expectedProtein: "Beef",
  expectedAddOns: ["Semo", "Beef"],
});

// Extra: "Assorted Meats" (plural alias) → "Assorted Meat"
runParse({
  label: "extra — Assorted Meats (plural) → Assorted Meat",
  rawText: "Jollof Rice with Assorted Meats",
  expectedMainMeal: "Jollof Rice",
  expectedProtein: "Assorted Meat",
});

// Extra: "Cow" alone → "Beef"
runParse({
  label: "extra — Cow alone → Beef",
  rawText: "Egusi Soup with Cow",
  expectedMainMeal: "Egusi Soup",
  expectedProtein: "Beef",
});

// Extra: three-part add-on chain via multiple +
runParse({
  label: "extra — Oha Soup + Eba + Chicken + Fish (first protein wins)",
  rawText: "Oha Soup + Eba + Chicken",
  expectedMainMeal: "Oha Soup",
  expectedSwallow: "Eba",
  expectedProtein: "Chicken",
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
