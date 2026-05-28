"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PortionProfile, PortionProfileStatus } from "@/lib/portion-types";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "Draft", label: "Draft" },
  { value: "Active", label: "Active" },
  { value: "Superseded", label: "Superseded" },
  { value: "Inactive", label: "Inactive" },
];

function StatusBadge({ status }: { status: PortionProfileStatus }) {
  const styles: Record<PortionProfileStatus, string> = {
    Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    Superseded: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    Inactive: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.Draft}`}
    >
      {status}
    </span>
  );
}

export default function PortionProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<PortionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/portion-profiles?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load profiles.");
        return data;
      })
      .then((data) => {
        if (!alive) return;
        setProfiles(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load profiles.");
        setLoading(false);
      });

    return () => { alive = false; };
  }, [statusFilter, refreshKey]);

  const filtered = profiles.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.customer_name ?? "").toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    );
  });

  async function handleActivate(id: string, customerName: string) {
    if (
      !confirm(
        `Activate this profile for ${customerName}? The current Active profile (if any) will be Superseded.`,
      )
    )
      return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/portion-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Activation failed.");
      setActionSuccess("Profile activated.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Activation failed.");
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Mark this profile as Inactive?")) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/portion-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deactivation failed.");
      setActionSuccess("Profile marked Inactive.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Deactivation failed.");
    }
  }

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Kitchen planning
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              Portion Profiles
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/production-quantities"
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Production Quantities
            </Link>
            <Link
              href="/portion-profiles/new"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              New Profile
            </Link>
          </div>
        </header>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by customer or profile name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {actionError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {actionError}
          </p>
        )}
        {actionSuccess && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {actionSuccess}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                {[
                  "Customer",
                  "Profile Name",
                  "Status",
                  "Effective From",
                  "Effective To",
                  "Overage %",
                  "Last Updated",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-red-600 dark:text-red-400"
                  >
                    {error}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    {search || statusFilter
                      ? "No profiles match your filters."
                      : "No portion profiles yet. Create one to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {p.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{p.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status as PortionProfileStatus} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {p.effective_from}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {p.effective_to ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {p.default_overage_percentage ?? 0}%
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleDateString("en-NG")
                        : new Date(p.created_at).toLocaleDateString("en-NG")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/portion-profiles/${p.id}`)}
                          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        >
                          Edit
                        </button>
                        {p.status === "Draft" || p.status === "Superseded" ? (
                          <button
                            onClick={() =>
                              handleActivate(p.id, p.customer_name ?? "this customer")
                            }
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
                          >
                            Activate
                          </button>
                        ) : null}
                        {p.status === "Active" ? (
                          <button
                            onClick={() => handleDeactivate(p.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
