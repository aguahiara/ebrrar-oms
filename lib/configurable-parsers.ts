/**
 * Flexible, config-driven upload parsers.
 *
 * All three parsers return `OrderRecord[]` — the same type as the hardcoded
 * legacy parsers — so the existing resolveOrders / persistUpload pipeline
 * works without modification.
 *
 * Parser types:
 *   single_sheet_weekly_grid          → parseConfigurableGrid()
 *   multi_sheet_daily_form            → parseConfigurableMultiSheet()
 *   multi_sheet_daily_remarks         → parseConfigurableMultiSheet()
 *   summary_quantity_format           → parseSummaryQuantity()
 *   single_sheet_weekly_grid_with_reference_menu  → not yet implemented
 *
 * See lib/upload-config.ts for the per-type config shapes.
 */

import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import type {
  CustomerUploadConfig,
  EmployeeSelectionConfig,
  GridParserConfig,
  MultiSheetParserConfig,
  SummaryQuantityConfig,
} from "@/lib/upload-config";
import * as XLSX from "xlsx";

// ── Shared internal helpers ───────────────────────────────────────────────────

/** Normalise a cell value to a plain trimmed string. */
function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ") // non-breaking space → regular space
    .trim();
}

/** Default opt-out phrases used when none are configured. */
const DEFAULT_OPT_OUT = ["n/a", "na", "nil", "none", "not applicable"];

function isOptOut(text: string, optOutValues: string[]): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return optOutValues.some((v) => lower === v.toLowerCase().trim());
}

/** Build a lowercase → column-index map from a header row. */
function buildHeaderIndex(headerRow: unknown[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const key = cellText(cell).toLowerCase();
    if (key && !index.has(key)) index.set(key, i);
  });
  return index;
}

/**
 * Find the first row (within `scanLimit` rows) that contains a cell whose
 * lowercased text includes `needleText` (lowercased).  Returns the row index
 * or -1 if not found.
 */
