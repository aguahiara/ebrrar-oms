import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import * as XLSX from "xlsx";

const SHEET_NAME = "Sheet1";

const WEEKDAY_HEADER_PATTERNS: { pattern: string; day: DayOfWeek }[] = [
  { pattern: "MONDAY", day: "Mon" },
  { pattern: "TUESDAY", day: "Tue" },
  { pattern: "WEDNESDAY", day: "Wed" },
  { pattern: "THURSDAY", day: "Thu" },
  { pattern: "FRIDAY", day: "Fri" },
];

function headerText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
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

function findNameColumnIndex(headerRow: unknown[]): number {
  const index = headerRow.findIndex(
    (cell) => headerText(cell).toLowerCase() === "name",
  );
  if (index === -1) {
    throw new Error('Missing required header column "Name".');
  }
  return index;
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

  if (columns.length === 0) {
    throw new Error(
      "No weekday columns found (expected headers containing MONDAY–FRIDAY).",
    );
  }

  return columns;
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

  const headerRow = rows[0];
  const nameIndex = findNameColumnIndex(headerRow);
  const weekdayColumns = findWeekdayColumns(headerRow);

  const records: OrderRecord[] = [];

  for (const row of rows.slice(1)) {
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
