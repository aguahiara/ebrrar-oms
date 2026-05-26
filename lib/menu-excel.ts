import type { DayOfWeek } from "@/lib/order-types";
import * as XLSX from "xlsx";

export type ParsedMenuOption = {
  day: DayOfWeek;
  optionLabel: string;
  name: string;
};

export type ParsedMenuVocabItem = {
  day: DayOfWeek;
  name: string;
};

export type ParsedMenu = {
  options: ParsedMenuOption[];
  proteins: ParsedMenuVocabItem[];
  swallows: ParsedMenuVocabItem[];
  notes: string[];
};

// Accepts short and full day spellings found across menu/customer files.
const DAY_LOOKUP: Record<string, DayOfWeek> = {
  mon: "Mon",
  monday: "Mon",
  tue: "Tue",
  tues: "Tue",
  tuesday: "Tue",
  wed: "Wed",
  wednesday: "Wed",
  thu: "Thu",
  thur: "Thu",
  thurs: "Thu",
  thursday: "Thu",
  fri: "Fri",
  friday: "Fri",
};

/** Normalise a cell: coerce to string, replace non-breaking spaces, trim. */
function cell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function rowIncludes(row: unknown[], keyword: string): boolean {
  return row.some((v) => cell(v).toLowerCase().includes(keyword));
}

/** Locate the weekday header row and which column each day sits in. */
function findDayColumns(rows: unknown[][]): { day: DayOfWeek; col: number }[] {
  for (const row of rows) {
    const found: { day: DayOfWeek; col: number }[] = [];
    const seen = new Set<DayOfWeek>();
    row.forEach((value, col) => {
      const day = DAY_LOOKUP[cell(value).toLowerCase()];
      if (day && !seen.has(day)) {
        found.push({ day, col });
        seen.add(day);
      }
    });
    if (found.length >= 5) {
      return found;
    }
  }
  throw new Error(
    "Could not find the weekday header row (Mon–Fri) in the menu sheet.",
  );
}

/**
 * Parse the 'Menu for the Week' grid into structured options, protein and
 * swallow vocabularies, and notes. The sheet stacks three sections in column A:
 * OPTION 1..8 rows, a 'Protein Options' block, then a 'Swallow Options' block.
 */
export function parseWeeklyMenu(buffer: Buffer): ParsedMenu {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });

  const dayCols = findDayColumns(rows);

  const options: ParsedMenuOption[] = [];
  const proteins: ParsedMenuVocabItem[] = [];
  const swallows: ParsedMenuVocabItem[] = [];
  const notes: string[] = [];

  const proteinStart = rows.findIndex((r) => rowIncludes(r, "protein options"));
  const swallowStart = rows.findIndex((r) => rowIncludes(r, "swallow options"));

  // Pass 1: option rows (column A like "OPTION 3") and NB note rows.
  for (const row of rows) {
    const label = cell(row[0]);

    if (/^option\s*\d+/i.test(label)) {
      for (const { day, col } of dayCols) {
        const name = cell(row[col]);
        if (name) {
          options.push({ day, optionLabel: label, name });
        }
      }
      continue;
    }

    if (/^nb/i.test(label)) {
      const note = row
        .map(cell)
        .filter((t) => t && !/^nb/i.test(t))
        .join(" ")
        .trim();
      if (note) {
        notes.push(note);
      }
    }
  }

  // Pass 2: protein block — rows between the protein header and the swallow header.
  if (proteinStart !== -1) {
    const end = swallowStart !== -1 ? swallowStart : rows.length;
    for (let i = proteinStart + 1; i < end; i++) {
      for (const { day, col } of dayCols) {
        const name = cell(rows[i][col]);
        if (
          name &&
          !name.toLowerCase().includes("protein options") &&
          !name.toLowerCase().includes("swallow options")
        ) {
          proteins.push({ day, name });
        }
      }
    }
  }

  // Pass 3: swallow block — rows after the swallow header.
  if (swallowStart !== -1) {
    for (let i = swallowStart + 1; i < rows.length; i++) {
      for (const { day, col } of dayCols) {
        const name = cell(rows[i][col]);
        if (name && !name.toLowerCase().includes("swallow options")) {
          swallows.push({ day, name });
        }
      }
    }
  }

  if (options.length === 0) {
    throw new Error(
      "No menu options found (expected rows labelled OPTION 1..8).",
    );
  }

  return { options, proteins, swallows, notes };
}
