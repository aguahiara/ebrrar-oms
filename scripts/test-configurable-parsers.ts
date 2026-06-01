/**
 * Acceptance tests — configurable upload parsers (lib/configurable-parsers.ts).
 *
 * Run with:  npx tsx scripts/test-configurable-parsers.ts
 *
 * Coverage:
 *  §1  parseConfigurableGrid — single_sheet_weekly_grid
 *      1a  basic weekday grid (opt-outs, empty names skipped)
 *      1b  header auto-detection (header is not on row 0)
 *      1c  partial column-header matching
 *      1d  custom optOutValues override
 *      1e  named sheet selection
 *  §2  parseConfigurableMultiSheet — form mode (ELCREST style)
 *      2a  explicit protein + swallow columns captured in proteinRaw/swallowRaw
 *      2b  nil/empty protein or swallow → null; hasExplicitAddOns still true
 *      2c  both nil → no proteinRaw/swallowRaw keys on the record
 *      2d  explicit sheetDayPattern Record mapping
 *  §3  parseConfigurableMultiSheet — remarks mode (Heirs Energies style)
 *      3a  stripMealPrefix + cleanRemarks assigned to both proteinRaw/swallowRaw
 *      3b  empty remarks → no add-on fields on the record
 *  §4  parseSummaryQuantity — summary_quantity_format
 *      4a  plain rows without comment column
 *      4b  comment splits ("4 with Semo, 2 Eba")
 *      4c  split total < row total → remainder rows emitted
 *      4d  split total > row total → capped at totalQty
 *      4e  mixed rows (comment + no-comment in same sheet)
 *  §5  parseWithConfig dispatcher
 *      5a  routes single_sheet_weekly_grid correctly
 *      5b  routes multi_sheet_daily_form correctly
 *      5c  routes summary_quantity_format correctly
 *      5d  throws for single_sheet_weekly_grid_with_reference_menu
 *  §6  getWorkbookSheetNames — sheet list without full parse
 *  §7  Error paths
 *      7a  empty sheet → "Sheet is empty"
 *      7b  header not found within scanLimit → clear error
 *      7c  no weekday sheets → "No weekday sheets found"
 *      7d  no valid summary rows → "No valid summary rows found"
 */

import * as XLSX from "xlsx";
import type { OrderRecord } from "../lib/order-types.js";
import {
  parseConfigurableGrid,
  parseConfigurableMultiSheet,
  parseSummaryQuantity,
  parseWithConfig,
  getWorkbookSheetNames,
} from "../lib/configurable-parsers.js";
import type { CustomerUploadConfig } from "../lib/upload-config.js";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
    failed++;
  }
}