function findHeaderRowIndex(
  rows: unknown[][],
  needleText: string,
  scanLimit: number,
): number {
  const needle = needleText.toLowerCase();
  const limit = Math.min(rows.length, scanLimit);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (
      row.some((cell) => cellText(cell).toLowerCase().includes(needle))
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Resolve the column index for a given header text.
 * Tries an exact lowercase match first, then a contains-match.
 */
function resolveColIndex(
  headerMap: Map<string, number>,
  headerText: string,
): number | undefined {
  const lower = headerText.toLowerCase();
  const exact = headerMap.get(lower);
  if (exact !== undefined) return exact;
  // Partial match: find first key that contains the search text
  for (const [key, idx] of headerMap) {
    if (key.includes(lower)) return idx;
  }
  return undefined;
}

/** Resolve which sheet to read from the workbook. */
function resolveSheet(
  workbook: XLSX.WorkBook,
  sheetName?: string,
): { name: string; sheet: XLSX.WorkSheet } {
  if (sheetName && workbook.SheetNames.includes(sheetName)) {
    return { name: sheetName, sheet: workbook.Sheets[sheetName] };
  }
  // Fall back to first sheet
  const name = workbook.SheetNames[0];
  if (!name) throw new Error("Workbook has no sheets.");
  return { name, sheet: workbook.Sheets[name] };
}

// ── Weekday name → DayOfWeek resolution ──────────────────────────────────────

const WEEKDAY_MAP: { match: string; day: DayOfWeek }[] = [
  { match: "monday",    day: "Mon" },
  { match: "tuesday",   day: "Tue" },
  { match: "wednesday", day: "Wed" },
  { match: "thursday",  day: "Thu" },
  { match: "friday",    day: "Fri" },
];

function detectDayFromSheetName(
  sheetName: string,
  pattern: "weekday_name" | Record<string, string>,
): DayOfWeek | null {
  const lower = sheetName.toLowerCase();

  if (pattern === "weekday_name") {
    for (const { match, day } of WEEKDAY_MAP) {
      if (lower.includes(match)) return day;
    }
    return null;
  }

  // Explicit mapping: key is a substring to find in the sheet name
  for (const [key, dayCode] of Object.entries(pattern)) {
    if (lower.includes(key.toLowerCase())) {
      return dayCode as DayOfWeek;
    }
  }
  return null;
}

// ── Parser A: single_sheet_weekly_grid ────────────────────────────────────────

/**
 * Parse a single-sheet weekly grid (AVON / HLA style).
 *
 * - Scans up to `headerScanRows` rows to find the header.
 * - Extracts one `OrderRecord` per non-empty cell in each weekday column.
 */
export function parseConfigurableGrid(
  buffer: Buffer,
  config: GridParserConfig,
): OrderRecord[] {
  const {
    sheetName,
    headerScanRows = 10,
    nameColumn,
    weekdayColumns,
    optOutValues = DEFAULT_OPT_OUT,
  } = config;

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const { sheet } = resolveSheet(workbook, sheetName);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) throw new Error("Sheet is empty.");

  const headerIdx = findHeaderRowIndex(rows, nameColumn, headerScanRows);
  if (headerIdx === -1) {
    throw new Error(
      `Could not find a header row containing "${nameColumn}" in the first ` +
        `${headerScanRows} rows. ` +
        `Check that the nameColumn configuration matches the actual column heading.`,
    );
  }

  const headerMap = buildHeaderIndex(rows[headerIdx]);

  const nameColIdx = resolveColIndex(headerMap, nameColumn);
  if (nameColIdx === undefined) {
    throw new Error(`Name column "${nameColumn}" not found in header row.`);
  }

  // Build day → column index pairs from the configured weekdayColumns.
  const dayColumns: { day: DayOfWeek; colIdx: number }[] = [];
  for (const [dayCode, colHeader] of Object.entries(weekdayColumns)) {
    if (!colHeader) continue;
    const colIdx = resolveColIndex(headerMap, colHeader);
    if (colIdx !== undefined) {
      dayColumns.push({ day: dayCode as DayOfWeek, colIdx });
    }
  }

  if (dayColumns.length === 0) {
    throw new Error(
      "No weekday columns found. Check the weekdayColumns configuration " +
        "matches actual column headings in the file.",
    );
  }

  const records: OrderRecord[] = [];

  for (const row of rows.slice(headerIdx + 1)) {
    const employeeName = cellText(row[nameColIdx]);
    if (!employeeName) continue;

    for (const { day, colIdx } of dayColumns) {
      const rawMealText = cellText(row[colIdx]);
      if (!rawMealText || isOptOut(rawMealText, optOutValues)) continue;
      records.push({ employeeName, dayOfWeek: day, rawMealText });
    }
  }

  return records;
}

// ── Parser B: multi_sheet_daily_form / multi_sheet_daily_remarks ──────────────

/** Strip the "[OPTION N] -" prefix used by Heirs / Microsoft Forms exports. */
const MEAL_PREFIX_RE = /^\s*\[[^\]]*\]\s*-\s*/;

