import Link from "next/link";
import { ServiceDayPicker } from "@/app/(app)/dashboard/service-day-picker";
import {
  type ConsolidatedRow,
  type CustomerRef,
  type ProductionCustomerRow,
  fetchProductionDailyDashboard,
  formatServiceDayLabel,
  parseServiceDayParam,
} from "@/lib/avon-dashboard";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

// ─── Consolidated table (meals / proteins / swallows) ─────────────────────────

function ConsolidatedTable({
  firstColLabel,
  rows,
  customers,
  serviceDay,
}: {
  firstColLabel: string;
  rows: ConsolidatedRow[];
  customers: CustomerRef[];
  serviceDay: string;
}) {
  if (rows.length === 0) return null;

  const colTotals = customers.map((c) =>
    rows.reduce((sum, r) => sum + (r.counts[c.name] ?? 0), 0),
  );
  const grand = colTotals.reduce((a, b) => a + b, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <th className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50">
              {firstColLabel}
            </th>
            {customers.map((c) => (
              <th
                key={c.id}
                className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50"
              >
                <Link
                  href={`/dashboard/customer-orders?customerId=${c.id}&serviceDay=${serviceDay}&from=dashboard`}
                  className="underline decoration-dotted underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                  aria-label={`View orders for ${c.name}`}
                >
                  {c.name}
                </Link>
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                {row.label}
              </td>
              {customers.map((c) => (
                <td
                  key={c.id}
                  className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300"
                >
                  {row.counts[c.name] ?? 0}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                {row.total}
              </td>
            </tr>
          ))}
          <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
            <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
              Grand Total
            </td>
            {colTotals.map((t, i) => (
              <td
                key={customers[i].id}
                className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-50"
              >
                {t}
              </td>
            ))}
            <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
              {grand}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ─── Per-customer breakdown card ─────────────────────────────────────────────

function CustomerBreakdownCard({
  row,
  serviceDay,
}: {
  row: ProductionCustomerRow;
  serviceDay: string;
}) {
  const releasedDate = row.releasedAt
    ? new Date(row.releasedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-sm font-semibold">
            <Link
              href={`/dashboard/customer-orders?customerId=${row.customerId}&serviceDay=${serviceDay}&from=dashboard`}
              className="text-emerald-700 underline decoration-dotted underline-offset-2 hover:text-emerald-600 hover:decoration-solid dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              aria-label={`View orders for ${row.customerName}`}
            >
              {row.customerName}
            </Link>
          </p>
          {releasedDate && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Released {releasedDate}
            </p>
          )}
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800">
          {row.totalMeals} meal{row.totalMeals !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Breakdown columns */}
      <div className="grid grid-cols-1 divide-y divide-zinc-100 dark:divide-zinc-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {/* Meals */}
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Meals
          </p>
          {row.mealCounts.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
          ) : (
            <ul className="space-y-1">
              {row.mealCounts.map(({ meal, total }) => (
                <li
                  key={meal}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">{meal}</span>
                  <span className="shrink-0 tabular-nums font-medium text-zinc-900 dark:text-zinc-50">
                    ×{total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Proteins */}
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Proteins
          </p>
          {row.proteinCounts.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
          ) : (
            <ul className="space-y-1">
              {row.proteinCounts.map(({ protein, total }) => (
                <li
                  key={protein}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">{protein}</span>
                  <span className="shrink-0 tabular-nums font-medium text-zinc-900 dark:text-zinc-50">
                    ×{total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Swallows */}
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Swallows
          </p>
          {row.swallowCounts.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">—</p>
          ) : (
            <ul className="space-y-1">
              {row.swallowCounts.map(({ swallow, total }) => (
                <li
                  key={swallow}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">{swallow}</span>
                  <span className="shrink-0 tabular-nums font-medium text-zinc-900 dark:text-zinc-50">
                    ×{total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductionDailyDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const serviceDay = parseServiceDayParam(params.date);
  const data = await fetchProductionDailyDashboard(serviceDay);

  const hasReleases = data.releasedCustomerCount > 0;

  // Derived totals for stat cards
  const totalProteins = data.proteinRows.reduce((sum, r) => sum + r.total, 0);
  const totalSwallows = data.swallowRows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl">
        {/* ── Header ── */}
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Production
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Daily Dashboard
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {formatServiceDayLabel(serviceDay)}
            {hasReleases && (
              <>
                {" "}
                &middot;{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {data.grandTotal} meal{data.grandTotal !== 1 ? "s" : ""} across{" "}
                  {data.releasedCustomerCount} released customer
                  {data.releasedCustomerCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </p>
        </header>

        {/* ── Service day picker ── */}
        <div className="mb-8">
          <label
            htmlFor="serviceDay"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Production day
          </label>
          <ServiceDayPicker
            serviceDay={serviceDay}
            basePath="/production/daily-dashboard"
          />
        </div>

        {/* ── Empty state ── */}
        {!hasReleases && (
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              No orders released for production on this day.
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Orders must be uploaded, reconciled, and formally released before
              they appear here.
            </p>
            <Link
              href={`/dashboard?date=${serviceDay}`}
              className="mt-5 inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Go to Order Review
            </Link>
          </div>
        )}

        {/* ── Released data ── */}
        {hasReleases && (
          <>
            {/* Summary stat cards */}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total Meals" value={data.grandTotal} />
              <StatCard label="Customers" value={data.releasedCustomerCount} />
              <StatCard label="Proteins" value={totalProteins} />
              <StatCard label="Swallows" value={totalSwallows} />
            </div>

            {/* Consolidated meals table */}
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Meals
            </h2>
            <ConsolidatedTable
              firstColLabel="Meal"
              rows={data.mealRows}
              customers={data.customers}
              serviceDay={serviceDay}
            />

            {/* Consolidated proteins table */}
            {data.proteinRows.length > 0 && (
              <>
                <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Proteins
                </h2>
                <ConsolidatedTable
                  firstColLabel="Protein"
                  rows={data.proteinRows}
                  customers={data.customers}
                  serviceDay={serviceDay}
                />
              </>
            )}

            {/* Consolidated swallows table */}
            {data.swallowRows.length > 0 && (
              <>
                <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Swallows
                </h2>
                <ConsolidatedTable
                  firstColLabel="Swallow"
                  rows={data.swallowRows}
                  customers={data.customers}
                  serviceDay={serviceDay}
                />
              </>
            )}

            {/* Per-customer breakdown */}
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              By Customer
            </h2>
            <div className="space-y-4">
              {data.customerRows.map((row) => (
                <CustomerBreakdownCard key={row.customerId} row={row} serviceDay={serviceDay} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
