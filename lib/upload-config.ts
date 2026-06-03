/**
 * Configurable upload format types and database helpers.
 *
 * When a customer_upload_config row with is_active = true exists for a customer,
 * the flexible parser engine uses it instead of customer.parser_format.
 * Existing customers that rely on parser_format are unaffected.
 *
 * See sql/023_customer_upload_config.sql for the schema.
 */

import type { DayOfWeek } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

// ── Configurable parser types ─────────────────────────────────────────────────

export type ConfigurableParserType =
  | "single_sheet_weekly_grid"
  | "multi_sheet_daily_form"
  | "multi_sheet_daily_remarks"
  | "summary_quantity_format"
  | "single_sheet_weekly_grid_with_reference_menu";

// ── EmployeeSelectionConfig ───────────────────────────────────────────────────

/**
 * Configuration for `single_sheet_weekly_grid_with_reference_menu`.
 *
 * Covers workbooks (e.g. Energia / PowerApps exports) where:
 *  - One sheet holds employee meal selections with weekday columns.
 *  - A second sheet is a reference menu that must be silently ignored.
 *  - Each weekday can have a separate meal column AND an optional protein column.
 *
 * Example layout (Employee Selection sheet):
 *   Name | Mon Food | Mon Protein | Tues Food | Tues Protein | …
 */
export type EmployeeSelectionConfig = {
  /**
   * Name of the sheet that contains employee order rows.
   * Matched first by exact name, then by case-insensitive contains.
   * Defaults to the first sheet if omitted.
   */
  orderSheetName?: string;
  /**
   * Name of the reference menu sheet (silently skipped — not parsed as orders).
   * Informational only; used to validate the workbook structure and produce
   * customer-specific error messages.
   */
  referenceMenuSheetName?: string;
  /** Column header for the employee name. */
  nameColumn: string;
  /**
   * Zero-based row index of the header row.
   * Default: 0 (first row is the header).
   */
  headerRow?: number;
  /** Column headers for the food/meal selection for each weekday. */
  weekdayMealColumns: Partial<Record<DayOfWeek, string>>;
  /**
   * Column headers for the explicit protein selection for each weekday.
   * When set, values are passed as `proteinRaw` to the resolve pipeline.
   */
  weekdayProteinColumns?: Partial<Record<DayOfWeek, string>>;
  /** Cell values that mean the employee has no meal for that day. */
  optOutValues?: string[];
};

// ── Per-type config shapes ─────────────────────────────────────────────────────

/**
 * Configuration for `single_sheet_weekly_grid`.
 *
 * Covers AVON-style (fixed header row) and HLA-style (header may appear
 * anywhere in the first N rows) weekly-grid uploads where one row per
 * employee contains meal selections for Mon–Fri in separate columns.
 */
export type GridParserConfig = {
  /** Sheet to read. Defaults to the first sheet in the workbook. */
  sheetName?: string;
  /** How many rows from the top to scan when auto-detecting the header row. Default: 10. */
  headerScanRows?: number;
  /**
   * Column header text for the employee name column.
   * The parser will find any header cell whose text (case-insensitive) contains
   * this string, so "Name" matches "Full Name", "Employee Name", etc.
   */
  nameColumn: string;
  /**
   * Maps each DayOfWeek code to the column header text in the workbook.
   * Only the days present in this map will be extracted.
   *
   * Example:
   * ```json
   * { "Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday" }
   * ```
   */
  weekdayColumns: Partial<Record<DayOfWeek, string>>;
  /**
   * Cell values (matched case-insensitively after trimming) that mean the
   * employee has no meal for that day and should be skipped.
   * Default: `["n/a", "nil", "none", "not applicable"]`.
   */
  optOutValues?: string[];
};

/**
 * Configuration for `multi_sheet_daily_form` and `multi_sheet_daily_remarks`.
 *
 * Covers workbooks where each sheet holds one weekday's orders:
 * - Form mode (ELCREST style): dedicated Protein and Swallow columns.
 * - Remarks mode (Heirs style): free-text Remarks column holds protein/swallow info.
 *
 * Set `proteinColumn` + `swallowColumn` for form mode, or `remarksColumn` for
 * remarks mode.  Both can be set if the workbook has all three.
 */
