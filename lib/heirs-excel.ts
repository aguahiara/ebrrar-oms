import type { DayOfWeek, OrderRecord } from "@/lib/order-types";
import * as XLSX from "xlsx";

// Heirs keeps one sheet per weekday, named like "--Monday,4--".
const SHEET_DAY: { match: string; day: DayOfWeek }[] = [
  { match: "monday", day: "Mon" },
  { match: "tuesday", day: "Tue" },
  { match: "wednesday", day: "Wed" },
  { match: "thursday", day: "Thu" },
  { match: "friday", day: "Fri" },
];

// LUNCH values look like "[OPTION 5] - Groundnut Soup..." or "[OTHER 2] - Salad Only".
// Opt-out is "[] - " (empty name after the dash).
const MEAL_CODE = /^\s*\[[^\]]*\]\s*-\s*(.*)$/;

function cell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

// REMARKS is free text holding protein and/or swallow in many shapes
// ("chicken/poundo", "Protein - Goat Meat", "Eba and Fish"). Flatten the
// separators to spaces so the vocabulary canonicaliser can find the tokens.
function cleanRemarks(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\/\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
 * Parse Heirs Energies' workbook: one sheet per weekday. The LUNCH column holds
 * the coded meal ("[OPTION N] - name"); we take the name and match it normally.
 * Protein/swallow come from the free-text REMARKS column, flattened so the
 * canonicaliser can extract them (best-effort — some abbreviations won't resolve).
 */
export function parseHeirsExcel(buffer: Buffer): OrderRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const records: OrderRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const lower = sheetName.toLowerCase();
    const dayEntry = SHEET_DAY.find((d) => lower.includes(d.match));
    if (!dayEntry) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
    if (rows.length === 0) {
      continue;
    }

    const index = headerIndex(rows[0]);
    const employeeIdx = index.get("employee");
    const lunchIdx = index.get("lunch");
    const remarksIdx = index.get("remarks");
    if (employeeIdx === undefined || lunchIdx === undefined) {
      continue;
    }

    for (const row of rows.slice(1)) {
      const employeeName = cell(row[employeeIdx]);
      if (!employeeName) {
        continue;
      }

      const lunch = cell(row[lunchIdx]);
      const match = lunch.match(MEAL_CODE);
      const mealName = (match ? match[1] : lunch).trim();
      if (!mealName) {
        continue; // opt-out "[] - "
      }

      const remarks =
        remarksIdx !== undefined ? cleanRemarks(row[remarksIdx]) : "";
      const remarksValue = remarks || null;

      records.push({
        employeeName,
        dayOfWeek: dayEntry.day,
        rawMealText: mealName,
        proteinRaw: remarksValue,
        swallowRaw: remarksValue,
      });
    }
  }

  if (records.length === 0) {
    throw new Error(
      "No Heirs day-sheets found (expected Monday–Friday sheets).",
    );
  }

  return records;
}
