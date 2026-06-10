import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isCalendarDate, formatCalendarDateLabel } from "@/lib/calendar-date";
import {
  fetchCustomerDayOrders,
  type ReleaseStatus,
} from "@/lib/avon-customer-orders";
import { OrderTableClient } from "./order-table-client";

// ─── Page props ───────────────────────────────────────────────────────────────

type PageProps = {
  searchParams: Promise<{
    customerId?: string;
    serviceDay?: string;
    /** "dashboard" | "order-review" — controls back-button label */
    from?: string;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return formatCalendarDateLabel(iso);
  } catch {
    return iso;
  }
}

// ─── Release status badge ─────────────────────────────────────────────────────

function ReleaseStatusBadge({ status }: { status: ReleaseStatus }) {
  if (status.state === "released") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          Released for Production
        </span>
        <span suppressHydrationWarning className="text-xs text-zinc-500 dark:text-zinc-400">
          {new Date(status.releasedAt).toLocaleString()}
        </span>
      </div>
    );
  }
  if (status.state === "revoked") {
    return (
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
        Release Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
      Not Released
    </span>
  );
}

// ─── Summary totals ───────────────────────────────────────────────────────────

function TotalPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

// OrderTable is now the OrderTableClient component imported above.

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CustomerOrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { customerId, serviceDay, from } = params;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getAppSession();
  if (!session) {
    redirect("/login");
  }
  if (!hasPermission(session.selectedRole.role, "manage_orders")) {
    redirect("/unauthorized");
  }

  // ── Validate required params ─────────────────────────────────────────────
  if (!customerId || !serviceDay || !isCalendarDate(serviceDay)) {
    notFound();
  }

  // ── Fetch data ───────────────────────────────────────────────────────────
  let result;
  try {
    result = await fetchCustomerDayOrders(customerId, serviceDay);
  } catch {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <div className="text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Failed to load order data. Please try again.
          </p>
          <Link
            href={from === "dashboard" ? `/production/daily-dashboard?date=${serviceDay}` : `/dashboard?date=${serviceDay}`}
            className="mt-4 inline-block text-sm text-zinc-500 underline"
          >
            {from === "dashboard" ? "Back to Dashboard" : "Back to Order Review"}
          </Link>
        </div>
      </div>
    );
  }

  if (!result) {
    notFound();
  }

  // ── Back navigation ───────────────────────────────────────────────────────
  // "dashboard" = /production/daily-dashboard; "order-review" = /dashboard
  const backHref =
    from === "dashboard"
      ? `/production/daily-dashboard?date=${serviceDay}`
      : `/dashboard?date=${serviceDay}`;
  const backLabel =
    from === "order-review"
      ? "Back to Order Review"
      : from === "dashboard"
        ? "Back to Dashboard"
        : "Back";

  const isReleased = result.releaseStatus.state === "released";
  const canManageOrders = hasPermission(session.selectedRole.role, "manage_orders");

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-6xl">
        {/* ── Back link ── */}
        <div className="mb-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {backLabel}
          </Link>
        </div>

        {/* ── Page header ── */}
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Daily Customer Order Details
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {result.customerName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-base text-zinc-600 dark:text-zinc-400">
              {formatDate(serviceDay)}
            </span>
            <ReleaseStatusBadge status={result.releaseStatus} />
          </div>
        </header>

        {/* ── Summary totals ── */}
        {result.lineCount > 0 ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TotalPill label="Order Lines" value={result.lineCount} />
              <TotalPill label="Total Meals" value={result.totalQuantity} />
              <TotalPill label="Protein Types" value={result.proteinTotals.length} />
              <TotalPill label="Swallow Types" value={result.swallowTotals.length} />
            </div>

            {/* Protein breakdown */}
            {result.proteinTotals.length > 0 && (
              <div className="mb-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Protein Totals
                </h2>
                <div className="flex flex-wrap gap-2">
                  {result.proteinTotals.map(({ protein, total }) => (
                    <span
                      key={protein}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{protein}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{total}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Swallow breakdown */}
            {result.swallowTotals.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Swallow Totals
                </h2>
                <div className="flex flex-wrap gap-2">
                  {result.swallowTotals.map(({ swallow, total }) => (
                    <span
                      key={swallow}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{swallow}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{total}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Order table ── */}
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              All Orders
            </h2>
            <OrderTableClient
              initialLines={result.lines}
              initialBatches={result.batches}
              editableBatchIds={result.editableBatchIds}
              isReleased={isReleased}
              canManageOrders={canManageOrders}
              customerName={result.customerName}
              serviceDay={serviceDay}
            />
          </>
        ) : (
          /* ── Empty state ── */
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No orders found for this customer and service day.
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Orders appear here once they have been uploaded or manually entered.
            </p>
            <Link
              href={backHref}
              className="mt-6 inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {backLabel}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
