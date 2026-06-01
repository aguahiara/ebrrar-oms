/**
 * Acceptance tests — no-protein annotation recognition (Business Rule §10).
 *
 * Run with:
 *   npx tsx scripts/test-no-protein.ts
 *
 * Covers:
 *   A  — Menu item "Pottage Beans with Dodo (No Extra Protein)" +
 *         order "Pottage Beans with Dodo"
 *         → matches, protein not required
 *
 *   B  — Menu item "Pottage Beans with Dodo" +
 *         order "Pottage Beans with Dodo (No Extra Protein)"
 *         → matches, protein not required for this order
 *
 *   C  — Order "Jollof Rice + Chicken" (no annotation)
 *         → protein = "Chicken", protein required by default
 *
 *   D  — Order "Jollof Rice (No Extra Protein)"
 *         → protein not required, no exception
 *
 *   E  — hasNoProteinAnnotation() unit checks
 *
 *   F  — stripNoProteinAnnotation() unit checks
 *
 *   G  — Various phrase variants: "(No Protein)", "(No Additional Protein)",
 *         "(Without Protein)", bare "No Extra Protein"
 *
 *   H  — Annotation does not affect a normal order without annotation
 *
 *   I  — menuItemMainMealKey strips annotation before comparing
 *         (tested via parse/match path)
 *
 *   J  — Order "Jollof Rice No Extra Protein" (no parens)
 *         → stripped and matched as "Jollof Rice"
 */

import {
  classifyAddOns,
  hasNoProteinAnnotation,
  parseOrderText,
  stripNoProteinAnnotation,
} from "../lib/parse-order.js";
import { normalize } from "../lib/matchMeal.js";

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

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${label}`);
    failed += 1;
  }
}

function assertEq<T>(label: string, got: T, expected: T): void {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     got:      ${JSON.stringify(got)}`);
    failed += 1;
  }
}

// Parse a raw text, strip annotation first, then classify add-ons.
function parseFull(rawText: string) {
  const effective = stripNoProteinAnnotation(rawText);
  const { mainMeal, addOns } = parseOrderText(effective);
  const classified = classifyAddOns(addOns, PROTEINS, SWALLOWS);
  return { mainMeal, addOns, ...classified };
}

// ── E: hasNoProteinAnnotation() ────────────────────────────────────────────────

console.log("\n── E: hasNoProteinAnnotation() ──────────────────────────────────────");

assert('detects "(No Extra Protein)"',
  hasNoProteinAnnotation("Pottage Beans with Dodo (No Extra Protein)"));
assert('detects "(No Protein)"',
  hasNoProteinAnnotation("Jollof Rice (No Protein)"));
assert('detects "(No Additional Protein)"',
  hasNoProteinAnnotation("Egusi Soup (No Additional Protein)"));
assert('detects "(Without Protein)"',
  hasNoProteinAnnotation("Oha Soup with Eba (Without Protein)"));
assert("detects bare 'No Extra Protein' (no parens)",
  hasNoProteinAnnotation("Jollof Rice No Extra Protein"));
assert("does NOT detect normal order",
  !hasNoProteinAnnotation("Jollof Rice + Chicken"));
assert("does NOT detect empty string",
  !hasNoProteinAnnotation(""));
assert("case-insensitive: 'NO PROTEIN'",
  hasNoProteinAnnotation("Pottage Beans (NO PROTEIN)"));
assert("case-insensitive: 'no extra protein' lowercase",
  hasNoProteinAnnotation("jollof rice (no extra protein)"));

// ── F: stripNoProteinAnnotation() ─────────────────────────────────────────────

console.log("\n── F: stripNoProteinAnnotation() ───────────────────────────────────");

assertEq('strips "(No Extra Protein)" with space cleanup',
  stripNoProteinAnnotation("Pottage Beans with Dodo (No Extra Protein)"),
  "Pottage Beans with Dodo");

assertEq('strips "(No Protein)"',
  stripNoProteinAnnotation("Jollof Rice (No Protein)"),
  "Jollof Rice");

