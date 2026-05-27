"use client";

import Link from "next/link";
import { useState } from "react";
import type { AggregateReportLine, MissingProfileFlag, ProductionQuantityReport } from "@/lib/portion-types";
import { BreakdownModal } from "@/app/production-quantities/breakdown-modal";
import { isCalendarDate } from "@/lib/calendar-date";

type Customer = { id: string; display_name: string };

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: "red" | "amber" }) {
  const base = "rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950";
  const border =
    accent === "red"
      ? "border-red-200 dark:border-red-800"
      : accent === "amber"
        ? "border-amber-200 dark:border-amber-800"
        : "border-zinc-200 dark:border-zinc-800";
  const text =
    accent === "red"
      ? "text-red-700 dark:text-red-300"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-zinc-900 dark:text-zinc-50";

  return (
    <div className={`${base} ${border}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${text}`}>{value}</p>
    </div>
  );
}

export default function ProductionQuantitiesPage() {
  const [serviceDay, setServiceDay] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [filterCustomerId, setFilterCustomerId] = useState("");

  const [report, setReport] = useState<ProductionQuantityReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeBreakdown, setActiveBreakdown] = useState<AggregateReportLine | null>(null);

  // Load customers lazily when the filter dropdown is first focused
  function ensureCustomersLoaded() {
    if (customersLoaded) return;
    setCustomersLoaded(true);
    fetch("/api/customers/full")
      .then((r) => r.json())
      .then((data) => setCustomers(data ?? []))
      .catch(() => {});
  }

  async function handleGenerate() {
    setError(null);
    setReport(null);
    if (!serviceDay || !isCalendarDate(serviceDay)) {
      setError("Please select a valid service day.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/production-quantities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_day: serviceDay,
          customer_id: filterCustomerId || undefined,
          save: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate report.");
      setReport(data as ProductionQuantityReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const rows: string[][] = [
      [
        "Component",
        "Unit",
        "Total Required",
        "Overage %",
        "Total + Overage",
        "Source Meal Count",
        "Customer",
        "Meal Category",
        "Customer Total Required",
        "Customer Total + Overage",
      ],
    ];
    for (const agg of report.aggregate_lines) {
      for (const cl of agg.customer_lines) {
        rows.push([
          agg.component_name,
          agg.unit,
          String(agg.total_required),
          String(agg.overage_percentage),
          String(agg.total_with_overage),
          String(agg.source_meal_count),
          cl.customer_name,
          cl.meal_category ?? "",
          String(cl.total_required),
          String(cl.total_with_overage),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-quantities-${serviceDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const missingFlags: MissingProfileFlag[] = report?.missing_flags ?? [];

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Kitchen planning
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              Production Quantities
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Generates ingredient quantities from released meal orders.
            </p>
          </div>
          <Link
            href="/portion-profiles"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Portion Profiles
          </Link>
        </header>

        {/* Controls */}
        <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Service Day
            </label>
            <input
              type="date"
              value={serviceDay}
              onChange={(e) => setServiceDay(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Filter by Customer{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <select
              value={filterCustomerId}
              onChange={(e) => setFilterCustomerId(e.target.value)}
              onFocus={ensureCustomersLoaded}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All released customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {generating ? "Generating…" : "Generate Report"}
            </button>
            {report && (
              <button
                onClick={exportCsv}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {report && (
          <>
            {/* Summary cards */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total Meals" value={report.summary.total_meals} />
              <StatCard label="Customers" value={report.summary.customer_count} />
              <StatCard label="Components" value={report.summary.component_count} />
              <StatCard
                label="Warnings"
                value={report.summary.missing_count}
                accent={report.summary.missing_count > 0 ? "red" : undefined}
              />
            </div>

            {/* Missing flags */}
            {missingFlags.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950">
                <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Missing portion data — {missingFlags.length} warning(s)
                </p>
                <ul className="space-y-1">
                  {missingFlags.map((f, i) => (
                    <li key={i} className="text-sm text-amber-700 dark:text-amber-300">
                      {f.customer_name}:{" "}
                      {f.reason === "no_active_profile"
                        ? "No active portion profile for this date."
                        : `No components defined for category "${f.meal_category}".`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Aggregate table */}
            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Kitchen Production Quantities
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Service day: {serviceDay} · Generated{" "}
                  {new Date(report.generated_at).toLocaleTimeString("en-NG")}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    {[
                      "Component",
                      "Unit",
                      "Total Required",
                      "Overage %",
                      "Total + Overage",
                      "Meal Count",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.aggregate_lines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                      >
                        No data. Check that dashboards have been released for this service day
                        and that portion profiles are active.
                      </td>
                    </tr>
                  ) : (
                    report.aggregate_lines.map((agg, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                          {agg.component_name}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                          {agg.unit}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {agg.total_required.toLocaleString("en-NG", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {agg.overage_percentage}%
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                          {agg.total_with_overage.toLocaleString("en-NG", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {agg.source_meal_count}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setActiveBreakdown(agg)}
                            className="text-xs font-medium text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                          >
                            Breakdown
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {!report && !generating && !error && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a service day and click{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Generate Report
              </span>{" "}
              to calculate kitchen quantities.
            </p>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Only customers whose dashboards have been released will appear.
            </p>
          </div>
        )}

        {activeBreakdown && (
          <BreakdownModal
            line={activeBreakdown}
            onClose={() => setActiveBreakdown(null)}
          />
        )}
      </main>
    </div>
  );
}
