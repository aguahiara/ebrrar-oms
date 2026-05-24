import { ServiceDayPicker } from "@/app/dashboard/service-day-picker";
import {
  fetchAvonDashboard,
  formatServiceDayLabel,
  parseServiceDayParam,
} from "@/lib/avon-dashboard";

type DashboardPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const serviceDay = parseServiceDayParam(params.date);
  const dashboard = await fetchAvonDashboard(serviceDay);

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-2xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Order management
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            {dashboard.customerName}
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {formatServiceDayLabel(dashboard.serviceDay)}
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

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50">
                  Meal
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {dashboard.mealCounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No matched orders for this service day.
                  </td>
                </tr>
              ) : (
                dashboard.mealCounts.map((row) => (
                  <tr
                    key={row.meal}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {row.meal}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {row.total}
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-50">
                  {dashboard.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {dashboard.unmatchedCount > 0 && (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-300">
            Unmatched lines (no menu item):{" "}
            <span className="font-semibold tabular-nums">
              {dashboard.unmatchedCount}
            </span>
          </p>
        )}
      </main>
    </div>
  );
}