assertEq('strips bare "No Extra Protein"',
  stripNoProteinAnnotation("Jollof Rice No Extra Protein"),
  "Jollof Rice");

assertEq("no annotation — unchanged",
  stripNoProteinAnnotation("Jollof Rice + Chicken"),
  "Jollof Rice + Chicken");

assertEq("strips multiple occurrences",
  stripNoProteinAnnotation("(No Extra Protein) Jollof Rice (No Protein)"),
  "Jollof Rice");

assertEq("trims trailing whitespace after strip",
  stripNoProteinAnnotation("Jollof Rice   (No Protein)  "),
  "Jollof Rice");

// ── G: Phrase variants ─────────────────────────────────────────────────────────

console.log("\n── G: All annotation variants → matching key unaffected ────────────");

const variants: Array<{ raw: string; expectedKey: string }> = [
  { raw: "Pottage Beans (No Extra Protein)",     expectedKey: "pottage beans" },
  { raw: "Pottage Beans (No Protein)",           expectedKey: "pottage beans" },
  { raw: "Pottage Beans (No Additional Protein)",expectedKey: "pottage beans" },
  { raw: "Pottage Beans (Without Protein)",      expectedKey: "pottage beans" },
  { raw: "Pottage Beans No Extra Protein",       expectedKey: "pottage beans" },
];

for (const { raw, expectedKey } of variants) {
  const stripped = stripNoProteinAnnotation(raw);
  const key = normalize(parseOrderText(stripped).mainMeal);
  assertEq(`variant "${raw}" → key`, key, expectedKey);
}

// ── A: Menu item has annotation, order does not ────────────────────────────────

console.log("\n── A: Menu item has annotation, order does not ─────────────────────");

// Simulate: order "Pottage Beans with Dodo"
// Menu item canonical_name: "Pottage Beans with Dodo (No Extra Protein)"
// Expected: order main meal = "pottage beans",
//           menu item main meal key after stripping = "pottage beans"
//           → they match

{
  const orderRaw = "Pottage Beans with Dodo";
  const menuItemName = "Pottage Beans with Dodo (No Extra Protein)";
  const orderNoProtein = hasNoProteinAnnotation(orderRaw);
  const menuItemNoProtein = hasNoProteinAnnotation(menuItemName);

  const { mainMeal: orderMain } = parseOrderText(
    orderNoProtein ? stripNoProteinAnnotation(orderRaw) : orderRaw,
  );
  const orderKey = normalize(orderMain);

  // Simulate menuItemMainMealKey: strip annotation then extractMainMeal
  const { mainMeal: menuMain } = parseOrderText(stripNoProteinAnnotation(menuItemName));
  const menuKey = normalize(menuMain);

  assertEq("A — order main meal key", orderKey, "pottage beans");
  assertEq("A — menu item main meal key (stripped)", menuKey, "pottage beans");
  assert("A — keys match", orderKey === menuKey);
  assert("A — menuItemNoProtein detected", menuItemNoProtein);
  assert("A — orderNoProtein not detected", !orderNoProtein);
  assert("A — effective proteinRequirement = not_required",
    menuItemNoProtein || orderNoProtein); // either triggers not_required
}

// ── B: Order has annotation, menu item does not ────────────────────────────────

console.log("\n── B: Order has annotation, menu item does not ─────────────────────");

{
  const orderRaw = "Pottage Beans with Dodo (No Extra Protein)";
  const menuItemName = "Pottage Beans with Dodo";
  const orderNoProtein = hasNoProteinAnnotation(orderRaw);
  const menuItemNoProtein = hasNoProteinAnnotation(menuItemName);

  const effectiveOrder = orderNoProtein
    ? stripNoProteinAnnotation(orderRaw)
    : orderRaw;
  const { mainMeal: orderMain } = parseOrderText(effectiveOrder);
  const orderKey = normalize(orderMain);
  const { mainMeal: menuMain } = parseOrderText(menuItemName);
  const menuKey = normalize(menuMain);

  assertEq("B — order main meal key (stripped)", orderKey, "pottage beans");
  assertEq("B — menu item main meal key", menuKey, "pottage beans");
  assert("B — keys match", orderKey === menuKey);
  assert("B — orderNoProtein detected", orderNoProtein);
  assert("B — menuItemNoProtein not detected", !menuItemNoProtein);
  assert("B — effective proteinRequirement = not_required",
    orderNoProtein || menuItemNoProtein);
}