/** Flatten remarks free-text so the vocabulary canonicaliser can extract tokens. */
function cleanRemarks(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[/\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a multi-sheet daily workbook (ELCREST style OR Heirs style).
 *
 * Both the `multi_sheet_daily_form` and `multi_sheet_daily_remarks` parser
 * types use this function — the config fields determine which mode is active:
 *
 * - Form mode  (`proteinColumn` and/or `swallowColumn` set): reads dedicated
 *   columns directly into `proteinRaw` / `swallowRaw` on OrderRecord.
 * - Remarks mode (`remarksColumn` set): cleans the remarks value and assigns
 *   it to both `proteinRaw` and `swallowRaw` (like the legacy heirs parser).
 *
 * Both modes can coexist; form columns take precedence.
 */
export function parseConfigurableMultiSheet(
  buffer: Buffer,
  config: MultiSheetParserConfig,
): OrderRecord[] {
  const {
    nameColumn,
    mealColumn,
    proteinColumn,
    swallowColumn,
    remarksColumn,
    stripMealPrefix = false,
    headerRow: headerRowOverride,
    sheetDayPattern = "weekday_name",
    optOutValues = DEFAULT_OPT_OUT,
  } = config;

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const records: OrderRecord[] = [];
  let sheetsWithData = 0;

  for (const sheetName of workbook.SheetNames) {
    const day = detectDayFromSheetName(sheetName, sheetDayPattern);
    if (!day) continue; // sheet doesn't correspond to a weekday

    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    if (rows.length === 0) continue;

    // Locate the header row
    let headerIdx: number;
    if (headerRowOverride !== undefined) {
      headerIdx = headerRowOverride;
    } else {
      headerIdx = findHeaderRowIndex(rows, nameColumn, 10);
      if (headerIdx === -1) continue; // can't identify header — skip sheet
    }

    const headerMap = buildHeaderIndex(rows[headerIdx]);

    // Name column (required)
    const nameIdx = resolveColIndex(headerMap, nameColumn);
    if (nameIdx === undefined) continue;

    // Meal column (required)
    const mealIdx = resolveColIndex(headerMap, mealColumn);
    if (mealIdx === undefined) continue;

    // Optional columns
    const proteinIdx = proteinColumn
      ? resolveColIndex(headerMap, proteinColumn)
      : undefined;
    const swallowIdx = swallowColumn
      ? resolveColIndex(headerMap, swallowColumn)
      : undefined;
    const remarksIdx = remarksColumn
      ? resolveColIndex(headerMap, remarksColumn)
      : undefined;

    sheetsWithData++;

    for (const row of rows.slice(headerIdx + 1)) {
      const employeeName = cellText(row[nameIdx]);
      if (!employeeName) continue;

      let rawMealText = cellText(row[mealIdx]);
      if (!rawMealText) continue;

      // Strip "[OPTION N] -" prefix if the format uses coded meal names
      if (stripMealPrefix) {
        rawMealText = rawMealText.replace(MEAL_PREFIX_RE, "").trim();
      }

      if (!rawMealText || isOptOut(rawMealText, optOutValues)) continue;

      // Resolve protein and swallow values
      let proteinRaw: string | null = null;
      let swallowRaw: string | null = null;

      // Form mode: explicit columns take precedence
      if (proteinIdx !== undefined) {
        const raw = cellText(row[proteinIdx]);
        if (raw && !isOptOut(raw, optOutValues)) proteinRaw = raw;
      }
      if (swallowIdx !== undefined) {
        const raw = cellText(row[swallowIdx]);
        if (raw && !isOptOut(raw, optOutValues)) swallowRaw = raw;
      }

      // Remarks mode: fall back to cleaned remarks when no explicit columns
      if (remarksIdx !== undefined && proteinRaw === null && swallowRaw === null) {
        const cleaned = cleanRemarks(cellText(row[remarksIdx]));
        if (cleaned) {
          proteinRaw = cleaned;
          swallowRaw = cleaned;
        }
      }

      const hasExplicitAddOns = proteinRaw !== null || swallowRaw !== null;

      records.push({
        employeeName,
        dayOfWeek: day,
        rawMealText,
        ...(hasExplicitAddOns ? { proteinRaw, swallowRaw } : {}),
      });
    }
  }

  if (sheetsWithData === 0) {
    throw new Error(
      "No weekday sheets found in the workbook. " +
        "Expected sheet names containing Monday–Friday (or configured sheetDayPattern). " +
        `Sheets present: ${workbook.SheetNames.join(", ") || "(none)"}.`,
    );
  }

  return records;
}

// ── Parser C: summary_quantity_format ─────────────────────────────────────────

/**
 * Parse a single comment-split segment like "4 with Semo" or "2 Eba".
 * Returns `{ quantity, addOn }` or null if the segment can't be parsed.
 */
function parseCommentSegment(
  segment: string,
): { quantity: number; addOn: string } | null {
  const m = segment.trim().match(/^(\d+)\s+(?:with\s+)?(.+)$/i);
  if (!m) return null;
  const quantity = parseInt(m[1], 10);
  const addOn = m[2].trim();
  if (quantity <= 0 || !addOn) return null;
  return { quantity, addOn };
}

/**
 * Parse a comment string like "4 with Semo, 2 Eba" into an array of splits.
 * Returns null when the comment can't be cleanly split.
 */
function parseCommentSplits(
  comment: string,
): Array<{ quantity: number; addOn: string }> | null {
  if (!comment) return null;

  const segments = comment.split(/[,;]/);
  const splits: Array<{ quantity: number; addOn: string }> = [];

  for (const seg of segments) {
    if (!seg.trim()) continue;
    const parsed = parseCommentSegment(seg);
    if (!parsed) return null; // abort — segment unreadable
    splits.push(parsed);
  }

  return splits.length > 0 ? splits : null;
}

/**
 * Parse a summary-quantity workbook.
 *
 * Each data row specifies a meal and a total staff count.  When the optional
 * comment column is present and can be parsed (e.g. "4 with Semo, 2 Eba"),
 * the row is expanded into multiple `OrderRecord` entries — one per comment
 * segment, each with a unique synthetic employee name.
 *
 * The quantity expansion is done in the parser (rather than via an explicit
 * `quantity` field on `OrderRecord`) so that the existing production
 * counting, deduplication, and dashboard logic all work without modification.
 *
 * Synthetic employee names follow the pattern `SUM-R{row}-{split}-{instance}`
 * so they never collide with real employee names.
 *
 * If a comment's quantities sum to less than the row total, the remainder is
 * emitted as plain rows (base meal only, no add-on).  If the comment sum
 * exceeds the row total, it is capped at totalQty.
 */
export function parseSummaryQuantity(
  buffer: Buffer,
  config: SummaryQuantityConfig,
): OrderRecord[] {
  const {
    sheetName,
    headerRow: headerRowOverride,
    mealColumn,
    quantityColumn,
    commentColumn,
    defaultDay = "Mon",
  } = config;

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const { sheet } = resolveSheet(workbook, sheetName);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) throw new Error("Sheet is empty.");

  // Locate header row
  let headerIdx: number;
  if (headerRowOverride !== undefined) {
    headerIdx = headerRowOverride;
  } else {
    headerIdx = findHeaderRowIndex(rows, mealColumn, 10);
    if (headerIdx === -1) {
      throw new Error(
        `Could not find a header row containing "${mealColumn}". ` +
          `Check the mealColumn configuration.`,
      );
    }
  }

  const headerMap = buildHeaderIndex(rows[headerIdx]);

  const mealIdx = resolveColIndex(headerMap, mealColumn);
  if (mealIdx === undefined) {
    throw new Error(`Meal column "${mealColumn}" not found in header row.`);
  }

  const qtyIdx = resolveColIndex(headerMap, quantityColumn);
  if (qtyIdx === undefined) {
    throw new Error(`Quantity column "${quantityColumn}" not found in header row.`);
  }

  const commentIdx = commentColumn
    ? resolveColIndex(headerMap, commentColumn)
    : undefined;

  const records: OrderRecord[] = [];

  for (let rowNum = headerIdx + 1; rowNum < rows.length; rowNum++) {
    const row = rows[rowNum];
    const rawMealText = cellText(row[mealIdx]);
    if (!rawMealText) continue;

    const qtyRaw = cellText(row[qtyIdx]);
    const totalQty = parseInt(qtyRaw, 10);
    if (isNaN(totalQty) || totalQty <= 0) continue;

    const comment =
      commentIdx !== undefined ? cellText(row[commentIdx]) : "";

    // Try to parse comment splits
    const splits = parseCommentSplits(comment);
    const splitTotal = splits
      ? splits.reduce((s, x) => s + x.quantity, 0)
      : 0;

    if (splits && splits.length > 0) {
      // Emit split rows first (capped at totalQty)
      let emitted = 0;
      for (let si = 0; si < splits.length && emitted < totalQty; si++) {
        const { quantity, addOn } = splits[si];
        const effective = Math.min(quantity, totalQty - emitted);
        const mealWithAddOn = `${rawMealText} + ${addOn}`;
        for (let inst = 0; inst < effective; inst++) {
          records.push({
            employeeName: `SUM-R${rowNum}-S${si + 1}-${inst + 1}`,
            dayOfWeek: defaultDay,
            rawMealText: mealWithAddOn,
          });
        }
        emitted += effective;
      }

      // Emit remainder rows if splits sum < totalQty
      for (let rem = emitted; rem < totalQty; rem++) {
        records.push({
          employeeName: `SUM-R${rowNum}-S0-${rem - emitted + 1}`,
          dayOfWeek: defaultDay,
          rawMealText, // base meal, no add-on specified
        });
      }
    } else {
      // No comment splits — emit totalQty plain rows
      for (let inst = 0; inst < totalQty; inst++) {
        records.push({
          employeeName: `SUM-R${rowNum}-S1-${inst + 1}`,
          dayOfWeek: defaultDay,
          rawMealText,
        });
      }
    }
  }

  if (records.length === 0) {
    throw new Error(
      "No valid summary rows found. " +
        "Check that the sheet contains rows with a meal name and a positive quantity.",
    );
  }

  return records;
}

// ── Parser D: single_sheet_weekly_grid_with_reference_menu ───────────────────

/**
 * Parse an employee-selection grid where one sheet holds the orders and a
 * second sheet is a reference menu (silently ignored).
 *
 * Each weekday can have a separate meal column and an optional protein column.
 * This covers Energia / PowerApps-exported workbooks:
 *
 *   Name | Mon Food | Mon Protein | Tues Food | Tues Protein | …
 *
 * The reference menu sheet (e.g. "Food for the week") is simply not read —
 * no order rows are emitted from it.
 */
export function parseEmployeeSelectionGrid(
  buffer: Buffer,
  config: EmployeeSelectionConfig,
): OrderRecord[] {
  const {
    orderSheetName,
    nameColumn,
    headerRow: headerRowOverride = 0,
    weekdayMealColumns,
    weekdayProteinColumns = {},
    optOutValues = DEFAULT_OPT_OUT,
  } = config;

  const workbook = XLSX.read(buffer, { type: "buffer" });

  // ── Resolve the order sheet ──────────────────────────────────────────────
  let sheetName: string;
  if (orderSheetName) {
    const lower = orderSheetName.toLowerCase();
    // Exact match first, then case-insensitive contains
    const found =
      workbook.SheetNames.find((s) => s.toLowerCase() === lower) ??
      workbook.SheetNames.find((s) => s.toLowerCase().includes(lower));
    if (!found) {
      const available =
        workbook.SheetNames.length > 0
          ? workbook.SheetNames.join(", ")
          : "(none)";
      throw new Error(
        `Expected the order sheet "${orderSheetName}" but it was not found. ` +
          `Sheets present: ${available}. ` +
          `Check the upload format configuration for this customer.`,
      );
    }
    sheetName = found;
  } else {
    const first = workbook.SheetNames[0];
    if (!first) throw new Error("Workbook has no sheets.");
    sheetName = first;
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[sheetName],
    { header: 1, defval: "" },
  );

  const headerIdx = headerRowOverride;
  if (rows.length === 0 || headerIdx >= rows.length) {
    throw new Error(
      `Header row ${headerIdx + 1} not found in sheet "${sheetName}". ` +
        `The sheet only has ${rows.length} row(s).`,
    );
  }

  const headerMap = buildHeaderIndex(rows[headerIdx]);

  const nameColIdx = resolveColIndex(headerMap, nameColumn);
  if (nameColIdx === undefined) {
    throw new Error(
      `Name column "${nameColumn}" not found in the header row of sheet "${sheetName}". ` +
        `Check the nameColumn setting in the upload format configuration.`,
    );
  }

  // ── Build day → (mealColIdx, proteinColIdx?) pairs ───────────────────────
  const dayColumns: {
    day: DayOfWeek;
    mealColIdx: number;
    proteinColIdx: number | undefined;
  }[] = [];

  for (const [dayCode, mealHeader] of Object.entries(weekdayMealColumns)) {
    if (!mealHeader) continue;
    const mealColIdx = resolveColIndex(headerMap, mealHeader);
    if (mealColIdx === undefined) continue; // column not in file — skip day

    const proteinHeader =
      (weekdayProteinColumns as Partial<Record<string, string>>)[dayCode];
    const proteinColIdx = proteinHeader
      ? resolveColIndex(headerMap, proteinHeader)
      : undefined;

    dayColumns.push({ day: dayCode as DayOfWeek, mealColIdx, proteinColIdx });
  }

  if (dayColumns.length === 0) {
    throw new Error(
      "No weekday meal columns found in the workbook. " +
        "Check that the weekdayMealColumns configuration matches the actual column headings.",
    );
  }

  // ── Extract one OrderRecord per (employee, weekday) pair ─────────────────
  const records: OrderRecord[] = [];

  for (const row of rows.slice(headerIdx + 1)) {
    const employeeName = cellText(row[nameColIdx]);
    if (!employeeName) continue;

    for (const { day, mealColIdx, proteinColIdx } of dayColumns) {
      const rawMealText = cellText(row[mealColIdx]);
      if (!rawMealText || isOptOut(rawMealText, optOutValues)) continue;

      // Only attach proteinRaw when the column was configured and has a value.
      const proteinRaw: string | null | undefined =
        proteinColIdx !== undefined
          ? cellText(row[proteinColIdx]) || null
          : undefined;

      records.push({
        employeeName,
        dayOfWeek: day,
        rawMealText,
        ...(proteinRaw !== undefined ? { proteinRaw } : {}),
      });
    }
  }

  return records;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Dispatch to the correct configurable parser based on `config.parserType`.
 *
 * Called by the upload API route when the customer has an active
 * `customer_upload_config` row.
 */
export function parseWithConfig(
  buffer: Buffer,
  config: CustomerUploadConfig,
): OrderRecord[] {
  const { parserType, config: cfg } = config;

  switch (parserType) {
    case "single_sheet_weekly_grid":
      return parseConfigurableGrid(buffer, cfg as GridParserConfig);

    case "multi_sheet_daily_form":
    case "multi_sheet_daily_remarks":
      // Both form and remarks variants use the same multi-sheet parser;
      // the config fields (proteinColumn vs remarksColumn) control the mode.
      return parseConfigurableMultiSheet(buffer, cfg as MultiSheetParserConfig);

    case "summary_quantity_format":
      return parseSummaryQuantity(buffer, cfg as SummaryQuantityConfig);

    case "single_sheet_weekly_grid_with_reference_menu":
      return parseEmployeeSelectionGrid(buffer, cfg as EmployeeSelectionConfig);

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = parserType;
      throw new Error(`Unknown configurable parser type: ${String(_exhaustive)}`);
    }
  }
}

// ── Sheet-info helper (for preview endpoint) ──────────────────────────────────

/**
 * Return the sheet names present in a workbook buffer without full parsing.
 * Used by the preview endpoint to populate `sheetsDetected`.
 */
export function getWorkbookSheetNames(buffer: Buffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
    return workbook.SheetNames ?? [];
  } catch {
    return [];
  }
}
