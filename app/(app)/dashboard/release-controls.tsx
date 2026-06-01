"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CustomerDashboardCard,
  CustomerStatus,
  PortionReadiness,
} from "@/lib/avon-dashboard";

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

// ─── Portion readiness indicator ─────────────────────────────────────────────

function PortionReadinessBlock({
  readiness,
  customerId,
}: {
  readiness: PortionReadiness;
  customerId: string;
}) {
  if (readiness.status === "ready") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <span>✓</span>
        <span>Portion profile ready</span>
      </div>
    );
  }

  const isMissing = readiness.status === "missing";

  return (
    <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2.5 dark:border-orange-900 dark:bg-orange-950/40">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-orange-800 dark:text-orange-300">
            {isMissing ? "Portion profile missing" : "Portion profile incomplete"}
          </p>
          {isMissing ? (
            <p className="text-xs text-orange-700 dark:text-orange-400">
              No active portion profile found for this customer. Release is
              blocked until a profile is activated.
            </p>
          ) : (
            <>
              <p className="text-xs text-orange-700 dark:text-orange-400">
                {readiness.unmappedCategories.length === 1
                  ? "1 meal category has"
                  : `${readiness.unmappedCategories.length} meal categories have`}{" "}
                no portion component mapping.
              </p>
              <p className="mt-0.5 font-mono text-xs text-orange-700 dark:text-orange-400">
                {readiness.unmappedCategories.join(", ")}
              </p>
            </>
          )}
        </div>
        <a
          href={`/customers/${customerId}`}
          className="shrink-0 text-xs font-medium text-orange-700 underline hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-200"
        >
          Fix →
        </a>
      </div>
    </div>
  );
}

// ─── Revoke reason options ────────────────────────────────────────────────────

const REVOKE_REASONS = [
  "Wrong upload released",
  "Exceptions discovered after release",
  "Customer correction received",
  "Duplicate upload issue",
  "Other",
] as const;

// ─── CustomerCard ─────────────────────────────────────────────────────────────

type CustomerCardProps = {
  card: CustomerDashboardCard;
  serviceDay: string;
  isSuperAdmin: boolean;
};

