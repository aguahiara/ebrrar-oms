"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  countSimilarExceptions,
  fetchAllCustomers,
  fetchExceptions,
  fetchMenuItemsForServiceDay,
  type BulkScope,
  type CustomerSummary,
  type ExceptionStatusFilter,
  type OpenOrderException,
} from "@/lib/avon-exceptions";
import { DEFAULT_SERVICE_DAY, formatServiceDayLabel } from "@/lib/avon-dashboard";
import { addCalendarDays } from "@/lib/calendar-date";
import type { AvonMenuItem } from "@/lib/avon-menu";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ExceptionStatusFilter; label: string }[] = [
  { value: "Open", label: "Unresolved" },
  { value: "Resolved", label: "Resolved (Mapped / Dropped)" },
  { value: "AcceptedAsIs", label: "Accepted as-is" },
  { value: "All", label: "All statuses" },
];

type ResolveAction = "map" | "drop" | "accept";

// ─── Small helpers ────────────────────────────────────────────────────────────

function scorePercent(score: number | null): string | null {
  if (score === null) return null;
  return `${Math.round(score * 100)}%`;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Open: {
    label: "Unresolved",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  Resolved: {
    label: "Resolved",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  AcceptedAsIs: {
    label: "Accepted as-is",
    className:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.Open;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Main content (needs Suspense for useSearchParams) ────────────────────────

function ExceptionsContent() {
  const searchParams = useSearchParams();

  // ── Filter state — initialised from URL params ────────────────────────────
  const [serviceDay, setServiceDay] = useState(
    searchParams.get("date") || DEFAULT_SERVICE_DAY,
  );
  const [serviceWeekStart, setServiceWeekStart] = useState(
    searchParams.get("serviceWeekStart") || "",
  );
  // weekMode is true when we arrived via the upload "Resolve Exceptions" link
  const weekMode = serviceWeekStart !== "";

  const [customerId, setCustomerId] = useState(
    searchParams.get("customerId") || "",
  );
  const [statusFilter, setStatusFilter] = useState<ExceptionStatusFilter>("Open");

  // ── Data state ────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [exceptions, setExceptions] = useState<OpenOrderException[]>([]);
  const [menuItems, setMenuItems] = useState<AvonMenuItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Per-exception action state ────────────────────────────────────────────
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<Record<string, string>>({});
  const [saveAsAlias, setSaveAsAlias] = useState<Record<string, boolean>>({});
  // Bulk-correction state
  const [applyToSimilar, setApplyToSimilar] = useState<Record<string, boolean>>({});
  const [similarScope, setSimilarScope] = useState<Record<string, BulkScope>>({});
  const [similarCount, setSimilarCount] = useState<Record<string, number | null>>({});
  const [similarCountLoading, setSimilarCountLoading] = useState<Record<string, boolean>>({});

  // ── Global UI state ───────────────────────────────────────────────────────
  const [customersLoading, setCustomersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const pageTitle = selectedCustomer
    ? `${selectedCustomer.display_name} Exceptions`
    : "Order Exceptions";

  // ── Load customers once ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetchAllCustomers()
      .then((data) => { if (alive) { setCustomers(data); setCustomersLoading(false); } })
      .catch(() => { if (alive) setCustomersLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── Load exceptions when filters change ───────────────────────────────────
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!customerId) {
        setExceptions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = weekMode
          ? await fetchExceptions({ customerId, serviceWeekStart, statusFilter })
          : await fetchExceptions({ customerId, serviceDay, statusFilter });
        if (!alive) return;
        setExceptions(data);

        const initialSelection: Record<string, string> = {};
        for (const ex of data) {
          if (ex.status === "Open" && ex.suggested_item_id) {
            initialSelection[ex.id] = ex.suggested_item_id;
          }
        }
        setSelectedMenuItemId((prev) => ({ ...prev, ...initialSelection }));
        setSaveAsAlias({});
        setApplyToSimilar({});
        setSimilarScope({});
        setSimilarCount({});
        setSimilarCountLoading({});
        setLoading(false);
      } catch (err: unknown) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load exceptions.");
        setExceptions([]);
        setLoading(false);
      }
    };

    void run();
    return () => { alive = false; };
  }, [customerId, serviceDay, serviceWeekStart, weekMode, statusFilter, refreshKey]);

  // ── Load menu items when customer / day changes ───────────────────────────
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!selectedCustomer) {
        setMenuItems([]);
        return;
      }

      try {
        let data: AvonMenuItem[];

        if (weekMode && serviceWeekStart) {
          // Load all five weekdays and merge into a single deduplicated list
          const weekDates = [0, 1, 2, 3, 4].map((n) =>
            addCalendarDays(serviceWeekStart, n),
          );
          const allDaysItems = await Promise.all(
            weekDates.map((d) =>
              fetchMenuItemsForServiceDay(selectedCustomer.display_name, d),
            ),
          );
          const seen = new Set<string>();
          data = [];
          for (const dayItems of allDaysItems) {
            for (const item of dayItems) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                data.push(item);
              }
            }
          }
        } else {
          data = await fetchMenuItemsForServiceDay(
            selectedCustomer.display_name,
            serviceDay,
          );
        }

        if (!alive) return;
        setMenuItems(data);
        if (data[0]) {
          setSelectedMenuItemId((prev) => {
            const updated = { ...prev };
            for (const ex of exceptions) {
              if (ex.status === "Open" && !updated[ex.id]) {
                updated[ex.id] = data[0].id;
              }
            }
            return updated;
          });
        }
      } catch {
        if (!alive) return;
        setMenuItems([]);
      }
    };

    void run();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, serviceDay, serviceWeekStart, weekMode, selectedCustomer]);

  // ── Helper: show timed success banner ────────────────────────────────────
  function showSuccess(msg: string) {
    setSuccessMessage(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 6000);
  }

  // ── Helper: fetch + store similar-exception count ─────────────────────────
  async function loadSimilarCount(ex: OpenOrderException, scope: BulkScope) {
    setSimilarCountLoading((prev) => ({ ...prev, [ex.id]: true }));
    setSimilarCount((prev) => ({ ...prev, [ex.id]: null }));
    try {
      const n = await countSimilarExceptions({
        customerId: ex.customer_id,
        rawValue: ex.raw_value,
        exceptionType: ex.exception_type,
        excludeId: ex.id,
        scope,
        serviceDay: ex.service_day,
      });
      setSimilarCount((prev) => ({ ...prev, [ex.id]: n }));
    } catch {
      setSimilarCount((prev) => ({ ...prev, [ex.id]: null }));
    } finally {
      setSimilarCountLoading((prev) => ({ ...prev, [ex.id]: false }));
    }
  }

  // ── Resolve handler ────────────────────────────────────────────────────────
  async function handleResolve(ex: OpenOrderException, action: ResolveAction) {
    const isBulk = applyToSimilar[ex.id] ?? false;

    // Confirmation when bulk is active
    if (isBulk) {
      const others = similarCount[ex.id] ?? 0;
      const total = others + 1;
      const confirmed = window.confirm(
        `This will apply the same correction to ${total} unresolved exception${total !== 1 ? "s" : ""} for this customer` +
          (others > 0 ? ` (${others} similar + this one).` : ".") +
          " Continue?",
      );
      if (!confirmed) return;
    }

    setResolvingId(ex.id);
    setError(null);

    try {
      const res = await fetch("/api/exceptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: ex.id,
          action,
          menuItemId: action === "map" ? selectedMenuItemId[ex.id] : undefined,
          saveAsAlias: action === "map" ? (saveAsAlias[ex.id] ?? false) : false,
          applyToSimilar: isBulk,
          scope: isBulk ? (similarScope[ex.id] ?? "service_day") : "service_day",
        }),
      });

      const data = (await res.json()) as { ok?: boolean; affected?: number; error?: string };

      if (!res.ok) throw new Error(data.error ?? "Failed to resolve exception.");

      const affected = data.affected ?? 1;
      showSuccess(
        `Correction applied to ${affected} exception${affected !== 1 ? "s" : ""}.`,
      );

      if (isBulk && affected > 1) {
        // Reload entire list so all bulk-resolved rows disappear
        setRefreshKey((k) => k + 1);
      } else {
        setExceptions((current) => current.filter((row) => row.id !== ex.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve exception.");
    } finally {
      setResolvingId(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl">

        {/* ── Page header ── */}
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Order management
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </h1>
          {selectedCustomer && (
            <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
              {weekMode
                ? `Week starting ${formatServiceDayLabel(serviceWeekStart)}`
                : formatServiceDayLabel(serviceDay)}
            </p>
          )}
        </header>

        {/* ── Filters ── */}
        <div className="mb-8 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Customer
            </label>
            <select
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setExceptions([]); }}
              disabled={customersLoading}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">
                {customersLoading ? "Loading…" : "Select a customer"}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="serviceDateFilter" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {weekMode ? "Service week start" : "Service day"}
            </label>
            <input
              id="serviceDateFilter"
              type="date"
              value={weekMode ? serviceWeekStart : serviceDay}
              onChange={(e) => {
                if (!e.target.value) return;
                if (weekMode) setServiceWeekStart(e.target.value);
                else setServiceDay(e.target.value);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExceptionStatusFilter)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Success banner ── */}
        {successMessage && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-800 dark:bg-emerald-950/60">
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              {successMessage}
            </p>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="ml-4 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {/* ── No customer selected ── */}
        {!customerId && !customersLoading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a customer above to view their exceptions.
            </p>
          </div>
        )}

        {/* ── Loading ── */}
        {customerId && loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}

        {/* ── Empty state ── */}
        {customerId && !loading && exceptions.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {weekMode
                ? "No exceptions found for this customer and service week."
                : "No exceptions found for this customer and service date."}
            </p>
          </div>
        )}

        {/* ── Exception list ── */}
        {customerId && !loading && exceptions.length > 0 && (
          <ul className="space-y-4">
            {exceptions.map((ex) => {
              const suggestedPct = scorePercent(ex.suggested_score);
              const isResolving = resolvingId === ex.id;
              const isOpen = ex.status === "Open";

              const isBulk = applyToSimilar[ex.id] ?? false;
              const scope = similarScope[ex.id] ?? "service_day";
              const simCount = similarCount[ex.id] ?? null;
              const simCountLoading = similarCountLoading[ex.id] ?? false;

              return (
                <li
                  key={ex.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {/* Status badge (non-Open exceptions only) */}
                  {!isOpen && (
                    <div className="mb-3">
                      <StatusBadge status={ex.status} />
                    </div>
                  )}

                  {/* Exception details */}
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {ex.employee_ref}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      Raw: &quot;{ex.raw_value}&quot;
                    </p>
                    {ex.suggested_item_id && (
                      <p className="text-zinc-600 dark:text-zinc-400">
                        Suggested:{" "}
                        <span className="text-zinc-900 dark:text-zinc-50">
                          {ex.suggested_canonical_name ?? "Unknown item"}
                        </span>
                        {suggestedPct && (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {" "}({suggestedPct})
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Action controls — Open exceptions only */}
                  {isOpen && (
                    <>
                      {/* Map dropdown */}
                      <div className="mt-4">
                        <label
                          htmlFor={`menu-${ex.id}`}
                          className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                        >
                          Map to menu item
                        </label>
                        <select
                          id={`menu-${ex.id}`}
                          value={selectedMenuItemId[ex.id] ?? ""}
                          onChange={(e) =>
                            setSelectedMenuItemId((curr) => ({
                              ...curr,
                              [ex.id]: e.target.value,
                            }))
                          }
                          disabled={menuItems.length === 0 || isResolving}
                          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        >
                          {menuItems.length === 0 ? (
                            <option value="">No menu items for this day</option>
                          ) : (
                            menuItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.canonical_name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Save as alias */}
                      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <input
                          type="checkbox"
                          checked={saveAsAlias[ex.id] ?? false}
                          onChange={(e) =>
                            setSaveAsAlias((curr) => ({
                              ...curr,
                              [ex.id]: e.target.checked,
                            }))
                          }
                          disabled={isResolving}
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                        Save as alias
                      </label>

                      {/* ── Bulk-correction option ─────────────────────────── */}
                      <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={isBulk}
                            disabled={isResolving}
                            onChange={async (e) => {
                              const checked = e.target.checked;
                              setApplyToSimilar((curr) => ({
                                ...curr,
                                [ex.id]: checked,
                              }));
                              if (checked) {
                                await loadSimilarCount(ex, scope);
                              }
                            }}
                            className="mt-0.5 rounded border-zinc-300 dark:border-zinc-600"
                          />
                          <span>
                            Apply this correction to all similar unresolved
                            occurrences for this customer
                          </span>
                        </label>

                        {isBulk && (
                          <div className="mt-3 ml-6 space-y-2">
                            {/* Scope selector */}
                            <div className="flex flex-wrap gap-4 text-sm">
                              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                                <input
                                  type="radio"
                                  name={`scope-${ex.id}`}
                                  value="service_day"
                                  checked={scope === "service_day"}
                                  disabled={isResolving}
                                  onChange={async () => {
                                    setSimilarScope((curr) => ({
                                      ...curr,
                                      [ex.id]: "service_day",
                                    }));
                                    await loadSimilarCount(ex, "service_day");
                                  }}
                                />
                                This service day only
                              </label>
                              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                                <input
                                  type="radio"
                                  name={`scope-${ex.id}`}
                                  value="all"
                                  checked={scope === "all"}
                                  disabled={isResolving}
                                  onChange={async () => {
                                    setSimilarScope((curr) => ({
                                      ...curr,
                                      [ex.id]: "all",
                                    }));
                                    await loadSimilarCount(ex, "all");
                                  }}
                                />
                                All unresolved (any date)
                              </label>
                            </div>

                            {/* Count feedback */}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {simCountLoading ? (
                                "Counting similar exceptions…"
                              ) : simCount === null ? (
                                ""
                              ) : simCount === 0 ? (
                                "No other similar unresolved exceptions found."
                              ) : (
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                  {simCount} other similar unresolved exception
                                  {simCount !== 1 ? "s" : ""} found.
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isResolving || !selectedMenuItemId[ex.id]}
                          onClick={() => handleResolve(ex, "map")}
                          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {isResolving ? "Saving…" : "Map"}
                        </button>
                        <button
                          type="button"
                          disabled={isResolving}
                          onClick={() => handleResolve(ex, "drop")}
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
                        >
                          Drop
                        </button>
                        <button
                          type="button"
                          disabled={isResolving}
                          onClick={() => handleResolve(ex, "accept")}
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
                        >
                          Accept as-is
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

// ─── Page export (wraps content in Suspense for useSearchParams) ──────────────

export default function ExceptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      }
    >
      <ExceptionsContent />
    </Suspense>
  );
}
