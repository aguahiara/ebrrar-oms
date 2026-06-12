"use client";

import { useEffect, useState } from "react";
import type { UserProfile, RoleAssignment } from "@/lib/auth-types";
import { ROLE_LABELS } from "@/lib/permissions";

type ProfileWithRoles = UserProfile & { roles?: RoleAssignment[] };

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) throw new Error(`Empty response (HTTP ${res.status}).`);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!res.ok && "error" in parsed) throw new Error(parsed.error as string);
    return parsed as T;
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`);
    throw e;
  }
}

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  inactive:  "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  invited:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    fetch(`/api/admin/users?${params}`)
      .then(safeJson<ProfileWithRoles[]>)
      .then((data) => {
        if (!alive) return;
        setProfiles(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setProfiles([]);
        setLoading(false);
      });

    return () => { alive = false; };
  }, [refreshKey, search]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Users &amp; Roles
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage user profiles and role assignments.
          </p>
        </div>
        <a
          href="/admin/invitations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
        >
          + Invite user
        </a>
      </div>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setRefreshKey((k) => k + 1); }}
          placeholder="Search by name or email…"
          className="w-full max-w-sm px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Roles</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">
                  Loading…
                </td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">
                  {search ? "No users match your search." : "No users found."}
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <UserRow
                  key={p.id}
                  profile={p}
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({
  profile,
  onRefresh,
}: {
  profile: ProfileWithRoles;
  onRefresh: () => void;
}) {
  const [actionSaving, setActionSaving] = useState(false);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  const statusClass =
    STATUS_BADGE[profile.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";

  async function quickAction(action: string) {
    setActionSaving(true);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await safeJson<{ ok: boolean }>(res);
      onRefresh();
    } catch (err) {
      setRowMsg(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionSaving(false);
    }
  }

  return (
    <>
      <tr className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
          <a
            href={`/admin/users/${profile.id}`}
            className="hover:text-emerald-600 dark:hover:text-emerald-400 transition"
          >
            {profile.full_name}
          </a>
        </td>
        <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
          {profile.email}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${statusClass}`}>
            {profile.status}
          </span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell text-zinc-500">
          {profile.roles?.filter((r) => r.active).map((r) => ROLE_LABELS[r.role]).join(", ") || "—"}
        </td>
        <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell text-xs">
          {new Date(profile.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {profile.status === "active" && (
              <button
                onClick={() => quickAction("suspend")}
                disabled={actionSaving}
                title="Suspend"
                className="px-2.5 py-1 rounded text-xs font-medium border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition"
              >
                Suspend
              </button>
            )}
            {(profile.status === "suspended" || profile.status === "inactive") && (
              <button
                onClick={() => quickAction("reactivate")}
                disabled={actionSaving}
                title="Reactivate"
                className="px-2.5 py-1 rounded text-xs font-medium border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50 transition"
              >
                Reactivate
              </button>
            )}
            <a
              href={`/admin/users/${profile.id}`}
              className="px-2.5 py-1 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              Manage →
            </a>
          </div>
        </td>
      </tr>
      {rowMsg && (
        <tr className="border-b border-zinc-100 dark:border-zinc-800">
          <td colSpan={6} className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
            {rowMsg}
          </td>
        </tr>
      )}
    </>
  );
}
