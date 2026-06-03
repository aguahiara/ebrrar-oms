"use client";

import {
  CONFIGURABLE_PARSER_LABELS,
  type ConfigurableParserType,
} from "@/lib/upload-config";
import { PARSER_FORMAT_OPTIONS } from "@/lib/parsers";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "not_configured" | "predefined" | "flexible";

type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
const DAYS: { code: DayCode; label: string }[] = [
  { code: "Mon", label: "Monday" },
  { code: "Tue", label: "Tuesday" },
  { code: "Wed", label: "Wednesday" },
  { code: "Thu", label: "Thursday" },
  { code: "Fri", label: "Friday" },
];

const FLEXIBLE_TYPES: { value: ConfigurableParserType; label: string }[] = [
  {
    value: "single_sheet_weekly_grid",
    label: "Single sheet — weekday columns (AVON / HLA style)",
  },
  {
    value: "multi_sheet_daily_form",
    label: "Multi-sheet daily — meal / protein / swallow columns (ELCREST style)",
  },
  {
    value: "multi_sheet_daily_remarks",
    label: "Multi-sheet daily — free-text remarks column (Heirs style)",
  },
  {
    value: "summary_quantity_format",
    label: "Summary quantity — meal counts with comment splits",
  },
  {
    value: "single_sheet_weekly_grid_with_reference_menu",
    label: "Employee selection with reference menu (Energia style)",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

type CurrentUploadConfig = {
  formatName: string;
  parserType: ConfigurableParserType;
  config: Record<string, unknown>;
} | null;

interface UploadFormatSectionProps {
  customerId: string;
  customerDisplayName: string;
  currentParserFormat: string | null;
  currentUploadConfig: CurrentUploadConfig;
  canEdit: boolean;
}

// ── Helper: derive initial category from current state ────────────────────────

function deriveCategory(
  parserFormat: string | null,
  uploadConfig: CurrentUploadConfig,
): Category {
  if (uploadConfig) return "flexible";
  if (parserFormat) return "predefined";
  return "not_configured";
}

// ── Helper: build parser type label ──────────────────────────────────────────

function parserTypeLabel(pt: ConfigurableParserType): string {
  return (
    CONFIGURABLE_PARSER_LABELS[pt] ??
    FLEXIBLE_TYPES.find((t) => t.value === pt)?.label ??
    pt
  );
}

function predefinedLabel(format: string): string {
  return (
    PARSER_FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? format
  );
}

// ── Config summary (one-liner for view mode) ──────────────────────────────────

function buildConfigSummary(
  parserType: ConfigurableParserType,
  cfg: Record<string, unknown>,
): string {
  switch (parserType) {
    case "single_sheet_weekly_grid": {
      const days = Object.keys(cfg.weekdayColumns ?? {}).join(", ") || "—";
      return `Sheet: ${(cfg.sheetName as string) || "auto"} · Days: ${days} · Name col: ${(cfg.nameColumn as string) || "—"}`;
    }
    case "multi_sheet_daily_form":
    case "multi_sheet_daily_remarks": {
      return `Name: ${(cfg.nameColumn as string) || "—"} · Meal: ${(cfg.mealColumn as string) || "—"}`;
    }
    case "summary_quantity_format": {
      return `Meal: ${(cfg.mealColumn as string) || "—"} · Qty: ${(cfg.quantityColumn as string) || "—"}`;
    }
    case "single_sheet_weekly_grid_with_reference_menu": {
      const days = Object.keys(cfg.weekdayMealColumns ?? {}).join(", ") || "—";
      return `Order sheet: ${(cfg.orderSheetName as string) || "auto"} · Days: ${days}`;
    }
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>
      )}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500 dark:disabled:bg-zinc-800"
    />
  );
}

// ── Weekday column pair grid ───────────────────────────────────────────────────

