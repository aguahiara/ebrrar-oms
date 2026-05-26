import type { CustomerMenu } from "@/lib/customer-menu";
import type { DayOfWeek } from "@/lib/order-types";
import * as XLSX from "xlsx";

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABEL: Record<DayOfWeek, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

/**
 * Build an .xlsx of a customer's weekly menu, laid out like the source
 * 'Menu for the Week' grid: option rows across the five day columns, then
 * protein and swallow rows.
 */
export function buildMenuWorkbook(menu: CustomerMenu): Buffer {
  const labels = Array.from(
    new Set(menu.options.map((o) => o.optionLabel ?? o.canonical_name)),
  ).sort((a, b) => a.localeCompare(b));

  const byLabelDay = new Map<string, Map<DayOfWeek, string>>();
  for (const option of menu.options) {
    const key = option.optionLabel ?? option.canonical_name;
    if (!byLabelDay.has(key)) {
      byLabelDay.set(key, new Map());
    }
    byLabelDay.get(key)!.set(option.day_of_week, option.canonical_name);
  }

  const header = ["", ...DAYS.map((d) => DAY_LABEL[d])];
  const optionRows = labels.map((label) => [
    label,
    ...DAYS.map((d) => byLabelDay.get(label)?.get(d) ?? ""),
  ]);
  const proteinRow = [
    "Proteins",
    ...DAYS.map((d) =>
      menu.proteins
        .filter((p) => p.day_of_week === d)
        .map((p) => p.name)
        .join(", "),
    ),
  ];
  const swallowRow = [
    "Swallows",
    ...DAYS.map((d) =>
      menu.swallows
        .filter((s) => s.day_of_week === d)
        .map((s) => s.name)
        .join(", "),
    ),
  ];

  const aoa = [
    [`${menu.customerName} — Weekly Menu`],
    [],
    header,
    ...optionRows,
    [],
    proteinRow,
    swallowRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 34 },
    { wch: 34 },
    { wch: 34 },
    { wch: 34 },
    { wch: 34 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Menu");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
