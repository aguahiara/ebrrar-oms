import { parseAvonExcel } from "@/lib/avon-excel";
import { parseElcrestExcel } from "@/lib/elcrest-excel";
import { parseHeirsExcel } from "@/lib/heirs-excel";
import { parseHgiExcel } from "@/lib/hgi-excel";
import type { OrderRecord } from "@/lib/order-types";

export type OrderParser = (buffer: Buffer) => OrderRecord[];

// Parsers are keyed by FILE FORMAT, not customer name, so a new customer is
// onboarded by declaring which format its uploads use (customer.parser_format).
const PARSERS: Record<string, OrderParser> = {
  "avon-grid": parseAvonExcel,
  "hgi-forms": parseHgiExcel,
  "elcrest-triplet": parseElcrestExcel,
  "heirs-sheets": parseHeirsExcel,
};

// Friendly labels for the customer-onboarding screen.
export const PARSER_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "avon-grid", label: "Weekday grid — one meal per day (like AVON)" },
  {
    value: "hgi-forms",
    label: "Forms export — 'Nth DAY' columns (like HGI / HLA)",
  },
  {
    value: "elcrest-triplet",
    label: "Per-day Meal / Protein / Swallow columns (like Elcrest)",
  },
  {
    value: "heirs-sheets",
    label: "One sheet per day, coded meals (like Heirs)",
  },
];

export function getParserByFormat(format: string | null | undefined): OrderParser {
  const parser = format ? PARSERS[format] : undefined;
  if (!parser) {
    throw new Error(
      `No upload parser registered for format "${format ?? "(none)"}". ` +
        `Set the customer's file format on the Customers screen.`,
    );
  }
  return parser;
}
