"use client";

import { mondayOfCurrentWeek } from "@/lib/calendar-date";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type UploadSummary = {
  // From buildMatchSummary
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  exceptions: {
    employeeName: string;
    dayOfWeek: string;
    rawMealText: string;
    bestScore: number | null;
  }[];
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

// ─── Post-upload result panel ───────────────────────────────────────────────────

function UploadResultPanel({
  summary,
  onUploadAnother,
}: {
  summary: UploadSummary;
  onUploadAnother: () => void;
}) {
  const totalMatched =
    summary.matchedDirect + summary.matchedAlias + summary.matchedFuzzy;
  const hasExceptions = summary.exceptionsInserted > 0;
  const previewExceptions = summary.exceptions.slice(0, 10);
  const exceptionsUrl = `/exceptions?customerId=${summary.customerId}&serviceWeekStart=${summary.serviceDay}`;
  const dashboardUrl = `/dashboard?date=${summary.serviceDay}`;

  // ── Reject-upload state ───────────────────────────────────────────────────
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
      // On success, reset the whole upload form so the user can re-upload
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
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <StatTile label="Uploaded" value={summary.totalOrders} />
        <StatTile
          label="Matched"
          value={totalMatched}
          accent={totalMatched > 0 ? "success" : undefined}
        />
        <StatTile
          label="Exceptions"
          value={summary.exceptionsInserted}
          accent={summary.exceptionsInserted > 0 ? "warn" : undefined}
        />
        <StatTile label="Proteins" value={summary.proteinsCaptured} />
        <StatTile label="Swallows" value={summary.swallowsCaptured} />
      </div>

      {/* ── Duplicates notice ── */}
      {summary.duplicatesSkipped > 0 && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {summary.duplicatesSkipped} duplicate
          {summary.duplicatesSkipped !== 1 ? "s" : ""} skipped — those
          employees were already counted for that service day.
        </p>
      )}

      {/* ── Match breakdown ── */}
      {totalMatched > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Match breakdown: Direct {summary.matchedDirect} · Alias{" "}
          {summary.matchedAlias} · Fuzzy {summary.matchedFuzzy}
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
      </div>

      {/* ── Reject upload ── */}
      {(summary.linesInserted > 0 || summary.exceptionsInserted > 0) && (
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {!showRejectConfirm ? (
            <button
              type="button"
              onClick={() => {
                setShowRejectConfirm(true);
                setRejectError(null);
              }}
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Reject this upload
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40">
              <p className="mb-1 text-sm font-semibold text-red-900 dark:text-red-200">
                Reject this upload?
              </p>
              <p className="mb-4 text-sm text-red-800 dark:text-red-300">
                This will permanently delete the{" "}
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
                )}{" "}
                uploaded for <strong>{summary.customerName}</strong>. This
                action cannot be undone.
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
                  {isRejecting ? "Rejecting…" : "Reject Upload"}
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
                {item.bestScore !== null && (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {Math.round(item.bestScore * 100)}% match
                  </span>
                )}
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
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [customer, setCustomer] = useState("AVON");
  const [customers, setCustomers] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d: { customers?: string[] }) => {
        const list = d.customers ?? [];
        setCustomers(list);
        setCustomer((c) => (list.includes(c) ? c : (list[0] ?? c)));
      })
      .catch(() => {});
  }, []);

  function resetForm() {
    setSummary(null);
    setError(null);
    setFile(null);
    // Reset the file input by key — trick: update a key on the input
  }

  async function handleUpload() {
    if (!file) {
      setError("Please select an .xlsx file first.");
      setSummary(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    setSummary(null);

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
          (data as { error?: string }).error ?? "Upload failed.",
        );
      }

      setSummary(data as UploadSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className={`flex flex-1 justify-center bg-zinc-50 px-4 font-sans dark:bg-black ${
        summary ? "items-start py-12" : "items-center py-16"
      }`}
    >
      <div className="w-full max-w-xl space-y-6">
        {/* ── Upload form ── */}
        <main className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Upload customer orders
          </h1>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            A customer&rsquo;s weekly order file (AVON, HGI, ELCREST).{" "}
            <a
              href="/menu"
              className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
            >
              Uploading the weekly menu instead?
            </a>
          </p>

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
          </div>

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
                setSummary(null);
              }}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <div className="mb-6">
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
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
                setSummary(null);
              }}
              className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
            />
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || !file}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isUploading ? "Uploading…" : "Upload"}
          </button>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}
        </main>

        {/* ── Result panel ── */}
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
