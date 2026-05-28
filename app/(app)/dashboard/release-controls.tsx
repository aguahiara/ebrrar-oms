"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReleaseControlsProps = {
  customer: string;
  serviceDay: string;
  openExceptionCount: number;
  releasedAt: string | null;
};

export function ReleaseControls({
  customer,
  serviceDay,
  openExceptionCount,
  releasedAt,
}: ReleaseControlsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  async function send(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, serviceDay, action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Release failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusy(false);
    }
  }

  if (releasedAt) {
    return (
      <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        Released on{" "}
        <span suppressHydrationWarning>
          {new Date(releasedAt).toLocaleString()}
        </span>
        .
      </div>
    );
  }

  if (openExceptionCount > 0) {
    return (
      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
        <p className="text-amber-800 dark:text-amber-300">
          {openExceptionCount} open exception
          {openExceptionCount === 1 ? "" : "s"} must be resolved before this day
          can be released.{" "}
          <a
            href={`/exceptions?date=${serviceDay}`}
            className="underline hover:text-amber-900 dark:hover:text-amber-200"
          >
            Go to exceptions
          </a>
          .
        </p>

        {!showReason ? (
          <button
            type="button"
            onClick={() => setShowReason(true)}
            className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
          >
            Accept all as-is &amp; release…
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for accepting open exceptions as-is"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() =>
                send("acceptAllAndRelease", { reason }).then(() =>
                  setShowReason(false),
                )
              }
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Releasing…" : "Confirm accept-all & release"}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={busy}
        onClick={() => send("release")}
        className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Releasing…" : "Release dashboard"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
