import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import * as XLSX from "xlsx";

const SHEET_NAME = "Sheet1";

/** How many rows from the top we search for the header row. */
const MAX_HEADER_SCAN_ROWS = 10;

const WEEKDAY_HEADER_PATTERNS: { pattern: string; day: DayOfWeek }[] = [
  { pattern: "MONDAY", day: "Mon" },
  { pattern: "TUESDAY", day: "Tue" },
  { pattern: "WEDNESDAY", day: "Wed" },
  { pattern: "THURSDAY", day: "Thu" },
  { pattern: "FRIDAY", day: "Fri" },
];

function headerText(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .trim();
}

function headerTextUpper(value: unknown): string {
  return headerText(value).toUpperCase();
}

function cellText(value: unknown): string {
  return String(value ?? "").trim();
}

function isSkippedMeal(value: string): boolean {
  if (!value) {
    return true;
  }
  return value.toLowerCase() === "not applicable";
}

/**
 * Returns the index of the Name column within a candidate header row.
 * Accepts any cell whose text (lowercased, trimmed) contains "name"
 * so that "Employee Name", "Full Name", "Staff Name", etc. all match.
 * Returns -1 if no such cell exists.
 */
function findNameColumnIndex(headerRow: unknown[]): number {
  return headerRow.findIndex((cell) =>
    headerText(cell).toLowerCase().includes("name"),
  );
}

function findWeekdayColumns(
  headerRow: unknown[],
): { day: DayOfWeek; index: number }[] {
  const columns: { day: DayOfWeek; index: number }[] = [];
  const usedIndices = new Set<number>();

  for (const { pattern, day } of WEEKDAY_HEADER_PATTERNS) {
    for (let index = 0; index < headerRow.length; index++) {
      if (usedIndices.has(index)) {
        continue;
      }
      if (headerTextUpper(headerRow[index]).includes(pattern)) {
        columns.push({ day, index });
        usedIndices.add(index);
        break;
      }
    }
  }

  return columns;
}

/**
 * Scans the first MAX_HEADER_SCAN_ROWS rows to find the header row.
 *
 * A row qualifies as a header if it contains:
 *   • at least one cell whose text includes "name" (the employee name column), AND
 *   • at least one cell whose text includes a weekday name (Mon–Fri).
 *
 * This handles HLA files that have title rows, blank rows, or metadata rows
 * above the actual column header row.
 *
 * Returns { headerRowIndex, headerRow } or throws if no header row is found.
 */
function findHeaderRow(rows: unknown[][]): {
  headerRowIndex: number;
  headerRow: unknown[];
} {
  const scanLimit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    const hasNameCol = findNameColumnIndex(row) !== -1;
    const hasWeekdayCol = findWeekdayColumns(row).length > 0;

    if (hasNameCol && hasWeekdayCol) {
      return { headerRowIndex: i, headerRow: row };
    }
  }

  throw new Error(
    `Could not find the header row in Sheet1 (scanned the first ${scanLimit} rows). ` +
      `Expected a row containing a "Name" column and at least one weekday column ` +
      `(Monday–Friday). Check that the file is using Sheet1 and that the column ` +
      `headers are spelled correctly.`,
  );
}

export function parseHgiExcel(buffer: Buffer): OrderRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    const found =
      workbook.SheetNames.length > 0
        ? workbook.SheetNames.join(", ")
        : "(none)";
    throw new Error(
      `Expected sheet "${SHEET_NAME}" but found: ${found}.`,
    );
  }

  const sheet = workbook.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    throw new Error(`Sheet "${SHEET_NAME}" is empty.`);
  }

  const { headerRowIndex, headerRow } = findHeaderRow(rows);
  const nameIndex = findNameColumnIndex(headerRow);
  const weekdayColumns = findWeekdayColumns(headerRow);

  const records: OrderRecord[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const employeeName = cellText(row[nameIndex]);
    if (!employeeName) {
      continue;
    }

    for (const { day, index } of weekdayColumns) {
      const rawMealText = cellText(row[index]);
      if (isSkippedMeal(rawMealText)) {
        continue;
      }

      records.push({ employeeName, dayOfWeek: day, rawMealText });
    }
  }

  return records;
}
