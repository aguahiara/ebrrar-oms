"use client";

import { useEffect, useState } from "react";
import type { UserProfile, RoleAssignment } from "@/lib/auth-types";
import { ROLE_LABELS } from "@/lib/permissions";

type ProfileWithRoles = UserProfile & { roles?: RoleAssignment[] };

// ─── Safe JSON parsing ────────────────────────────────────────────────────────
// response.json() on an empty body (e.g. a 307 redirect with no body) or on an
// HTML page (e.g. the /login page after a mis-routed redirect) throws
// "Unexpected end of JSON input" or "Unexpected token '<'".
// safeJson reads the body as text first so we always get a useful error.

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Server returned an empty response (HTTP ${res.status}).`);
  }
  try {
    const parsed = JSON.parse(text) as T;
    // Surface server-side error messages so they appear in the UI
    if (
      !res.ok &&
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in (parsed as object)
    ) {
      throw new Error((parsed as unknown as { error: string }).error);
    }
    return parsed;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Body was not JSON — likely an HTML error page
      throw new Error(
        `Server returned a non-JSON response (HTTP ${res.status}). ` +
          `First 120 chars: ${text.slice(0, 120)}`,
      );
    }
    throw e;
  }
}

// ─── Status badge styles ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  inactive:
    "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  invited:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  suspended:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    fetch(`/api/admin/users?${params}`)
      .then(safeJson<ProfileWithRoles[]>)
      .then((data) => {
        if (!alive) return;
        // Guard against a non-array (e.g. { error: "..." } on auth failure)
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

    return () => {
      alive = false;
    };
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLoading(true);
          }}
          placeholder="Search by name or email…"
          className="w-full max-w-sm px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Roles</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-400 text-sm"
                >
                  Loading…
                </td>
              </tr>
            ) : profiles.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-400 text-sm"
                >
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

// ─── Row component ────────────────────────────────────────────────────────────

function UserRow({
  profile,
  onRefresh,
}: {
  profile: ProfileWithRoles;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ProfileWithRoles | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  function toggleExpand() {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      setDetailError(null);
      fetch(`/api/admin/users/${profile.id}`)
        .then(safeJson<ProfileWithRoles>)
        .then((data) => {
          setDetail(data);
          setLoadingDetail(false);
        })
        .catch((err: unknown) => {
          setDetailError(
            err instanceof Error ? err.message : "Failed to load details.",
          );
          setLoadingDetail(false);
        });
    }
    setExpanded((v) => !v);
  }

  const statusClass =
    STATUS_BADGE[profile.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";

  return (
    <>
      <tr
        className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
        onClick={toggleExpand}
      >
        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
          {profile.full_name}
        </td>
        <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
          {profile.email}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${statusClass}`}
          >
            {profile.status}
          </span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell text-zinc-500">
          {profile.roles?.length
            ? profile.roles.map((r) => ROLE_LABELS[r.role]).join(", ")
            : "—"}
        </td>
        <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell text-xs">
          {new Date(profile.created_at).toLocaleDateString()}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800">
          <td colSpan={5} className="px-6 py-4">
            {loadingDetail ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : detailError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {detailError}
              </p>
            ) : (
              <UserDetail
                profile={detail ?? profile}
                onUpdate={() => {
                  setDetail(null);
                  onRefresh();
                }}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Detail / edit panel ──────────────────────────────────────────────────────

function UserDetail({
  profile,
  onUpdate,
}: {
  profile: ProfileWithRoles;
  onUpdate: () => void;
}) {
  const [status, setStatus] = useState(profile.status);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // safeJson also throws on non-2xx with a JSON { error } body
      await safeJson<UserProfile>(res);
      setStatus(newStatus as UserProfile["status"]);
      setMsg("Saved.");
      onUpdate();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRole(roleId: string) {
    try {
      const res = await fetch(`/api/admin/users/${profile.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate_role",
          role_assignment_id: roleId,
        }),
      });
      await safeJson<{ ok: boolean }>(res);
      onUpdate();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to deactivate role.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6">
        {/* Profile info */}
        <div>
          <p className="text-xs text-zinc-500 mb-1">Email</p>
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            {profile.email}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Phone</p>
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            {profile.phone ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Status</p>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={saving}
            className="text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {msg && (
        <p
          className={`text-xs ${msg === "Saved." ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {msg}
        </p>
      )}

      {/* Roles */}
      {profile.roles && profile.roles.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Role assignments</p>
          <div className="flex flex-wrap gap-2">
            {profile.roles.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs"
              >
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {ROLE_LABELS[r.role]}
                </span>
                {r.customer_name && (
                  <span className="text-zinc-400">— {r.customer_name}</span>
                )}
                <span
                  className={`px-1.5 py-0.5 rounded text-xs font-medium border ${
                    r.active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                      : "bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700"
                  }`}
                >
                  {r.active ? "Active" : "Inactive"}
                </span>
                {r.active && (
                  <button
                    onClick={() => deactivateRole(r.id)}
                    className="text-red-500 hover:text-red-700 text-xs ml-1"
                    title="Deactivate"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
