"use client";

import { mondayOfCurrentWeek } from "@/lib/calendar-date";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Shared types ───────────────────────────────────────────────────────────────

type ExceptionSummaryItem = {
  employeeName: string;
  dayOfWeek: string;
  rawMealText: string;
  bestScore: number | null;
  exceptionType?: string;
};

/** Returned by POST /api/upload/preview — no data is inserted. */
type UploadPreviewData = {
  // Meta
  customerName: string;
  parserType: string;
  parserLabel: string;
  serviceWeek: string;
  sheetsDetected: string[];
  rowsDetected: number;
  // From buildMatchSummary
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  fruitsOnlyCount?: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  sidesCaptured?: number;
  acceptedNoProteinCount?: number;
  noLunchCount?: number;
  exceptions: ExceptionSummaryItem[];
  // Extras
  duplicateWarnings?: number;
};

/** Returned by POST /api/upload — data IS inserted. */
type UploadSummary = {
  // From buildMatchSummary (same shape as preview)
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  fruitsOnlyCount?: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  sidesCaptured?: number;
  acceptedNoProteinCount?: number;
  noLunchCount?: number;
  exceptions: ExceptionSummaryItem[];
  // From persistUpload
  batchId: string;
  linesInserted: number;
  exceptionsInserted: number;
  duplicatesSkipped: number;
  // From the customer row
  customerId: string;
  customerName: string;
  serviceDay: string;
};

type CustomerFormatInfo = {
  label: string | null;
  parserType: string | null;
  hasConfig: boolean;
  configured: boolean;
};

