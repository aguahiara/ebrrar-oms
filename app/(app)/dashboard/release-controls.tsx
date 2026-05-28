"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerDashboardCard, CustomerStatus } from "@/lib/avon-dashboard";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CustomerStatus,
  { label: string; className: string }
> = {
  released: {
    label: "Released",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  ready: {
    label: "Ready for Release",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  },
  needs_work: {
    label: "Needs Reconciliation",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
};

function StatusBadge({ status }: { status: CustomerStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "warn" | "error";
}) {
  const valueClass =
    highlight === "error"
      ? "text-red-600 dark:text-red-400"
      : highlight === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

// ─── CustomerCard ─────────────────────────────────────────────────────────────

type CustomerCardProps = {
  card: CustomerDashboardCard;
  serviceDay: string;
};

export function CustomerCard({ card, serviceDay }: CustomerCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  async function send(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: card.customerName,
          serviceDay,
          action,
          ...extra,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Release failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusy(false);
    }
  }

  // Derive which issues are blocking release
  const hasOpenExceptions = card.openExceptionCount > 0;
  const hasUnmatched = card.unmatchedOrders > 0;
  const hasMissingProtein = card.missingProtein > 0;

  // "Accept all & release" is only offered when open exceptions are the SOLE
  // remaining blocker. Unmatched orders and missing protein can't be resolved
  // by accepting exceptions, so that path would still fail at the backend.
  const canAcceptAllAndRelease =
    hasOpenExceptions && !hasUnmatched && !hasMissingProtein;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {card.customerName}
        </h3>
        <StatusBadge status={card.status} />
      </div>

      {/* ── Stats ── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Uploaded" value={card.totalUploaded} />
        <Stat label="Matched" value={card.matchedOrders} />
        <Stat
          label="Unreconciled"
          value={card.unmatchedOrders}
          highlight={card.unmatchedOrders > 0 ? "warn" : undefined}
        />
        <Stat
          label="Exceptions"
          value={card.openExceptionCount}
          highlight={card.openExceptionCount > 0 ? "error" : undefined}
        />
        <Stat
          label="Missing Protein"
          value={card.missingProtein}
          highlight={card.missingProtein > 0 ? "warn" : undefined}
        />
      </div>

      {/* ── Released ── */}
      {card.status === "released" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
          Released on{" "}
          <span suppressHydrationWarning>
            {new Date(card.releasedAt!).toLocaleString()}
          </span>
        </div>
      )}

      {/* ── Needs work ── */}
      {card.status === "needs_work" && (
        <div className="space-y-3">
          {/* Per-blocker explanations */}
          <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            {hasUnmatched && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{card.unmatchedOrders}</span>{" "}
                unreconciled order{card.unmatchedOrders !== 1 ? "s" : ""} — all
                orders must be matched to a menu item before release.
              </p>
            )}
            {hasMissingProtein && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{card.missingProtein}</span>{" "}
                order line{card.missingProtein !== 1 ? "s" : ""} missing protein
                data — all orders must have a protein assigned before release.
              </p>
            )}
            {hasOpenExceptions && (
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{card.openExceptionCount}</span>{" "}
                open exception{card.openExceptionCount !== 1 ? "s" : ""} — resolve
                or accept them before release.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {hasOpenExceptions && (
              <a
                href={`/exceptions?customerId=${card.customerId}&date=${serviceDay}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
              >
                Review Exceptions
              </a>
            )}

            {canAcceptAllAndRelease && !showReason && (
              <button
                type="button"
                onClick={() => setShowReason(true)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Accept all &amp; release…
              </button>
            )}
          </div>

          {/* Accept-all reason form */}
          {showReason && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {card.openExceptionCount} open exception
                {card.openExceptionCount !== 1 ? "s" : ""} will be accepted
                as-is. Provide a reason:
              </p>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for accepting exceptions as-is"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    send("acceptAllAndRelease", { reason }).then(() => {
                      setShowReason(false);
                      setReason("");
                    })
                  }
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Releasing…" : "Confirm accept-all & release"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReason(false);
                    setReason("");
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ready ── */}
      {card.status === "ready" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => send("release")}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Releasing…" : "Release for Production"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