// ── C: Normal order with protein ──────────────────────────────────────────────

console.log("\n── C: Normal order — protein captured, requirement = required ───────");

{
  const { mainMeal, proteinName, swallowName } = parseFull("Jollof Rice + Chicken");
  assertEq("C — mainMeal",    mainMeal,    "Jollof Rice");
  assertEq("C — proteinName", proteinName, "Chicken");
  assertEq("C — swallowName", swallowName, null);
  assert("C — no annotation in order",
    !hasNoProteinAnnotation("Jollof Rice + Chicken"));
}

// ── D: Order with no-protein annotation, no protein token ────────────────────

console.log("\n── D: Order with annotation — protein not required ─────────────────");

{
  const rawText = "Jollof Rice (No Extra Protein)";
  const orderNoProtein = hasNoProteinAnnotation(rawText);
  const { mainMeal, proteinName } = parseFull(rawText);

  assertEq("D — mainMeal (after strip)", mainMeal, "Jollof Rice");
  assertEq("D — proteinName", proteinName, null);
  assert("D — orderNoProtein detected", orderNoProtein);
  assert("D — no protein exception triggered (proteinRequirement = not_required)",
    orderNoProtein);
}

// ── H: Normal order — no annotation side-effects ─────────────────────────────

console.log("\n── H: Normal orders unaffected by feature ───────────────────────────");

{
  const cases = [
    { raw: "Egusi Soup with Eba + Chicken",  expMain: "egusi soup", expSwallow: "Eba",  expProtein: "Chicken" },
    { raw: "Jollof Rice",                    expMain: "jollof rice", expSwallow: null, expProtein: null },
    { raw: "Okro Soup + Semo and Beef",      expMain: "okro soup",  expSwallow: "Semo", expProtein: "Beef" },
  ];
  for (const tc of cases) {
    const { mainMeal, proteinName, swallowName } = parseFull(tc.raw);
    assertEq(`H — "${tc.raw}" main`, normalize(mainMeal), tc.expMain);
    assertEq(`H — "${tc.raw}" swallow`, swallowName, tc.expSwallow);
    assertEq(`H — "${tc.raw}" protein`, proteinName, tc.expProtein);
  }
}

// ── I: Annotation in add-on position ─────────────────────────────────────────

console.log("\n── I: Annotation in add-on position ────────────────────────────────");

{
  // "Pottage Beans with Dodo (No Extra Protein)" — annotation is after the add-on
  const raw = "Pottage Beans with Dodo (No Extra Protein)";
  const orderNoProtein = hasNoProteinAnnotation(raw);
  const effective = stripNoProteinAnnotation(raw);
  const { mainMeal, addOns } = parseOrderText(effective);
  const { proteinName, swallowName, sideNames } = classifyAddOns(addOns, PROTEINS, SWALLOWS);

  assertEq("I — mainMeal", mainMeal, "Pottage Beans");
  assertEq("I — addOns after strip", addOns, ["Dodo"]);
  assertEq("I — protein (none in vocab)", proteinName, null);
  assertEq("I — swallow", swallowName, null);
  assertEq("I — sideNames", sideNames, ["Dodo"]);
  assert("I — orderNoProtein detected", orderNoProtein);
}

// ── J: Bare phrase without parens ─────────────────────────────────────────────

console.log("\n── J: Bare no-protein phrase (no parentheses) ───────────────────────");

{
  const raw = "Jollof Rice No Extra Protein";
  const orderNoProtein = hasNoProteinAnnotation(raw);
  const effective = stripNoProteinAnnotation(raw);
  const { mainMeal } = parseOrderText(effective);

  assertEq("J — stripped text", effective, "Jollof Rice");
  assertEq("J — mainMeal key", normalize(mainMeal), "jollof rice");
  assert("J — orderNoProtein detected", orderNoProtein);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