// ─── Small shared sub-components ───────────────────────────────────────────────

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "warn" | "error";
}) {
  const valueClass =
    accent === "error"
      ? "text-red-600 dark:text-red-400"
      : accent === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-900 dark:text-zinc-50";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <p className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

// ─── Upload preview panel ───────────────────────────────────────────────────────

function UploadPreviewPanel({
  preview,
  isImporting,
  onConfirmImport,
  onCancel,
}: {
  preview: UploadPreviewData;
  isImporting: boolean;
  onConfirmImport: () => void;
  onCancel: () => void;
}) {
  const totalMatched =
    preview.matchedDirect +
    preview.matchedAlias +
    preview.matchedFuzzy +
    (preview.fruitsOnlyCount ?? 0);
  const likelyExceptions = preview.exceptions.length;
  const hasWarnings =
    likelyExceptions > 0 || (preview.duplicateWarnings ?? 0) > 0;

  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/40">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Preview — not yet imported
            </span>
          </div>
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Review the summary below before importing.{" "}
            <strong>No data has been saved yet.</strong>
          </p>
        </div>
      </div>

      {/* ── File / parser meta ── */}
      <div className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-xs dark:border-blue-900 dark:bg-zinc-950">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <p className="font-medium text-zinc-500 dark:text-zinc-400">Customer</p>
            <p className="text-zinc-900 dark:text-zinc-50">{preview.customerName}</p>
          </div>
          <div>
            <p className="font-medium text-zinc-500 dark:text-zinc-400">Service week</p>
            <p className="text-zinc-900 dark:text-zinc-50">{preview.serviceWeek}</p>
          </div>
          <div>
            <p className="font-medium text-zinc-500 dark:text-zinc-400">Parser</p>
            <p className="text-zinc-900 dark:text-zinc-50">{preview.parserLabel}</p>
          </div>
          <div>
            <p className="font-medium text-zinc-500 dark:text-zinc-400">Rows detected</p>
            <p className="text-zinc-900 dark:text-zinc-50">{preview.rowsDetected}</p>
          </div>
        </div>
        {preview.sheetsDetected.length > 0 && (
          <div className="mt-2">
            <p className="font-medium text-zinc-500 dark:text-zinc-400">
              Sheets detected ({preview.sheetsDetected.length})
            </p>
            <p className="text-zinc-700 dark:text-zinc-300">
              {preview.sheetsDetected.join(", ")}
            </p>
          </div>
        )}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="Orders" value={preview.totalOrders} />
        <StatTile
          label="Matched"
          value={totalMatched}
          accent={totalMatched > 0 ? "success" : undefined}
        />
        <StatTile label="Proteins" value={preview.proteinsCaptured} />
        <StatTile label="Swallows" value={preview.swallowsCaptured} />
        <StatTile
          label="Exceptions"
          value={likelyExceptions}
          accent={likelyExceptions > 0 ? "warn" : undefined}
        />
        {(preview.duplicateWarnings ?? 0) > 0 && (
          <StatTile
            label="Duplicates"
            value={preview.duplicateWarnings ?? 0}
            accent="warn"
          />
        )}
      </div>

      {/* ── Notices ── */}
      <div className="space-y-1.5">
        {(preview.noLunchCount ?? 0) > 0 && (
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <strong>{preview.noLunchCount}</strong> no-lunch entr
            {preview.noLunchCount !== 1 ? "ies" : "y"} will be skipped.
          </p>
        )}
        {(preview.fruitsOnlyCount ?? 0) > 0 && (
          <p className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-300">
            <strong>{preview.fruitsOnlyCount}</strong> Fruits Only order
            {preview.fruitsOnlyCount !== 1 ? "s" : ""} will be auto-accepted.
          </p>
        )}
        {(preview.duplicateWarnings ?? 0) > 0 && (
          <p className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-zinc-950 dark:text-amber-300">
            <strong>{preview.duplicateWarnings}</strong> employee
            {(preview.duplicateWarnings ?? 0) !== 1 ? "s" : ""} already have orders
            for this service day — those rows will be skipped as duplicates.
          </p>
        )}
      </div>

      {/* ── Exception preview (top 5) ── */}
      {likelyExceptions > 0 && preview.exceptions.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-white dark:border-amber-900 dark:bg-zinc-950">
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Likely exceptions ({likelyExceptions} total — showing first{" "}
              {Math.min(5, preview.exceptions.length)})
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {preview.exceptions.slice(0, 5).map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {item.employeeName}
                  </span>
                  <span className="mx-1 text-zinc-400">·</span>
                  <span className="text-zinc-500">{item.dayOfWeek}</span>
                  <p className="mt-0.5 truncate text-zinc-400 dark:text-zinc-500">
                    &ldquo;{item.rawMealText}&rdquo;
                  </p>
                </div>
                {item.exceptionType === "Protein not recognised" ? (
                  <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                    Protein
                  </span>
                ) : item.bestScore !== null ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {Math.round(item.bestScore * 100)}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onConfirmImport}
          disabled={isImporting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isImporting ? "Importing…" : hasWarnings ? "Confirm Import anyway →" : "Confirm Import →"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isImporting}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Post-upload result panel ───────────────────────────────────────────────────

function UploadResultPanel({
  summary,
  onUploadAnother,
}: {
  summary: UploadSummary;
  onUploadAnother: () => void;
}) {
  const totalMatched =
    summary.matchedDirect +
    summary.matchedAlias +
    summary.matchedFuzzy +
    (summary.fruitsOnlyCount ?? 0);
  const hasExceptions = summary.exceptionsInserted > 0;
  const previewExceptions = summary.exceptions.slice(0, 10);
  const exceptionsUrl = `/exceptions?customerId=${summary.customerId}&serviceWeekStart=${summary.serviceDay}`;
  const dashboardUrl = `/dashboard?date=${summary.serviceDay}`;

  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const cancelRejectRef = useRef<HTMLButtonElement>(null);

  async function handleRejectConfirm() {
    setIsRejecting(true);
    setRejectError(null);
    try {
      const res = await fetch("/api/upload/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: summary.batchId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rejection failed.");
      onUploadAnother();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : "Rejection failed.");
      setIsRejecting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Status header ── */}
      <div
        className={`rounded-xl border p-5 ${
          hasExceptions
            ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
            : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              hasExceptions
                ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            }`}
          >
            {hasExceptions ? "Needs Reconciliation" : "Ready for Review"}
          </span>
        </div>

        <p
          className={`text-sm ${
            hasExceptions
              ? "text-amber-900 dark:text-amber-200"
              : "text-emerald-900 dark:text-emerald-200"
          }`}
        >
          {hasExceptions ? (
            <>
              <strong>{summary.exceptionsInserted}</strong> exception
              {summary.exceptionsInserted !== 1 ? "s" : ""} found for{" "}
              <strong>{summary.customerName}</strong>. Matched orders have been
              saved — exceptions must be resolved before this customer can be
              released for production.
            </>
          ) : (
            <>
              All <strong>{totalMatched}</strong> uploaded orders for{" "}
              <strong>{summary.customerName}</strong> were matched successfully.
            </>
          )}
        </p>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="Uploaded" value={summary.totalOrders} />
        <StatTile
          label="Matched Meals"
          value={totalMatched}
          accent={totalMatched > 0 ? "success" : undefined}
        />
        <StatTile label="Proteins" value={summary.proteinsCaptured} />
        <StatTile label="Swallows" value={summary.swallowsCaptured} />
        {(summary.sidesCaptured ?? 0) > 0 && (
          <StatTile label="Sides" value={summary.sidesCaptured ?? 0} />
        )}
        <StatTile
          label="Exceptions"
          value={summary.exceptionsInserted}
          accent={summary.exceptionsInserted > 0 ? "warn" : undefined}
        />
      </div>

      {/* ── Notices ── */}
      {((summary.fruitsOnlyCount ?? 0) > 0 ||
        (summary.acceptedNoProteinCount ?? 0) > 0) && (
        <div className="space-y-1.5">
          {(summary.fruitsOnlyCount ?? 0) > 0 && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <strong>{summary.fruitsOnlyCount}</strong> Fruits Only order
              {summary.fruitsOnlyCount !== 1 ? "s" : ""} auto-accepted.
            </p>
          )}
          {(summary.acceptedNoProteinCount ?? 0) > 0 && (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <strong>{summary.acceptedNoProteinCount}</strong> order
              {summary.acceptedNoProteinCount !== 1 ? "s" : ""} accepted without
              protein — protein is not required for those meals.
            </p>
          )}
        </div>
      )}

      {(summary.noLunchCount ?? 0) > 0 && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <strong>{summary.noLunchCount}</strong> no-lunch entr
          {summary.noLunchCount !== 1 ? "ies" : "y"} skipped.
        </p>
      )}

      {summary.duplicatesSkipped > 0 && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {summary.duplicatesSkipped} duplicate
          {summary.duplicatesSkipped !== 1 ? "s" : ""} skipped.
        </p>
      )}

      {totalMatched > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Match breakdown: Direct {summary.matchedDirect} · Alias{" "}
          {summary.matchedAlias} · Fuzzy {summary.matchedFuzzy}
          {(summary.fruitsOnlyCount ?? 0) > 0 && (
            <> · Fruits Only {summary.fruitsOnlyCount}</>
          )}
        </p>
      )}

      {/* ── Primary actions ── */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {hasExceptions ? (
          <Link
            href={exceptionsUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
          >
            Resolve Exceptions →
          </Link>
        ) : (
          <Link
            href={dashboardUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Go to Dashboard →
          </Link>
        )}

        <Link
          href={dashboardUrl}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          View Dashboard
        </Link>

        <button
          type="button"
          onClick={onUploadAnother}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Upload Another File
        </button>

        {summary.batchId && (
          <button
            type="button"
            onClick={() => {
              setShowRejectConfirm(true);
              setRejectError(null);
            }}
            disabled={showRejectConfirm}
            className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Reject Upload
          </button>
        )}
      </div>

      {/* ── Reject confirmation ── */}
      {showRejectConfirm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
          <p className="mb-1 text-sm font-semibold text-red-900 dark:text-red-200">
            Reject this upload?
          </p>
          <p className="mb-4 text-sm text-red-800 dark:text-red-300">
            This will permanently delete all order data uploaded for{" "}
            <strong>{summary.customerName}</strong> (service week{" "}
            <strong>{summary.serviceDay}</strong>)
            {(summary.linesInserted > 0 || summary.exceptionsInserted > 0) && (
              <>
                {" "}—{" "}
                {summary.linesInserted > 0 && (
                  <>
                    <strong>{summary.linesInserted}</strong> order line
                    {summary.linesInserted !== 1 ? "s" : ""}
                    {summary.exceptionsInserted > 0 ? " and " : ""}
                  </>
                )}
                {summary.exceptionsInserted > 0 && (
                  <>
                    <strong>{summary.exceptionsInserted}</strong> exception
                    {summary.exceptionsInserted !== 1 ? "s" : ""}
                  </>
                )}
              </>
            )}
            . This action cannot be undone.
          </p>

          {rejectError && (
            <p className="mb-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {rejectError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRejecting ? "Rejecting…" : "Confirm Reject Upload"}
            </button>
            <button
              ref={cancelRejectRef}
              type="button"
              onClick={() => {
                setShowRejectConfirm(false);
                setRejectError(null);
              }}
              disabled={isRejecting}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Exception preview ── */}
      {hasExceptions && previewExceptions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Exception preview
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing first {previewExceptions.length} of{" "}
              {summary.exceptionsInserted}
            </span>
          </div>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {previewExceptions.map((item, index) => (
              <li
                key={`${item.employeeName}-${item.dayOfWeek}-${index}`}
                className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {item.employeeName}
                  </span>
                  <span className="mx-1.5 text-zinc-400">·</span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {item.dayOfWeek}
                  </span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    &ldquo;{item.rawMealText}&rdquo;
                  </p>
                </div>
                {item.exceptionType === "Protein not recognised" ? (
                  <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                    Protein
                  </span>
                ) : item.bestScore !== null ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {Math.round(item.bestScore * 100)}% match
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <Link
              href={exceptionsUrl}
              className="text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
            >
              Resolve all {summary.exceptionsInserted} exceptions →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [serviceDay, setServiceDay] = useState(mondayOfCurrentWeek);
  const [preview, setPreview] = useState<UploadPreviewData | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [customer, setCustomer] = useState("AVON");
  const [customers, setCustomers] = useState<string[]>([]);
  const [customerFormats, setCustomerFormats] = useState<
    Record<string, CustomerFormatInfo>
  >({});

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then(
        (d: {
          customers?: string[];
          customerFormats?: Record<string, CustomerFormatInfo>;
        }) => {
          const list = d.customers ?? [];
          setCustomers(list);
          setCustomerFormats(d.customerFormats ?? {});
          setCustomer((c) => (list.includes(c) ? c : (list[0] ?? c)));
        },
      )
      .catch(() => {});
  }, []);

  function resetForm() {
    setSummary(null);
    setPreview(null);
    setError(null);
    setFile(null);
  }

  async function handlePreview() {
    if (!file) {
      setError("Please select an .xlsx file first.");
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setPreview(null);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("serviceDay", serviceDay);
      formData.append("customer", customer);

      const response = await fetch("/api/upload/preview", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Preview failed.",
        );
      }

      setPreview(data as UploadPreviewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleImport() {
    if (!file) {
      setError("No file selected.");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("serviceDay", serviceDay);
      formData.append("customer", customer);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Import failed.",
        );
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[upload] result:", data);
      }
      // Clear preview, show result
      setPreview(null);
      setSummary(data as UploadSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  // ── Customer format info ────────────────────────────────────────────────────
  const currentFormat = customerFormats[customer] ?? null;

  return (
    <div
      className={`flex flex-1 justify-center bg-zinc-50 px-4 font-sans dark:bg-black ${
        summary || preview ? "items-start py-12" : "items-center py-16"
      }`}
    >
      <div className="w-full max-w-xl space-y-6">
        {/* ── Upload form (always visible until a result is shown) ── */}
        {!summary && (
          <main className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              Upload customer orders
            </h1>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Select a customer, service week, and .xlsx order file. You will
              see a preview before any data is saved.{" "}
              <a
                href="/menu"
                className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Uploading the weekly menu instead?
              </a>
            </p>

            {/* ── Customer selector ── */}
            <div className="mb-5">
              <label
                htmlFor="customer"
                className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Customer
              </label>
              <select
                id="customer"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value);
                  setError(null);
                  setPreview(null);
                  setSummary(null);
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {customers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Format info badge (configured only) */}
              {currentFormat?.configured && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {currentFormat.label ?? currentFormat.parserType}
                  {currentFormat.hasConfig && (
                    <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      configurable
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* ── No format configured — block upload ─────────────────────── */}
            {currentFormat?.configured === false && (
              <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⚠ No upload format configured for {customer}
                </p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  An upload format must be configured before orders can be
                  uploaded.{" "}
                  <Link
                    href="/customers"
                    className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
                  >
                    Configure it on the Customers page →
                  </Link>
                </p>
              </div>
            )}

            {/* ── Service week ── */}
            <div className="mb-5">
              <label
                htmlFor="serviceDay"
                className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Service week start
              </label>
              <input
                id="serviceDay"
                type="date"
                value={serviceDay}
                onChange={(e) => {
                  setServiceDay(e.target.value);
                  setError(null);
                  setPreview(null);
                  setSummary(null);
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>

            {/* ── File picker ── */}
            <div className={`mb-6 ${currentFormat?.configured === false ? "pointer-events-none opacity-40" : ""}`}>
              <label
                htmlFor="file"
                className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Excel file
              </label>
              <input
                id="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={currentFormat?.configured === false}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                  setPreview(null);
                  setSummary(null);
                }}
                className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
              />
            </div>

            {/* ── Preview button (primary action) ── */}
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing || !file || currentFormat?.configured === false}
              className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPreviewing ? "Preparing preview…" : "Preview Upload"}
            </button>

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                {error}
              </p>
            )}
          </main>
        )}

        {/* ── Preview panel ── */}
        {preview && !summary && (
          <UploadPreviewPanel
            preview={preview}
            isImporting={isImporting}
            onConfirmImport={handleImport}
            onCancel={() => {
              setPreview(null);
              setError(null);
            }}
          />
        )}

        {/* ── Import error (shown below preview if import fails) ── */}
        {preview && !summary && error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        {/* ── Result panel (after successful import) ── */}
        {summary && (
          <UploadResultPanel
            summary={summary}
            onUploadAnother={resetForm}
          />
        )}
      </div>
    </div>
  );
}
