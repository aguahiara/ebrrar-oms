import { parseAvonExcel } from "@/lib/avon-excel";
import { parseElcrestExcel } from "@/lib/elcrest-excel";
import { parseHeirsExcel } from "@/lib/heirs-excel";
import { parseHgiExcel } from "@/lib/hgi-excel";
import type { OrderRecord } from "@/lib/order-types";

// Re-export the configurable parser dispatcher and helpers so API routes only
// need to import from one place.
export { parseWithConfig, getWorkbookSheetNames } from "@/lib/configurable-parsers";

export type OrderParser = (buffer: Buffer) => OrderRecord[];

// ── Legacy hardcoded parsers ──────────────────────────────────────────────────
// Parsers are keyed by FILE FORMAT, not customer name, so a new customer is
// onboarded by declaring which format its uploads use (customer.parser_format).
// These remain unchanged for backward compatibility.
const PARSERS: Record<string, OrderParser> = {
  "avon-grid":       parseAvonExcel,
  "hgi-forms":       parseHgiExcel,
  "elcrest-triplet": parseElcrestExcel,
  "heirs-sheets":    parseHeirsExcel,
};

// Friendly labels for the customer-onboarding / edit screen.
// These cover the LEGACY parser_format values stored in customer.parser_format.
// The configurable parser types have their own labels in CONFIGURABLE_PARSER_LABELS
// (see lib/upload-config.ts).
export const PARSER_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: "avon-grid",       label: "Weekday grid — one meal per day (like AVON)" },
  { value: "hgi-forms",       label: "Forms export — 'Nth DAY' columns (like HGI / HLA)" },
  { value: "elcrest-triplet", label: "Per-day Meal / Protein / Swallow columns (like Elcrest)" },
  { value: "heirs-sheets",    label: "One sheet per day, coded meals (like Heirs)" },
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

/**
 * Resolve a human-readable label for any parser type key — both legacy
 * (customer.parser_format) and configurable (customer_upload_config.parser_type).
 */
export function getParserLabel(parserType: string): string {
  const legacyLabel = PARSER_FORMAT_OPTIONS.find((o) => o.value === parserType)?.label;
  if (legacyLabel) return legacyLabel;
  // Configurable labels are imported lazily to avoid circular deps
  const CONFIGURABLE_LABELS: Record<string, string> = {
    single_sheet_weekly_grid:
      "Single sheet — weekday columns (AVON / HLA style)",
    multi_sheet_daily_form:
      "Multi-sheet daily — explicit columns (ELCREST style)",
    multi_sheet_daily_remarks:
      "Multi-sheet daily — remarks column (Heirs style)",
    summary_quantity_format:
      "Summary quantity — meal counts with comment splits",
    single_sheet_weekly_grid_with_reference_menu:
      "Single sheet — with reference menu (Energia style)",
  };
  return CONFIGURABLE_LABELS[parserType] ?? parserType;
}