function eq<T>(label: string, got: T, expected: T): void {
  const gotS = JSON.stringify(got);
  const expS = JSON.stringify(expected);
  if (gotS === expS) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     expected: ${expS}`);
    console.error(`     got:      ${gotS}`);
    failed++;
  }
}

function throws(label: string, fn: () => unknown, fragment?: string): void {
  try {
    fn();
    console.error(`  ✗  ${label}  (expected an error, got none)`);
    failed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (fragment && !msg.toLowerCase().includes(fragment.toLowerCase())) {
      console.error(`  ✗  ${label}`);
      console.error(`     error should contain "${fragment}"`);
      console.error(`     got: "${msg}"`);
      failed++;
    } else {
      console.log(`  ✓  ${label}`);
      passed++;
    }
  }
}

// ── Workbook builder helpers ───────────────────────────────────────────────────

type AoA = unknown[][];

function makeWorkbook(sheets: Record<string, AoA>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── §1. parseConfigurableGrid ─────────────────────────────────────────────────

console.log("\n── §1a. parseConfigurableGrid — basic weekday grid ──────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Name",  "Monday",      "Tuesday",    "Wednesday",  "Thursday",  "Friday"],
      ["Alice", "Jollof Rice", "Egusi + Eba","N/A",        "Oha Soup",  "N/A"],
      ["Bob",   "Fried Rice",  "nil",        "Egusi Soup", "N/A",       ""],
      ["",      "ignored",     "",           "",           "",          ""],  // empty name → skip
    ],
  });

  const records = parseConfigurableGrid(buf, {
    nameColumn: "Name",
    weekdayColumns: { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" },
  });

  // Alice: Mon, Tue, Thu  (Wed=N/A, Fri=N/A → skipped)
  // Bob:   Mon, Wed        (Tue=nil, Thu=N/A, Fri="" → all skipped)
  // unnamed row → skipped
  eq("§1a record count", records.length, 5);
  eq("§1a Alice/Mon", records[0], { employeeName: "Alice", dayOfWeek: "Mon", rawMealText: "Jollof Rice" });
  eq("§1a Alice/Tue", records[1], { employeeName: "Alice", dayOfWeek: "Tue", rawMealText: "Egusi + Eba" });
  eq("§1a Alice/Thu", records[2], { employeeName: "Alice", dayOfWeek: "Thu", rawMealText: "Oha Soup" });
  eq("§1a Bob/Mon",   records[3], { employeeName: "Bob",   dayOfWeek: "Mon", rawMealText: "Fried Rice" });
  eq("§1a Bob/Wed",   records[4], { employeeName: "Bob",   dayOfWeek: "Wed", rawMealText: "Egusi Soup" });
}

console.log("\n── §1b. parseConfigurableGrid — header auto-detected on row 3 ───────");
{
  const buf = makeWorkbook({
    Report: [
      ["Weekly Order Summary — Week 22"],  // row 0: title (scanned, not matched)
      [],                                   // row 1: blank row
      ["Department: All"],                  // row 2: meta
      ["Name", "Mon", "Tue"],              // row 3: real header row
      ["Amina", "Pepper Soup", "Rice"],    // row 4: data
    ],
  });

  const records = parseConfigurableGrid(buf, {
    nameColumn: "Name",
    weekdayColumns: { Mon: "Mon", Tue: "Tue" },
    headerScanRows: 10,
  });

  eq("§1b record count", records.length, 2);
  eq("§1b Mon", records[0], { employeeName: "Amina", dayOfWeek: "Mon", rawMealText: "Pepper Soup" });
  eq("§1b Tue", records[1], { employeeName: "Amina", dayOfWeek: "Tue", rawMealText: "Rice" });
}

console.log("\n── §1c. parseConfigurableGrid — partial column-header matching ───────");
{
  // Config uses short keys ("name" / "mon") that are substrings of the actual headers
  const buf = makeWorkbook({
    Sheet1: [
      ["Employee Name", "Lunch (Mon)", "Lunch (Tue)"],
      ["Zainab",        "Eba + Egusi", "Fried Rice"],
    ],
  });

  const records = parseConfigurableGrid(buf, {
    nameColumn: "name",       // partial: matches "Employee Name"
    weekdayColumns: { Mon: "mon", Tue: "tue" }, // partial: matches "Lunch (Mon)" / "Lunch (Tue)"
  });

  eq("§1c record count", records.length, 2);
  eq("§1c Mon meal", records[0].rawMealText, "Eba + Egusi");
  eq("§1c Tue meal", records[1].rawMealText, "Fried Rice");
}

console.log("\n── §1d. parseConfigurableGrid — custom optOutValues ─────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Name",   "Mon",         "Tue"],
      ["Emeka",  "Oha Soup",    "ABSENT"],   // custom opt-out
      ["Fatima", "not ordering","Jollof"],   // another custom opt-out
    ],
  });

  const records = parseConfigurableGrid(buf, {
    nameColumn: "Name",
    weekdayColumns: { Mon: "Mon", Tue: "Tue" },
    optOutValues: ["absent", "not ordering"],
  });

  eq("§1d record count", records.length, 2);
  eq("§1d Emeka/Mon", records[0].rawMealText, "Oha Soup");
  eq("§1d Fatima/Tue", records[1].rawMealText, "Jollof");
}

console.log("\n── §1e. parseConfigurableGrid — named sheet selection ───────────────");
{
  const buf = makeWorkbook({
    "Summary":    [["ignore", "Mon"], ["x", "y"]],
    "Real Orders":[["Name", "Mon"], ["Chibundo", "Banga Soup"]],
  });

  const records = parseConfigurableGrid(buf, {
    nameColumn: "Name",
    weekdayColumns: { Mon: "Mon" },
    sheetName: "Real Orders",
  });

  eq("§1e record count", records.length, 1);
  eq("§1e named sheet meal", records[0].rawMealText, "Banga Soup");
}

// ── §2. parseConfigurableMultiSheet — form mode (ELCREST style) ───────────────

console.log("\n── §2a. parseConfigurableMultiSheet — form mode basics ──────────────");
{
  const buf = makeWorkbook({
    "Monday": [
      ["Staff Name", "Meal Choice", "Protein",  "Swallow"],
      ["Alice",      "Egusi Soup",  "Chicken",  "Eba"],
      ["Bob",        "Oha Soup",    "nil",       "Semo"],
      ["Carol",      "Rice",        "",          ""],      // both empty
    ],
    "Tuesday": [
      ["Staff Name", "Meal Choice", "Protein", "Swallow"],
      ["Alice",      "Fried Rice",  "Beef",    "nil"],
    ],
  });

  const records = parseConfigurableMultiSheet(buf, {
    nameColumn: "Staff Name",
    mealColumn: "Meal Choice",
    proteinColumn: "Protein",
    swallowColumn: "Swallow",
  });

  // 4 data rows total: Alice/Mon, Bob/Mon, Carol/Mon, Alice/Tue
  eq("§2a record count", records.length, 4);

  const aliceMon = records[0];
  eq("§2a Alice/Mon meal",    aliceMon.rawMealText, "Egusi Soup");
  eq("§2a Alice/Mon protein", aliceMon.proteinRaw,  "Chicken");
  eq("§2a Alice/Mon swallow", aliceMon.swallowRaw,  "Eba");

  // Bob: protein = nil (opt-out → null), swallow = "Semo"; hasExplicitAddOns = true
  const bobMon = records[1];
  eq("§2a Bob/Mon meal",    bobMon.rawMealText, "Oha Soup");
  eq("§2a Bob/Mon protein", bobMon.proteinRaw,  null);
  eq("§2a Bob/Mon swallow", bobMon.swallowRaw,  "Semo");

  // Carol: both empty → hasExplicitAddOns = false → no spread
  const carolMon = records[2];
  eq("§2a Carol/Mon meal", carolMon.rawMealText, "Rice");
  ok("§2a Carol/Mon no proteinRaw key", !("proteinRaw" in carolMon));
  ok("§2a Carol/Mon no swallowRaw key", !("swallowRaw" in carolMon));

  // Alice/Tue: protein="Beef", swallow=nil → null
  const aliceTue = records[3];
  eq("§2a Alice/Tue meal",    aliceTue.rawMealText, "Fried Rice");
  eq("§2a Alice/Tue protein", aliceTue.proteinRaw,  "Beef");
  eq("§2a Alice/Tue swallow", aliceTue.swallowRaw,  null);
}

console.log("\n── §2b. parseConfigurableMultiSheet — opt-out meal rows skipped ─────");
{
  const buf = makeWorkbook({
    "Wednesday": [
      ["Name", "Meal",     "Protein"],
      ["Dave", "n/a",      "Chicken"],   // meal is opt-out → whole row skipped
      ["Eve",  "Jollof",   ""],
    ],
  });

  const records = parseConfigurableMultiSheet(buf, {
    nameColumn: "Name",
    mealColumn: "Meal",
    proteinColumn: "Protein",
  });

  // Dave skipped (meal = n/a); Eve kept
  eq("§2b record count", records.length, 1);
  eq("§2b Eve meal", records[0].rawMealText, "Jollof");
}

console.log("\n── §2c. parseConfigurableMultiSheet — explicit sheetDayPattern map ──");
{
  const buf = makeWorkbook({
    "MON SELECTION":  [["Name", "Meal"], ["Aisha", "Jollof Rice"]],
    "TUE SELECTION":  [["Name", "Meal"], ["Aisha", "Fried Rice"]],
    "Summary":        [["ignore"]],  // not in pattern → skipped
  });

  const records = parseConfigurableMultiSheet(buf, {
    nameColumn: "Name",
    mealColumn: "Meal",
    sheetDayPattern: { "mon selection": "Mon", "tue selection": "Tue" },
  });

  eq("§2c record count", records.length, 2);
  eq("§2c Mon", records[0], { employeeName: "Aisha", dayOfWeek: "Mon", rawMealText: "Jollof Rice" });
  eq("§2c Tue", records[1], { employeeName: "Aisha", dayOfWeek: "Tue", rawMealText: "Fried Rice" });
}

// ── §3. parseConfigurableMultiSheet — remarks mode (Heirs Energies style) ─────

console.log("\n── §3a. parseConfigurableMultiSheet — remarks mode + stripMealPrefix ─");
{
  const buf = makeWorkbook({
    "Monday": [
      ["Name",  "Meal",                       "Remarks"],
      ["Ngozi", "[OPTION 1] - Egusi + Swallow","Chicken / Eba"],
      ["Kemi",  "[OPTION 2] - Jollof Rice",   ""],   // empty remarks
    ],
  });

  const records = parseConfigurableMultiSheet(buf, {
    nameColumn: "Name",
    mealColumn: "Meal",
    remarksColumn: "Remarks",
    stripMealPrefix: true,
  });

  eq("§3a record count", records.length, 2);

  // Ngozi: prefix stripped; cleanRemarks("Chicken / Eba") → "Chicken Eba"
  const ngozi = records[0];
  eq("§3a Ngozi meal", ngozi.rawMealText, "Egusi + Swallow");
  eq("§3a Ngozi proteinRaw", ngozi.proteinRaw, "Chicken Eba");
  eq("§3a Ngozi swallowRaw", ngozi.swallowRaw, "Chicken Eba");

  // Kemi: remarks empty → no add-ons
  const kemi = records[1];
  eq("§3a Kemi meal", kemi.rawMealText, "Jollof Rice");
  ok("§3a Kemi no proteinRaw key", !("proteinRaw" in kemi));
  ok("§3a Kemi no swallowRaw key", !("swallowRaw" in kemi));
}

console.log("\n── §3b. parseConfigurableMultiSheet — remarks with dash/slash clean ──");
{
  const buf = makeWorkbook({
    "Tuesday": [
      ["Name", "Meal",     "Remarks"],
      ["Temi", "Oha Soup", "Assorted - Semo"],  // dash in remarks
    ],
  });

  const records = parseConfigurableMultiSheet(buf, {
    nameColumn: "Name",
    mealColumn: "Meal",
    remarksColumn: "Remarks",
  });

  // cleanRemarks("Assorted - Semo") → replace "-" → "Assorted   Semo" → collapse → "Assorted Semo"
  eq("§3b remarks cleanRemarks", records[0].proteinRaw, "Assorted Semo");
}

// ── §4. parseSummaryQuantity ──────────────────────────────────────────────────

console.log("\n── §4a. parseSummaryQuantity — plain rows (no comment column) ────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",        "Qty"],
      ["Jollof Rice", "3"],
      ["Egusi Soup",  "2"],
    ],
  });

  const records = parseSummaryQuantity(buf, {
    mealColumn: "Meal",
    quantityColumn: "Qty",
    defaultDay: "Wed",
  });

  // 3 + 2 = 5 plain rows; no comment column → SUM-R{rowNum}-S1-{inst}
  eq("§4a record count", records.length, 5);

  // Row 1 (Jollof Rice): SUM-R1-S1-1, SUM-R1-S1-2, SUM-R1-S1-3
  eq("§4a first employee", records[0].employeeName, "SUM-R1-S1-1");
  eq("§4a first meal", records[0].rawMealText, "Jollof Rice");
  eq("§4a first day", records[0].dayOfWeek, "Wed");
  eq("§4a last plain Jollof", records[2].employeeName, "SUM-R1-S1-3");

  // Row 2 (Egusi Soup): SUM-R2-S1-1, SUM-R2-S1-2
  eq("§4a first Egusi", records[3].employeeName, "SUM-R2-S1-1");
  eq("§4a second Egusi", records[4].employeeName, "SUM-R2-S1-2");
  eq("§4a Egusi meal", records[3].rawMealText, "Egusi Soup");
}

console.log("\n── §4b. parseSummaryQuantity — comment splits ────────────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",     "Qty", "Comment"],
      ["Oha Soup", "6",   "4 with Semo, 2 Eba"],
    ],
  });

  const records = parseSummaryQuantity(buf, {
    mealColumn: "Meal",
    quantityColumn: "Qty",
    commentColumn: "Comment",
    defaultDay: "Mon",
  });

  // 6 records: 4 × "Oha Soup + Semo", 2 × "Oha Soup + Eba"
  eq("§4b record count", records.length, 6);

  const semoRecs = records.filter((r) => r.rawMealText === "Oha Soup + Semo");
  const ebaRecs  = records.filter((r) => r.rawMealText === "Oha Soup + Eba");
  eq("§4b Semo split count", semoRecs.length, 4);
  eq("§4b Eba split count", ebaRecs.length, 2);

  // Synthetic names: split 1 = S1, split 2 = S2
  eq("§4b first Semo employee", records[0].employeeName, "SUM-R1-S1-1");
  eq("§4b last Semo employee",  records[3].employeeName, "SUM-R1-S1-4");
  eq("§4b first Eba employee",  records[4].employeeName, "SUM-R1-S2-1");
  eq("§4b last Eba employee",   records[5].employeeName, "SUM-R1-S2-2");
}

console.log("\n── §4c. parseSummaryQuantity — split total < row total (remainder) ──");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",        "Qty", "Comment"],
      ["Jollof Rice", "5",   "3 Semo"],   // 3 split + 2 remainder
    ],
  });

  const records = parseSummaryQuantity(buf, {
    mealColumn: "Meal",
    quantityColumn: "Qty",
    commentColumn: "Comment",
  });

  eq("§4c total count", records.length, 5);

  const splitRecs  = records.filter((r) => r.rawMealText === "Jollof Rice + Semo");
  const remainder  = records.filter((r) => r.rawMealText === "Jollof Rice");
  eq("§4c split rows", splitRecs.length, 3);
  eq("§4c remainder rows", remainder.length, 2);

  // Remainder synthetic names use S0
  ok("§4c first remainder name", remainder[0].employeeName.includes("S0"));
}

console.log("\n── §4d. parseSummaryQuantity — split total > row total (capped) ─────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",        "Qty", "Comment"],
      ["Egusi Soup",  "3",   "5 with Semo"],  // comment claims 5, but qty = 3 → cap at 3
    ],
  });

  const records = parseSummaryQuantity(buf, {
    mealColumn: "Meal",
    quantityColumn: "Qty",
    commentColumn: "Comment",
  });

  eq("§4d capped count", records.length, 3);
  ok("§4d all Semo", records.every((r) => r.rawMealText === "Egusi Soup + Semo"));
}

console.log("\n── §4e. parseSummaryQuantity — mixed rows ────────────────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",        "Qty", "Comment"],
      ["Jollof",      "2",   ""],         // no comment → 2 plain
      ["Egusi",       "3",   "2 Eba, 1 Semo"], // 3 split
    ],
  });

  const records = parseSummaryQuantity(buf, {
    mealColumn: "Meal",
    quantityColumn: "Qty",
    commentColumn: "Comment",
  });

  eq("§4e total count", records.length, 5);  // 2 plain + 2 Eba + 1 Semo
  const jollof = records.filter((r) => r.rawMealText === "Jollof");
  eq("§4e plain Jollof count", jollof.length, 2);
  const eba  = records.filter((r) => r.rawMealText === "Egusi + Eba");
  const semo = records.filter((r) => r.rawMealText === "Egusi + Semo");
  eq("§4e Eba count",  eba.length,  2);
  eq("§4e Semo count", semo.length, 1);
}

// ── §5. parseWithConfig dispatcher ───────────────────────────────────────────

console.log("\n── §5a. parseWithConfig — routes single_sheet_weekly_grid ───────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Name",  "Mon"],
      ["Aisha", "Rice"],
    ],
  });

  const config: CustomerUploadConfig = {
    id: "test-id",
    customerId: "cust-1",
    formatName: "Test Grid",
    parserType: "single_sheet_weekly_grid",
    isActive: true,
    config: { nameColumn: "Name", weekdayColumns: { Mon: "Mon" } },
  };

  const records = parseWithConfig(buf, config);
  eq("§5a routes to grid", records.length, 1);
  eq("§5a grid record", records[0].rawMealText, "Rice");
}

console.log("\n── §5b. parseWithConfig — routes multi_sheet_daily_form ─────────────");
{
  const buf = makeWorkbook({
    "Friday": [
      ["Name",  "Meal",  "Protein"],
      ["Tunde", "Egusi", "Fish"],
    ],
  });

  const config: CustomerUploadConfig = {
    id: "test-id",
    customerId: "cust-2",
    formatName: "Test Multi-Sheet",
    parserType: "multi_sheet_daily_form",
    isActive: true,
    config: { nameColumn: "Name", mealColumn: "Meal", proteinColumn: "Protein" },
  };

  const records = parseWithConfig(buf, config);
  eq("§5b routes to multi-sheet", records.length, 1);
  eq("§5b multi-sheet protein", records[0].proteinRaw, "Fish");
}

console.log("\n── §5c. parseWithConfig — routes summary_quantity_format ────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",  "Count"],
      ["Rice",  "4"],
    ],
  });

  const config: CustomerUploadConfig = {
    id: "test-id",
    customerId: "cust-3",
    formatName: "Test Summary",
    parserType: "summary_quantity_format",
    isActive: true,
    config: { mealColumn: "Meal", quantityColumn: "Count" },
  };

  const records = parseWithConfig(buf, config);
  eq("§5c routes to summary", records.length, 4);
  ok("§5c all Rice", records.every((r) => r.rawMealText === "Rice"));
}

console.log("\n── §5d. parseWithConfig — throws for unimplemented parser type ───────");
{
  const buf = makeWorkbook({ Sheet1: [["Name"], ["Alice"]] });
  const config: CustomerUploadConfig = {
    id: "test-id",
    customerId: "cust-4",
    formatName: "Energia",
    parserType: "single_sheet_weekly_grid_with_reference_menu",
    isActive: true,
    config: {},
  };

  throws(
    "§5d unimplemented type throws",
    () => parseWithConfig(buf, config),
    "not yet fully implemented",
  );
}

// ── §6. getWorkbookSheetNames ─────────────────────────────────────────────────

console.log("\n── §6. getWorkbookSheetNames ─────────────────────────────────────────");
{
  const buf = makeWorkbook({
    "Monday":    [["Name"]],
    "Tuesday":   [["Name"]],
    "Wednesday": [["Name"]],
  });

  const names = getWorkbookSheetNames(buf);
  eq("§6 sheet names", names, ["Monday", "Tuesday", "Wednesday"]);

  // The catch-and-return-[] path exists for safety; XLSX.read with bookSheets:true
  // is resilient and almost never throws, so we verify the function is callable
  // without throwing rather than asserting a specific error-path output.
  let noThrow = true;
  try { getWorkbookSheetNames(Buffer.alloc(4, 0)); } catch { noThrow = false; }
  ok("§6 never throws on corrupt buffer", noThrow);
}

// ── §7. Error paths ──────────────────────────────────────────────────────────

console.log("\n── §7a. parseConfigurableGrid — empty sheet ─────────────────────────");
{
  const buf = makeWorkbook({ Sheet1: [] });
  throws(
    "§7a empty sheet throws",
    () => parseConfigurableGrid(buf, { nameColumn: "Name", weekdayColumns: { Mon: "Mon" } }),
    "Sheet is empty",
  );
}

console.log("\n── §7b. parseConfigurableGrid — header not found ────────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Unrelated column A", "Unrelated column B"],
      ["data", "data"],
    ],
  });

  throws(
    "§7b header not found throws",
    () => parseConfigurableGrid(buf, {
      nameColumn: "Name",
      weekdayColumns: { Mon: "Mon" },
      headerScanRows: 2,
    }),
    "Could not find a header row",
  );
}

console.log("\n── §7c. parseConfigurableMultiSheet — no weekday sheets ─────────────");
{
  const buf = makeWorkbook({
    "Summary":    [["Name", "Meal"]],
    "Cover Page": [["Title"]],
    // No sheet whose name contains a weekday word
  });

  throws(
    "§7c no weekday sheets throws",
    () => parseConfigurableMultiSheet(buf, { nameColumn: "Name", mealColumn: "Meal" }),
    "No weekday sheets found",
  );
}

console.log("\n── §7d. parseSummaryQuantity — no valid summary rows ────────────────");
{
  const buf = makeWorkbook({
    Sheet1: [
      ["Meal",    "Qty"],
      ["",        "5"],   // meal empty → skipped
      ["Jollof",  "0"],   // qty = 0 → skipped
      ["Egusi",   "abc"], // qty unparseable → skipped
    ],
  });

  throws(
    "§7d no valid rows throws",
    () => parseSummaryQuantity(buf, { mealColumn: "Meal", quantityColumn: "Qty" }),
    "No valid summary rows found",
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
