import * as XLSX from "xlsx";

export type AvonDayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type AvonOrderRecord = {
  employeeName: string;
  dayOfWeek: AvonDayOfWeek;
  rawMealText: string;
};

const EXPECTED_HEADERS = [
  "Name",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Location",
] as const;

const WEEKDAY_COLUMNS: { header: string; day: AvonDayOfWeek }[] = [
  { header: "Monday", day: "Mon" },
  { header: "Tuesday", day: "Tue" },
  { header: "Wednesday", day: "Wed" },
  { header: "Thursday", day: "Thu" },
  { header: "Friday", day: "Fri" },
];

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim();
}

function cellText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseAvonExcel(buffer: Buffer): AvonOrderRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (rows.length === 0) {
    throw new Error("Sheet is empty.");
  }

  const headerRow = rows[0].map(normalizeHeader);
  const headerIndex = new Map(
    headerRow.map((header, index) => [header.toLowerCase(), index]),
  );

  for (const expected of EXPECTED_HEADERS) {
    if (!headerIndex.has(expected.toLowerCase())) {
      throw new Error(
        `Missing required column "${expected}". Expected: ${EXPECTED_HEADERS.join(", ")}.`,
      );
    }
  }

  const nameIndex = headerIndex.get("name")!;
  const weekdayIndices = WEEKDAY_COLUMNS.map(({ header, day }) => ({
    day,
    index: headerIndex.get(header.toLowerCase())!,
  }));

  const records: AvonOrderRecord[] = [];

  for (const row of rows.slice(1)) {
    const employeeName = cellText(row[nameIndex]);
    if (!employeeName) {
      continue;
    }

    for (const { day, index } of weekdayIndices) {
      const rawMealText = cellText(row[index]);
      if (!rawMealText) {
        continue;
      }

      records.push({ employeeName, dayOfWeek: day, rawMealText });
    }
  }

  return records;
}
