import { ReleaseControls } from "@/app/(app)/dashboard/release-controls";
import { ServiceDayPicker } from "@/app/(app)/dashboard/service-day-picker";
import {
  type ConsolidatedRow,
  fetchConsolidatedDashboard,
  formatServiceDayLabel,
  parseServiceDayParam,
} from "@/lib/avon-dashboard";

type DashboardPageProps = {
  searchParams: Promise<{ date?: string }>;
};

function ConsolidatedTable({
  firstColLabel,
  rows,
  customers,
}: {
  firstColLabel: string;
  rows: ConsolidatedRow[];
  customers: string[];
}) {
  const colTotals = customers.map((c) =>
    rows.reduce((sum, r) => sum + (r.counts[c] ?? 0), 0),
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
                key={c}
                className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50"
              >
                {c}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={customers.length + 2}
                className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
              >
                No matched orders for this service day.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                  {row.label}
                </td>
                {customers.map((c) => (
                  <td
                    key={c}
                    className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300"
                  >
                    {row.counts[c] ?? 0}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {row.total}
                </td>
              </tr>
            ))
          )}
          {rows.length > 0 && (
            <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
              <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                Grand Total
              </td>
              {colTotals.map((t, i) => (
                <td
                  key={customers[i]}
                  className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-50"
                >
                  {t}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                {grand}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const serviceDay = parseServiceDayParam(params.date);
  const data = await fetchConsolidatedDashboard(serviceDay);

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Order management
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            All Orders
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {formatServiceDayLabel(serviceDay)} · {data.grandTotal} meals across{" "}
            {data.customers.length} customers
          </p>
        </header>

        <div className="mb-8">
          <label
            htmlFor="serviceDay"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Service day
          </label>
          <ServiceDayPicker serviceDay={serviceDay} />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Meals
        </h2>
        <ConsolidatedTable
          firstColLabel="Meal"
          rows={data.mealRows}
          customers={data.customers}
        />

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Proteins
        </h2>
        <ConsolidatedTable
          firstColLabel="Protein"
          rows={data.proteinRows}
          customers={data.customers}
        />

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Release
        </h2>
        <div className="space-y-4">
          {data.statuses.map((status) => (
            <div
              key={status.customer}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {status.customer}{" "}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                  · {status.total} meals
                </span>
              </p>
              <ReleaseControls
                customer={status.customer}
                serviceDay={serviceDay}
                openExceptionCount={status.openExceptionCount}
                releasedAt={status.releasedAt}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