export function CustomerCard({
  card,
  serviceDay,
  isSuperAdmin,
}: CustomerCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accept-all-and-release state
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  // Revoke state
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReasonKey, setRevokeReasonKey] = useState<string>("");
  const [revokeReasonOther, setRevokeReasonOther] = useState<string>("");

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

  function handleRevokeConfirm() {
    const resolvedReason =
      revokeReasonKey === "Other" ? revokeReasonOther.trim() : revokeReasonKey;
    if (!resolvedReason) return;
    void send("revoke", { reason: resolvedReason }).then(() => {
      setShowRevokeConfirm(false);
      setRevokeReasonKey("");
      setRevokeReasonOther("");
    });
  }

  function handleRevokeCancel() {
    setShowRevokeConfirm(false);
    setRevokeReasonKey("");
    setRevokeReasonOther("");
    setError(null);
  }

  // Derive which issues are blocking release
  const hasOpenExceptions = card.openExceptionCount > 0;
  const hasUnmatched = card.unmatchedOrders > 0;
  const hasMissingProtein = card.missingProtein > 0;

  // "Accept all & release" is offered whenever open exceptions are the only
  // structural blocker.  Unmatched orders cannot be resolved this way, so we
  // exclude that case.  Missing protein IS handled: the route writes
  // "(No protein)" to every null-protein order_line as part of the bulk accept,
  // so hasMissingProtein no longer prevents this path.
  const canAcceptAllAndRelease = hasOpenExceptions && !hasUnmatched;

  const revokeReasonValid =
    revokeReasonKey !== "" &&
    (revokeReasonKey !== "Other" || revokeReasonOther.trim().length > 0);

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

      {/* ── Portion readiness — only shown for "ready" cards as a confirmation ──
           For "needs_work" the portion issue appears inline in the blocker list. */}
      {card.status === "ready" && (
        <div className="mb-4">
          <PortionReadinessBlock
            readiness={card.portionReadiness}
            customerId={card.customerId}
          />
        </div>
      )}

      {/* ── Released ── */}
      {card.status === "released" && (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
            Released on{" "}
            <span suppressHydrationWarning>
              {new Date(card.releasedAt!).toLocaleString()}
            </span>
          </div>

          {/* Revoke button — Super Admin only, hidden while confirm panel is open */}
          {isSuperAdmin && !showRevokeConfirm && (
            <div>
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(true)}
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Revoke Release…
              </button>
            </div>
          )}

          {/* Revoke confirmation panel */}
          {isSuperAdmin && showRevokeConfirm && (
            <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                Revoke release for {card.customerName}?
              </p>
              <p className="text-xs text-red-700 dark:text-red-400">
                This will reopen the released orders for correction. Production
                quantities or manifests generated from this release may need to
                be regenerated. Continue?
              </p>

              {/* Reason selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-red-800 dark:text-red-300">
                  Reason for revocation <span className="text-red-500">*</span>
                </label>
                <select
                  value={revokeReasonKey}
                  onChange={(e) => {
                    setRevokeReasonKey(e.target.value);
                    setRevokeReasonOther("");
                  }}
                  className="block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">— Select a reason —</option>
                  {REVOKE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {revokeReasonKey === "Other" && (
                  <input
                    type="text"
                    value={revokeReasonOther}
                    onChange={(e) => setRevokeReasonOther(e.target.value)}
                    placeholder="Describe the reason…"
                    className="block w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !revokeReasonValid}
                  onClick={handleRevokeConfirm}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Revoking…" : "Confirm revoke"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRevokeCancel}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Needs work ── */}
      {card.status === "needs_work" && (
        <div className="space-y-3">
          {/* ── Per-blocker list with inline action links ──────────────────────
               Each blocker row is a flex container: description on the left,
               a contextual action link on the right.  This keeps the release
               area visible at all times so users know exactly what to fix and
               where to go.                                                      */}
          <div className="divide-y divide-amber-100 rounded-md border border-amber-200 bg-amber-50 dark:divide-amber-900/60 dark:border-amber-900 dark:bg-amber-950/40">
            {hasUnmatched && (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{card.unmatchedOrders}</span>{" "}
                  unreconciled order{card.unmatchedOrders !== 1 ? "s" : ""} — all
                  orders must be matched to a menu item before release.
                </p>
              </div>
            )}
            {hasMissingProtein && (
              <div className="flex items-start justify-between gap-3 px-4 py-2.5">
                <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{card.missingProtein}</span>{" "}
                  order line{card.missingProtein !== 1 ? "s" : ""} missing
                  required protein — assign a protein to each before release.
                </p>
                <a
                  href={`/exceptions?customerId=${card.customerId}&date=${serviceDay}&type=protein`}
                  className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  Resolve Protein Issues →
                </a>
              </div>
            )}
            {hasOpenExceptions && (
              <div className="flex items-start justify-between gap-3 px-4 py-2.5">
                <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{card.openExceptionCount}</span>{" "}
                  open exception{card.openExceptionCount !== 1 ? "s" : ""} — resolve
                  or accept them before release.
                </p>
                <a
                  href={`/exceptions?customerId=${card.customerId}&date=${serviceDay}`}
                  className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  Review Exceptions →
                </a>
              </div>
            )}
            {card.portionReadiness.status !== "ready" && (
              <div className="flex items-start justify-between gap-3 px-4 py-2.5">
                <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Portion profile</span>{" "}
                  {card.portionReadiness.status === "missing"
                    ? "— no active profile found. Release is blocked until a profile is activated."
                    : `— ${card.portionReadiness.unmappedCategories.length} meal ${
                        card.portionReadiness.unmappedCategories.length === 1
                          ? "category"
                          : "categories"
                      } not mapped.`}
                  {card.portionReadiness.status === "incomplete" && (
                    <span className="ml-1 font-mono text-xs">
                      ({card.portionReadiness.unmappedCategories.join(", ")})
                    </span>
                  )}
                </p>
                <a
                  href={`/customers/${card.customerId}`}
                  className="shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  Edit Profile →
                </a>
              </div>
            )}
          </div>

          {/* ── Release action row ──────────────────────────────────────────────
               The disabled "Release Blocked" button is ALWAYS shown here so
               the user can see exactly where the release action lives even
               before all blockers are resolved.                                 */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              title="Resolve all blockers listed above to enable release"
              className="cursor-not-allowed rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-400 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-zinc-700"
            >
              Release Blocked
            </button>

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
