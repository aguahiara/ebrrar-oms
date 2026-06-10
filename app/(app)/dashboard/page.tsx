import Link from "next/link";
import { CustomerCard } from "@/app/(app)/dashboard/release-controls";
import { ServiceDayPicker } from "@/app/(app)/dashboard/service-day-picker";
import { getAppSession } from "@/lib/auth";
import {
  type ConsolidatedRow,
  type CustomerRef,
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
  serviceDay,
  from,
}: {
  firstColLabel: string;
  rows: ConsolidatedRow[];
  customers: CustomerRef[];
  serviceDay: string;
  from: string;
}) {
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
                  href={`/dashboard/customer-orders?customerId=${c.id}&serviceDay=${serviceDay}&from=${from}`}
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
            ))
          )}
          {rows.length > 0 && (
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
          )}
        </tbody>
      </table>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const serviceDay = parseServiceDayParam(params.date);
  const [data, session] = await Promise.all([
    fetchConsolidatedDashboard(serviceDay),
    getAppSession(),
  ]);
  const isSuperAdmin = session?.selectedRole.role === "ebrrar_super_admin";

  const hasOrders = data.cards.length > 0;

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Production dashboard
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Order Review
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {formatServiceDayLabel(serviceDay)}
            {hasOrders && (
              <>
                {" "}
                &middot; {data.grandTotal} reconciled meal
                {data.grandTotal !== 1 ? "s" : ""} across {data.customers.length}{" "}
                customer{data.customers.length !== 1 ? "s" : ""}
              </>
            )}
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

        {/* ── No orders empty state ── */}
        {!hasOrders && (
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {data.unresolvedExceptionsOnly ? (
              <>
                <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
                  Orders uploaded — awaiting exception resolution.
                </p>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  All uploaded orders are still in exception status. Map, drop,
                  or accept each exception on the Exceptions page; reconciled
                  orders will then appear here.
                </p>
                <Link
                  href={`/exceptions?date=${serviceDay}`}
                  className="mt-6 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
                >
                  Resolve Exceptions →
                </Link>
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No orders have been uploaded for this service day.
              </p>
            )}
          </div>
        )}

        {/* ── Customer status cards ── */}
        {hasOrders && (
          <>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Customer Status
            </h2>
            <div className="mb-8 space-y-4">
              {data.cards.map((card) => (
                <CustomerCard
                  key={card.customerId}
                  card={card}
                  serviceDay={serviceDay}
                  isSuperAdmin={isSuperAdmin}
                />
              ))}
            </div>

            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Meals
            </h2>
            <ConsolidatedTable
              firstColLabel="Meal"
              rows={data.mealRows}
              customers={data.customers}
              serviceDay={serviceDay}
              from="order-review"
            />

            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Proteins
            </h2>
            <ConsolidatedTable
              firstColLabel="Protein"
              rows={data.proteinRows}
              customers={data.customers}
              serviceDay={serviceDay}
              from="order-review"
            />
          </>
        )}
      </main>
    </div>
  );
}