function WeekdayColumnGrid({
  mealCols,
  onMealChange,
  proteinCols,
  onProteinChange,
  showProtein,
}: {
  mealCols: Record<string, string>;
  onMealChange: (day: string, val: string) => void;
  proteinCols?: Record<string, string>;
  onProteinChange?: (day: string, val: string) => void;
  showProtein?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={`grid gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 ${showProtein ? "grid-cols-3" : "grid-cols-2"}`}>
        <span>Day</span>
        <span>Meal column header</span>
        {showProtein && <span>Protein column header (optional)</span>}
      </div>
      {DAYS.map(({ code, label }) => (
        <div
          key={code}
          className={`grid items-center gap-2 ${showProtein ? "grid-cols-3" : "grid-cols-2"}`}
        >
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
          <Input
            value={mealCols[code] ?? ""}
            onChange={(v) => onMealChange(code, v)}
            placeholder={`e.g. ${label.slice(0, 3)} Food`}
          />
          {showProtein && onProteinChange && (
            <Input
              value={proteinCols?.[code] ?? ""}
              onChange={(v) => onProteinChange(code, v)}
              placeholder={`e.g. ${label.slice(0, 3)} Protein`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UploadFormatSection({
  customerId,
  customerDisplayName,
  currentParserFormat,
  currentUploadConfig,
  canEdit,
}: UploadFormatSectionProps) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [category, setCategory] = useState<Category>(() =>
    deriveCategory(currentParserFormat, currentUploadConfig),
  );
  const [predefinedFormat, setPredefinedFormat] = useState(
    currentParserFormat ?? "",
  );
  const [flexType, setFlexType] = useState<ConfigurableParserType>(
    currentUploadConfig?.parserType ?? "single_sheet_weekly_grid",
  );
  const [formatName, setFormatName] = useState(
    currentUploadConfig?.formatName ?? "",
  );

  // ── Grid config ─────────────────────────────────────────────────────────────
  const initGridCfg = (currentUploadConfig?.parserType === "single_sheet_weekly_grid"
    ? currentUploadConfig.config
    : {}) as Record<string, unknown>;
  const [gridSheet, setGridSheet] = useState(
    (initGridCfg.sheetName as string) ?? "",
  );
  const [gridNameCol, setGridNameCol] = useState(
    (initGridCfg.nameColumn as string) ?? "",
  );
  const [gridDayCols, setGridDayCols] = useState<Record<string, string>>(
    (initGridCfg.weekdayColumns as Record<string, string>) ?? {},
  );

  // ── MultiSheet config ───────────────────────────────────────────────────────
  const initMsCfg = (
    currentUploadConfig?.parserType === "multi_sheet_daily_form" ||
    currentUploadConfig?.parserType === "multi_sheet_daily_remarks"
      ? currentUploadConfig.config
      : {}
  ) as Record<string, unknown>;
  const [msNameCol, setMsNameCol] = useState((initMsCfg.nameColumn as string) ?? "");
  const [msMealCol, setMsMealCol] = useState((initMsCfg.mealColumn as string) ?? "");
  const [msProteinCol, setMsProteinCol] = useState((initMsCfg.proteinColumn as string) ?? "");
  const [msSwallowCol, setMsSwallowCol] = useState((initMsCfg.swallowColumn as string) ?? "");
  const [msRemarksCol, setMsRemarksCol] = useState((initMsCfg.remarksColumn as string) ?? "");
  const [msHeaderRow, setMsHeaderRow] = useState(
    String((initMsCfg.headerRow as number | undefined) ?? 0),
  );
  const [msStripPrefix, setMsStripPrefix] = useState(
    (initMsCfg.stripMealPrefix as boolean) ?? false,
  );

  // ── Summary config ──────────────────────────────────────────────────────────
  const initSumCfg = (currentUploadConfig?.parserType === "summary_quantity_format"
    ? currentUploadConfig.config
    : {}) as Record<string, unknown>;
  const [sumSheet, setSumSheet] = useState((initSumCfg.sheetName as string) ?? "");
  const [sumMealCol, setSumMealCol] = useState((initSumCfg.mealColumn as string) ?? "");
  const [sumQtyCol, setSumQtyCol] = useState((initSumCfg.quantityColumn as string) ?? "");
  const [sumCommentCol, setSumCommentCol] = useState((initSumCfg.commentColumn as string) ?? "");
  const [sumDefaultDay, setSumDefaultDay] = useState(
    (initSumCfg.defaultDay as string) ?? "Mon",
  );

  // ── Energia config ──────────────────────────────────────────────────────────
  const initEnCfg = (currentUploadConfig?.parserType === "single_sheet_weekly_grid_with_reference_menu"
    ? currentUploadConfig.config
    : {}) as Record<string, unknown>;
  const [enOrderSheet, setEnOrderSheet] = useState(
    (initEnCfg.orderSheetName as string) ?? "",
  );
  const [enRefSheet, setEnRefSheet] = useState(
    (initEnCfg.referenceMenuSheetName as string) ?? "",
  );
  const [enNameCol, setEnNameCol] = useState(
    (initEnCfg.nameColumn as string) ?? "",
  );
  const [enHeaderRow, setEnHeaderRow] = useState(
    String((initEnCfg.headerRow as number | undefined) ?? 0),
  );
  const [enMealCols, setEnMealCols] = useState<Record<string, string>>(
    (initEnCfg.weekdayMealColumns as Record<string, string>) ?? {},
  );
  const [enProteinCols, setEnProteinCols] = useState<Record<string, string>>(
    (initEnCfg.weekdayProteinColumns as Record<string, string>) ?? {},
  );

  // ── Build config JSON from current form state ───────────────────────────────
  function buildConfigJson(): Record<string, unknown> {
    switch (flexType) {
      case "single_sheet_weekly_grid":
        return {
          ...(gridSheet.trim() ? { sheetName: gridSheet.trim() } : {}),
          nameColumn: gridNameCol.trim(),
          weekdayColumns: Object.fromEntries(
            Object.entries(gridDayCols).filter(([, v]) => v.trim()),
          ),
        };

      case "multi_sheet_daily_form":
        return {
          nameColumn: msNameCol.trim(),
          mealColumn: msMealCol.trim(),
          ...(msProteinCol.trim() ? { proteinColumn: msProteinCol.trim() } : {}),
          ...(msSwallowCol.trim() ? { swallowColumn: msSwallowCol.trim() } : {}),
          headerRow: parseInt(msHeaderRow) || 0,
          ...(msStripPrefix ? { stripMealPrefix: true } : {}),
        };

      case "multi_sheet_daily_remarks":
        return {
          nameColumn: msNameCol.trim(),
          mealColumn: msMealCol.trim(),
          ...(msRemarksCol.trim() ? { remarksColumn: msRemarksCol.trim() } : {}),
          headerRow: parseInt(msHeaderRow) || 0,
          ...(msStripPrefix ? { stripMealPrefix: true } : {}),
        };

      case "summary_quantity_format":
        return {
          ...(sumSheet.trim() ? { sheetName: sumSheet.trim() } : {}),
          mealColumn: sumMealCol.trim(),
          quantityColumn: sumQtyCol.trim(),
          ...(sumCommentCol.trim() ? { commentColumn: sumCommentCol.trim() } : {}),
          defaultDay: sumDefaultDay,
        };

      case "single_sheet_weekly_grid_with_reference_menu":
        return {
          ...(enOrderSheet.trim() ? { orderSheetName: enOrderSheet.trim() } : {}),
          ...(enRefSheet.trim() ? { referenceMenuSheetName: enRefSheet.trim() } : {}),
          nameColumn: enNameCol.trim(),
          headerRow: parseInt(enHeaderRow) || 0,
          weekdayMealColumns: Object.fromEntries(
            Object.entries(enMealCols).filter(([, v]) => v.trim()),
          ),
          weekdayProteinColumns: Object.fromEntries(
            Object.entries(enProteinCols).filter(([, v]) => v.trim()),
          ),
        };
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (category === "predefined" && !predefinedFormat) {
      return "Please select a predefined format.";
    }
    if (category === "flexible") {
      if (!formatName.trim()) return "Format name is required.";
      switch (flexType) {
        case "single_sheet_weekly_grid":
          if (!gridNameCol.trim()) return "Name column is required.";
          if (Object.values(gridDayCols).every((v) => !v.trim()))
            return "At least one weekday meal column must be configured.";
          break;
        case "multi_sheet_daily_form":
        case "multi_sheet_daily_remarks":
          if (!msNameCol.trim()) return "Name column is required.";
          if (!msMealCol.trim()) return "Meal column is required.";
          break;
        case "summary_quantity_format":
          if (!sumMealCol.trim()) return "Meal column is required.";
          if (!sumQtyCol.trim()) return "Quantity column is required.";
          break;
        case "single_sheet_weekly_grid_with_reference_menu":
          if (!enNameCol.trim()) return "Name column is required.";
          if (Object.values(enMealCols).every((v) => !v.trim()))
            return "At least one weekday meal column must be configured.";
          break;
      }
    }
    return null;
  }

  // ── Save handler ─────────────────────────────────────────────────────────────
  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (category === "not_configured") {
        // 1. Deactivate any flexible config
        await fetch(`/api/customers/${customerId}/upload-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deactivate: true }),
        });
        // 2. Clear parser_format
        await fetch(`/api/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parserFormat: null }),
        });
      } else if (category === "predefined") {
        // 1. Deactivate any flexible config
        await fetch(`/api/customers/${customerId}/upload-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deactivate: true }),
        });
        // 2. Set parser_format
        const res = await fetch(`/api/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parserFormat: predefinedFormat }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to save format.");
      } else {
        // Flexible — save the upload config (clears parser_format not needed;
        // upload config takes precedence over parser_format automatically).
        const res = await fetch(`/api/customers/${customerId}/upload-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formatName: formatName.trim(),
            parserType: flexType,
            config: buildConfigJson(),
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to save format.");
      }

      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Reset form to current state
    setCategory(deriveCategory(currentParserFormat, currentUploadConfig));
    setPredefinedFormat(currentParserFormat ?? "");
    setFlexType(currentUploadConfig?.parserType ?? "single_sheet_weekly_grid");
    setFormatName(currentUploadConfig?.formatName ?? "");
    setError(null);
    setEditing(false);
  }

  // ── View mode ────────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Upload format
          </h2>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {currentUploadConfig || currentParserFormat
                ? "Edit"
                : "Configure"}
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {currentUploadConfig ? (
            /* ── Flexible format configured ── */
            <div className="px-6 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Flexible format — active
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {currentUploadConfig.formatName}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {parserTypeLabel(currentUploadConfig.parserType)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    {buildConfigSummary(
                      currentUploadConfig.parserType,
                      currentUploadConfig.config,
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : currentParserFormat ? (
            /* ── Predefined (legacy) format ── */
            <div className="px-6 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  Predefined parser
                </span>
                <p className="text-sm text-zinc-900 dark:text-zinc-50">
                  {predefinedLabel(currentParserFormat)}
                </p>
              </div>
            </div>
          ) : (
            /* ── Not configured ── */
            <div className="flex flex-col items-start gap-3 px-6 py-5 sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Not configured
              </span>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Upload is disabled for this customer until an upload format is
                configured.
              </p>
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Configure upload format
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Upload format
        </h2>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Configure upload format for {customerDisplayName}
          </p>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          {/* ── Category ─────────────────────────────────────────────────── */}
          <Field label="Upload format type" required>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category);
                setError(null);
              }}
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="not_configured">Not configured (disable upload)</option>
              <option value="predefined">Predefined parser</option>
              <option value="flexible">Flexible upload format</option>
            </select>
          </Field>

          {/* ── Predefined sub-select ─────────────────────────────────────── */}
          {category === "predefined" && (
            <Field label="Parser format" required>
              <select
                value={predefinedFormat}
                onChange={(e) => setPredefinedFormat(e.target.value)}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">— select a format —</option>
                {PARSER_FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* ── Flexible fields ───────────────────────────────────────────── */}
          {category === "flexible" && (
            <>
              <Field label="Format name" required hint={'A short internal label, e.g. "Energia Upload Format"'}>
                <Input
                  value={formatName}
                  onChange={setFormatName}
                  placeholder="e.g. Energia Upload Format"
                />
              </Field>

              <Field label="Parser type" required>
                <select
                  value={flexType}
                  onChange={(e) =>
                    setFlexType(e.target.value as ConfigurableParserType)
                  }
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {FLEXIBLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>

              <hr className="border-zinc-100 dark:border-zinc-800" />

              {/* ── Type-specific fields ─────────────────────────────────── */}

              {/* A: single_sheet_weekly_grid */}
              {flexType === "single_sheet_weekly_grid" && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Single-sheet weekly grid settings
                  </p>
                  <Field label="Sheet name" hint="Leave blank to use the first sheet in the workbook.">
                    <Input value={gridSheet} onChange={setGridSheet} placeholder="e.g. Orders" />
                  </Field>
                  <Field label="Name column" required>
                    <Input value={gridNameCol} onChange={setGridNameCol} placeholder="e.g. Name" />
                  </Field>
                  <Field label="Weekday meal columns" required>
                    <WeekdayColumnGrid
                      mealCols={gridDayCols}
                      onMealChange={(day, val) =>
                        setGridDayCols((prev) => ({ ...prev, [day]: val }))
                      }
                    />
                  </Field>
                </div>
              )}

              {/* B: multi_sheet_daily_form */}
              {flexType === "multi_sheet_daily_form" && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Multi-sheet daily — form columns
                  </p>
                  <Field label="Name column" required>
                    <Input value={msNameCol} onChange={setMsNameCol} placeholder="e.g. Name" />
                  </Field>
                  <Field label="Meal column" required>
                    <Input value={msMealCol} onChange={setMsMealCol} placeholder="e.g. Lunch" />
                  </Field>
                  <Field label="Protein column" hint="Leave blank if there is no explicit protein column.">
                    <Input value={msProteinCol} onChange={setMsProteinCol} placeholder="e.g. Protein" />
                  </Field>
                  <Field label="Swallow column" hint="Leave blank if there is no explicit swallow column.">
                    <Input value={msSwallowCol} onChange={setMsSwallowCol} placeholder="e.g. Swallow" />
                  </Field>
                  <Field label="Header row (zero-based)" hint="0 = first row is the header.">
                    <Input value={msHeaderRow} onChange={setMsHeaderRow} placeholder="0" />
                  </Field>
                  <div className="flex items-center gap-2">
                    <input
                      id="stripPrefix"
                      type="checkbox"
                      checked={msStripPrefix}
                      onChange={(e) => setMsStripPrefix(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="stripPrefix" className="text-sm text-zinc-700 dark:text-zinc-300">
                      Strip meal prefix (e.g. "[OPTION 1] -")
                    </label>
                  </div>
                </div>
              )}

              {/* C: multi_sheet_daily_remarks */}
              {flexType === "multi_sheet_daily_remarks" && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Multi-sheet daily — remarks column
                  </p>
                  <Field label="Name column" required>
                    <Input value={msNameCol} onChange={setMsNameCol} placeholder="e.g. Name" />
                  </Field>
                  <Field label="Meal column" required>
                    <Input value={msMealCol} onChange={setMsMealCol} placeholder="e.g. Lunch" />
                  </Field>
                  <Field label="Remarks column" hint="Free-text field whose value is parsed for protein / swallow.">
                    <Input value={msRemarksCol} onChange={setMsRemarksCol} placeholder="e.g. Remarks" />
                  </Field>
                  <Field label="Header row (zero-based)">
                    <Input value={msHeaderRow} onChange={setMsHeaderRow} placeholder="0" />
                  </Field>
                  <div className="flex items-center gap-2">
                    <input
                      id="stripPrefixR"
                      type="checkbox"
                      checked={msStripPrefix}
                      onChange={(e) => setMsStripPrefix(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="stripPrefixR" className="text-sm text-zinc-700 dark:text-zinc-300">
                      Strip meal prefix (e.g. "[OPTION 1] -")
                    </label>
                  </div>
                </div>
              )}

              {/* D: summary_quantity_format */}
              {flexType === "summary_quantity_format" && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Summary quantity settings
                  </p>
                  <Field label="Sheet name" hint="Leave blank to use the first sheet.">
                    <Input value={sumSheet} onChange={setSumSheet} placeholder="e.g. Orders" />
                  </Field>
                  <Field label="Meal column" required>
                    <Input value={sumMealCol} onChange={setSumMealCol} placeholder="e.g. Meal" />
                  </Field>
                  <Field label="Quantity column" required>
                    <Input value={sumQtyCol} onChange={setSumQtyCol} placeholder="e.g. Number of Staff" />
                  </Field>
                  <Field label="Comment / split column" hint="Optional. Values like '4 with Semo, 2 Eba' split the quantity.">
                    <Input value={sumCommentCol} onChange={setSumCommentCol} placeholder="e.g. Comment" />
                  </Field>
                  <Field label="Default service day" required>
                    <select
                      value={sumDefaultDay}
                      onChange={(e) => setSumDefaultDay(e.target.value)}
                      className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {DAYS.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {/* E: single_sheet_weekly_grid_with_reference_menu (Energia) */}
              {flexType === "single_sheet_weekly_grid_with_reference_menu" && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Employee selection with reference menu
                  </p>
                  <Field
                    label="Order sheet name"
                    hint="The sheet that contains employee meal selections."
                    required
                  >
                    <Input
                      value={enOrderSheet}
                      onChange={setEnOrderSheet}
                      placeholder="e.g. Employee Selection"
                    />
                  </Field>
                  <Field
                    label="Reference menu sheet name"
                    hint="The reference menu sheet — will be silently skipped (not parsed as orders)."
                  >
                    <Input
                      value={enRefSheet}
                      onChange={setEnRefSheet}
                      placeholder="e.g. Food for the week"
                    />
                  </Field>
                  <Field label="Name column" required>
                    <Input value={enNameCol} onChange={setEnNameCol} placeholder="e.g. Name" />
                  </Field>
                  <Field
                    label="Header row (zero-based)"
                    hint="0 = first row. Use 0 if the first row in the sheet is the column headers."
                  >
                    <Input value={enHeaderRow} onChange={setEnHeaderRow} placeholder="0" />
                  </Field>
                  <Field label="Weekday columns" required>
                    <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Enter the exact column header text from the spreadsheet for each
                      weekday. Protein columns are optional.
                    </p>
                    <WeekdayColumnGrid
                      mealCols={enMealCols}
                      onMealChange={(day, val) =>
                        setEnMealCols((prev) => ({ ...prev, [day]: val }))
                      }
                      proteinCols={enProteinCols}
                      onProteinChange={(day, val) =>
                        setEnProteinCols((prev) => ({ ...prev, [day]: val }))
                      }
                      showProtein
                    />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save upload format"}
          </button>
        </div>
      </div>
    </section>
  );
}
