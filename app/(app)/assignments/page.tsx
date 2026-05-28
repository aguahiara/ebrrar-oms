"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  day_of_week: string;
  canonical_name: string;
  option_label: string | null;
};

type AssignmentState = {
  publishedVersionId: string;
  assignedToPublished: boolean;
  items: Item[];
  availableItemIds: string[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export default function AssignmentsPage() {
  const [customer, setCustomer] = useState("AVON");
  const [customers, setCustomers] = useState<string[]>([]);
  const [state, setState] = useState<AssignmentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/assignments?customer=${encodeURIComponent(customer)}`)
      .then((r) => r.json())
      .then((data: AssignmentState & { error?: string }) => {
        if (!alive) return;
        if (data.error) {
          setError(data.error);
          setState(null);
        } else {
          setError(null);
          setState(data);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load.");
        setState(null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [customer, refreshKey]);

  useEffect(() => {
    let alive = true;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d: { customers?: string[] }) => {
        if (!alive) return;
        const list = d.customers ?? [];
        setCustomers(list);
        setCustomer((c) => (list.includes(c) ? c : (list[0] ?? c)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function handleAssign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", customer }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Assign failed.");
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(menuItemId: string, available: boolean) {
    // Optimistic update; revert from the server if the request fails.
    setState((prev) =>
      prev
        ? {
            ...prev,
            availableItemIds: available
              ? [...prev.availableItemIds, menuItemId]
              : prev.availableItemIds.filter((id) => id !== menuItemId),
          }
        : prev,
    );
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", customer, menuItemId, available }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Toggle failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed.");
      setRefreshKey((k) => k + 1);
    }
  }

  const availableSet = new Set(state?.availableItemIds ?? []);
  const availableCount = state
    ? state.items.filter((it) => availableSet.has(it.id)).length
    : 0;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Menu Assignment &amp; Availability
        </h1>

        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label
            htmlFor="customer"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Customer
          </label>
          <select
            id="customer"
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        )}

        {state && !loading && !state.assignedToPublished && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950">
            <p className="mb-3 text-amber-800 dark:text-amber-300">
              {customer} is not assigned to the current published menu. Assigning
              will point them at it and make all options available; you can then
              switch individual options off.
            </p>
            <button
              type="button"
              onClick={handleAssign}
              disabled={busy}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {busy ? "Assigning…" : "Assign to published menu"}
            </button>
          </div>
        )}

        {state && !loading && state.assignedToPublished && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {customer} is on the published menu —{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {availableCount} of {state.items.length}
                </span>{" "}
                options available.
              </p>
              <button
                type="button"
                onClick={handleAssign}
                disabled={busy}
                className="text-sm text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-50"
              >
                {busy ? "Resetting…" : "Reset to all options"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((day) => {
                const dayItems = state.items
                  .filter((it) => it.day_of_week === day)
                  .sort((a, b) =>
                    (a.option_label ?? "").localeCompare(b.option_label ?? ""),
                  );

                return (
                  <div
                    key={day}
                    className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">
                      {day}
                    </h2>
                    <ul className="space-y-2">
                      {dayItems.map((item) => {
                        const checked = availableSet.has(item.id);
                        return (
                          <li key={item.id}>
                            <label className="flex cursor-pointer items-start gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  handleToggle(item.id, e.target.checked)
                                }
                                className="mt-0.5"
                              />
                              <span
                                className={
                                  checked
                                    ? "text-zinc-700 dark:text-zinc-300"
                                    : "text-zinc-400 line-through dark:text-zinc-600"
                                }
                              >
                                {item.option_label
                                  ? `${item.option_label}: `
                                  : ""}
                                {item.canonical_name}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
