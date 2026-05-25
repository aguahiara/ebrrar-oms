"use client";

import {
  fetchAvonMenuItemsForServiceDay,
  fetchOpenExceptions,
  type OpenOrderException,
} from "@/lib/avon-exceptions";
import { DEFAULT_SERVICE_DAY, formatServiceDayLabel } from "@/lib/avon-dashboard";
import type { AvonMenuItem } from "@/lib/avon-menu";
import { useCallback, useEffect, useState } from "react";

type ResolveAction = "map" | "drop" | "accept";

function scorePercent(score: number | null): string | null {
  if (score === null) {
    return null;
  }
  return `${Math.round(score * 100)}%`;
}

export default function ExceptionsPage() {
  const [serviceDay, setServiceDay] = useState(DEFAULT_SERVICE_DAY);
  const [exceptions, setExceptions] = useState<OpenOrderException[]>([]);
  const [menuItems, setMenuItems] = useState<AvonMenuItem[]>([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<
    Record<string, string>
  >({});
  const [saveAsAlias, setSaveAsAlias] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadData = useCallback(async (day: string) => {
    setLoading(true);
    setError(null);

    try {
      const [openExceptions, dayMenuItems] = await Promise.all([
        fetchOpenExceptions(day),
        fetchAvonMenuItemsForServiceDay(day),
      ]);

      setExceptions(openExceptions);
      setMenuItems(dayMenuItems);

      const initialSelection: Record<string, string> = {};
      for (const ex of openExceptions) {
        if (ex.suggested_item_id) {
          initialSelection[ex.id] = ex.suggested_item_id;
        } else if (dayMenuItems[0]) {
          initialSelection[ex.id] = dayMenuItems[0].id;
        }
      }
      setSelectedMenuItemId(initialSelection);
      setSaveAsAlias({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exceptions.");
      setExceptions([]);
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(serviceDay);
  }, [serviceDay, loadData]);

  async function handleResolve(
    exception: OpenOrderException,
    action: ResolveAction,
  ) {
    setResolvingId(exception.id);
    setError(null);

    try {
      const response = await fetch("/api/exceptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId: exception.id,
          action,
          menuItemId:
            action === "map" ? selectedMenuItemId[exception.id] : undefined,
          saveAsAlias: action === "map" ? (saveAsAlias[exception.id] ?? false) : false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to resolve exception.");
      }

      setExceptions((current) => current.filter((row) => row.id !== exception.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve exception.");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Order management
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            AVON Exceptions
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            {formatServiceDayLabel(serviceDay)}
          </p>
        </header>

        <div className="mb-8">
          <label
            htmlFor="serviceDay"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Service day
          </label>
          <input
            id="serviceDay"
            type="date"
            value={serviceDay}
            onChange={(event) => {
              const date = event.target.value;
              if (date) {
                setServiceDay(date);
              }
            }}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : exceptions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No open exceptions for this service day.
          </p>
        ) : (
          <ul className="space-y-4">
            {exceptions.map((exception) => {
              const suggestedPct = scorePercent(exception.suggested_score);
              const isResolving = resolvingId === exception.id;

              return (
                <li
                  key={exception.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {exception.employee_ref}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      Raw: &quot;{exception.raw_value}&quot;
                    </p>
                    {exception.suggested_item_id && (
                      <p className="text-zinc-600 dark:text-zinc-400">
                        Suggested:{" "}
                        <span className="text-zinc-900 dark:text-zinc-50">
                          {exception.suggested_canonical_name ?? "Unknown item"}
                        </span>
                        {suggestedPct && (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {" "}
                            ({suggestedPct})
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor={`menu-${exception.id}`}
                      className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Map to menu item
                    </label>
                    <select
                      id={`menu-${exception.id}`}
                      value={selectedMenuItemId[exception.id] ?? ""}
                      onChange={(event) =>
                        setSelectedMenuItemId((current) => ({
                          ...current,
                          [exception.id]: event.target.value,
                        }))
                      }
                      disabled={menuItems.length === 0 || isResolving}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    >
                      {menuItems.length === 0 ? (
                        <option value="">No menu items for this day</option>
                      ) : (
                        menuItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.canonical_name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={saveAsAlias[exception.id] ?? false}
                      onChange={(event) =>
                        setSaveAsAlias((current) => ({
                          ...current,
                          [exception.id]: event.target.checked,
                        }))
                      }
                      disabled={isResolving}
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                    Save as alias
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isResolving || !selectedMenuItemId[exception.id]}
                      onClick={() => handleResolve(exception, "map")}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Map
                    </button>
                    <button
                      type="button"
                      disabled={isResolving}
                      onClick={() => handleResolve(exception, "drop")}
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
                    >
                      Drop
                    </button>
                    <button
                      type="button"
                      disabled={isResolving}
                      onClick={() => handleResolve(exception, "accept")}
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
                    >
                      Accept as-is
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