export type MultiSheetParserConfig = {
  /** Column header for the employee / staff name. */
  nameColumn: string;
  /** Column header for the main meal / lunch column. */
  mealColumn: string;
  /** (Form mode) Column header for the explicit protein selection column. */
  proteinColumn?: string;
  /** (Form mode) Column header for the explicit swallow selection column. */
  swallowColumn?: string;
  /** (Remarks mode) Column header for the free-text remarks field. */
  remarksColumn?: string;
  /**
   * When true, strips the "[OPTION N] -" (or "[OTHER N] -") prefix from meal
   * cell values before parsing.  Required for Heirs-style coded meals.
   * Default: false.
   */
  stripMealPrefix?: boolean;
  /**
   * Zero-based index of the header row within each sheet.
   * When absent, the parser auto-detects by scanning the first 10 rows.
   */
  headerRow?: number;
  /**
   * Controls how sheet names are mapped to weekdays.
   *
   * - `"weekday_name"` (default): sheet name (lowercased) must contain the
   *   English weekday name (monday/tuesday/…).
   * - A `Record<string, string>` mapping: each key is a substring to look for
   *   in the sheet name (case-insensitive); the value is the DayOfWeek code.
   *
   * Example explicit mapping:
   * ```json
   * { "MON SELECTION": "Mon", "TUE SELECTION": "Tue" }
   * ```
   */
  sheetDayPattern?: "weekday_name" | Record<string, string>;
  /**
   * Cell values that indicate opt-out (employee has no meal for that day).
   * Default: `["n/a", "nil", "none", "not applicable"]`.
   */
  optOutValues?: string[];
};

/**
 * Configuration for `summary_quantity_format`.
 *
 * Covers quantity-based order sheets (no individual employee rows).
 * Each data row specifies a meal, the number of staff, and an optional
 * comment that splits the quantity by swallow or protein.
 *
 * Comment split syntax:
 *   "4 with Semo, 2 Eba"
 *   "3 Chicken, 2 Fish, 1 Goat"
 * Each segment is `<number> [with] <add-on>`.
 */
export type SummaryQuantityConfig = {
  /** Sheet name. Defaults to the first sheet. */
  sheetName?: string;
  /** Zero-based header row index. Auto-detected if absent. */
  headerRow?: number;
  /** Column header for the meal name. */
  mealColumn: string;
  /** Column header for the staff count / quantity. */
  quantityColumn: string;
  /** Column header for the optional comment / split field. */
  commentColumn?: string;
  /**
   * DayOfWeek to assign to all rows in this sheet.
   * Summary sheets are typically for a single service day.
   * Default: `"Mon"` — the caller should override this.
   */
  defaultDay?: DayOfWeek;
};

// ── CustomerUploadConfig ──────────────────────────────────────────────────────

export type CustomerUploadConfig = {
  id: string;
  customerId: string;
  formatName: string;
  parserType: ConfigurableParserType;
  isActive: boolean;
  /** Raw JSON config object. Cast to the appropriate typed shape when using. */
  config: Record<string, unknown>;
};

// ── Database helpers ──────────────────────────────────────────────────────────

/**
 * Fetch the active upload config for a customer, or null if none is configured.
 *
 * Returns null when the `customer_upload_config` table does not yet exist
 * (migration not yet applied) so that the legacy parser_format path is used
 * without crashing.
 */
export async function fetchActiveUploadConfig(
  customerId: string,
): Promise<CustomerUploadConfig | null> {
  const { data, error } = await supabase
    .from("customer_upload_config")
    .select("id, customer_id, format_name, parser_type, is_active, config")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .maybeSingle();

  // Table may not exist yet if migration 023 hasn't been applied.
  if (error) return null;
  if (!data) return null;

  return {
    id: data.id as string,
    customerId: data.customer_id as string,
    formatName: data.format_name as string,
    parserType: data.parser_type as ConfigurableParserType,
    isActive: data.is_active as boolean,
    config: (data.config ?? {}) as Record<string, unknown>,
  };
}

// ── Labels ────────────────────────────────────────────────────────────────────

/** Human-readable labels for each configurable parser type. */
export const CONFIGURABLE_PARSER_LABELS: Record<ConfigurableParserType, string> = {
  single_sheet_weekly_grid:
    "Single sheet — weekday columns (AVON / HLA style)",
  multi_sheet_daily_form:
    "Multi-sheet daily — explicit meal / protein / swallow columns (ELCREST style)",
  multi_sheet_daily_remarks:
    "Multi-sheet daily — free-text remarks column (Heirs Energies style)",
  summary_quantity_format:
    "Summary quantity — meal counts with optional comment splits",
  single_sheet_weekly_grid_with_reference_menu:
    "Employee selection with reference menu (Energia style)",
};
