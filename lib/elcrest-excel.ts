import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import * as XLSX from "xlsx";

const SHEET_NAME = "Sheet1";

const OPT_OUT = new Set(["", "n/a", "na", "not applicable", "nil", "none"]);

const DAY_COLUMNS: { day: DayOfWeek; label: string }[] = [
  { day: "Mon", label: "monday" },
  { day: "Tue", label: "tuesday" },
  { day: "Wed", label: "wednesday" },
  { day: "Thu", label: "thursday" },
  { day: "Fri", label: "friday" },
];

function cell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isOptOut(value: string): boolean {
  return OPT_OUT.has(value.toLowerCase());
}

function headerIndex(headerRow: unknown[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((header, i) => {
    const key = cell(header).toLowerCase();
    if (key && !index.has(key)) {
      index.set(key, i);
    }
  });
  return index;
}

/**
 * Parse Elcrest's Microsoft Forms export. Identity is the "Full Name" column
 * (Email/Name are blank/anonymous). Each weekday has three columns —
 * "<Day> Main Meal", "<Day> Protein", "<Day> Swallow" — so protein and swallow
 * are handed over directly rather than extracted from the meal text.
 */
export function parseElcrestExcel(buffer: Buffer): OrderRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes(SHEET_NAME)
    ? SHEET_NAME
    : workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    throw new Error(`Sheet "${sheetName}" is empty.`);
  }

  const index = headerIndex(rows[0]);
  const nameIndex = index.get("full name");
  if (nameIndex === undefined) {
    throw new Error('Missing required header column "Full Name".');
  }

  const dayColumns = DAY_COLUMNS.map(({ day, label }) => ({
    day,
    meal: index.get(`${label} main meal`),
    protein: index.get(`${label} protein`),
    swallow: index.get(`${label} swallow`),
  }));

  const records: OrderRecord[] = [];

  for (const row of rows.slice(1)) {
    const employeeName = cell(row[nameIndex]);
    if (!employeeName) {
      continue;
    }

    for (const { day, meal, protein, swallow } of dayColumns) {
      if (meal === undefined) {
        continue;
      }

      const rawMealText = cell(row[meal]);
      if (isOptOut(rawMealText)) {
        continue;
      }

      const proteinRaw = protein !== undefined ? cell(row[protein]) : "";
      const swallowRaw = swallow !== undefined ? cell(row[swallow]) : "";

      records.push({
        employeeName,
        dayOfWeek: day,
        rawMealText,
        proteinRaw: isOptOut(proteinRaw) ? null : proteinRaw,
        swallowRaw: isOptOut(swallowRaw) ? null : swallowRaw,
      });
    }
  }

  return records;
}
