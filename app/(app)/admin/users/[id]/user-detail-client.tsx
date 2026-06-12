"use client";

import { useState, useEffect } from "react";
import type { UserProfile, RoleAssignment, UserRole, AuditEvent } from "@/lib/auth-types";
import { ROLE_LABELS } from "@/lib/permissions";

type ProfileWithRoles = UserProfile & { roles: RoleAssignment[] };

const ALL_ROLES: UserRole[] = [
  "ebrrar_super_admin",
  "ebrrar_operations_admin",
  "kitchen_operations",
  "corporate_admin",
  "corporate_employee",
  "management_viewer",
];

const STATUS_BADGE: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  inactive:  "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  invited:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) throw new Error(`Empty response (HTTP ${res.status}).`);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!res.ok && "error" in parsed) throw new Error(parsed.error as string);
  return parsed as T;
}

type Customer = { id: string; display_name: string };

export default function UserDetailClient({
  user: initial,
  actorId,
}: {
  user: ProfileWithRoles;
  actorId: string;
}) {
  const [user, setUser] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function flash(type: "ok" | "err", text: string) {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  }

  async function reload() {
    const res = await fetch(`/api/admin/users/${user.id}`);
    const data = await safeJson<ProfileWithRoles>(res);
    setUser(data);
  }

  async function postAction(action: string, extra?: Record<string, unknown>) {
    setSaving(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      await safeJson<{ ok: boolean }>(res);
      await reload();
      flash("ok", "Done.");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  const isSelf = actorId === user.auth_user_id;

  // ── Status action buttons ─────────────────────────────────────────────────

  function StatusActions() {
    const [confirmAction, setConfirmAction] = useState<string | null>(null);

    if (user.status === "active") {
      return (
        <div className="flex flex-wrap gap-2">
          {confirmAction === "suspend" ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-300 self-center">
                Suspend this user?
              </span>
              <button
                onClick={() => { postAction("suspend"); setConfirmAction(null); }}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium disabled:opacity-50 transition"
              >
                Yes, suspend
              </button>
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Cancel
              </button>
            </>
          ) : confirmAction === "deactivate" ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-300 self-center">
                Permanently deactivate? All roles will be removed.
              </span>
              <button
                onClick={() => { postAction("deactivate"); setConfirmAction(null); }}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 transition"
              >
                Yes, deactivate
              </button>
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmAction("suspend")}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition"
              >
                Suspend
              </button>
              <button
                onClick={() => setConfirmAction("deactivate")}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 dark:border-red-700 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition"
              >
                Deactivate
              </button>
            </>
          )}
        </div>
      );
    }

    if (user.status === "suspended" || user.status === "inactive") {
      return (
        <button
          onClick={() => postAction("reactivate")}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50 transition"
        >
          Reactivate
        </button>
      );
    }

    return null;
  }

  // ── Profile edit section ──────────────────────────────────────────────────

  function ProfileSection() {
    const [editing, setEditing] = useState(false);
    const [fullName, setFullName] = useState(user.full_name);
    const [phone, setPhone] = useState(user.phone ?? "");
    const [editSaving, setEditSaving] = useState(false);

    async function save() {
      setEditSaving(true);
      try {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName, phone: phone || null }),
        });
        await safeJson<UserProfile>(res);
        await reload();
        setEditing(false);
        flash("ok", "Profile updated.");
      } catch (err) {
        flash("err", err instanceof Error ? err.message : "Failed to save.");
      } finally {
        setEditSaving(false);
      }
    }

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Profile</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-emerald-600 hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={editSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Email</dt>
              <dd className="text-zinc-900 dark:text-zinc-100 font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Full name</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{user.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Phone</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{user.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Status</dt>
              <dd>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${STATUS_BADGE[user.status] ?? ""}`}>
                  {user.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Member since</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {new Date(user.created_at).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Last login</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "—"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    );
  }

  // ── Role assignments section ───────────────────────────────────────────────

  function RolesSection() {
    const [addingRole, setAddingRole] = useState(false);
    const [newRole, setNewRole] = useState<UserRole>("corporate_employee");
    const [newCustomerId, setNewCustomerId] = useState("");
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [roleSaving, setRoleSaving] = useState(false);

    const needsCustomer = newRole === "corporate_admin" || newRole === "corporate_employee";

    useEffect(() => {
      if (addingRole && needsCustomer && customers.length === 0) {
        fetch("/api/customers/full")
          .then((r) => r.json())
          .then(setCustomers)
          .catch(() => {});
      }
    }, [addingRole, needsCustomer, customers.length]);

    async function addRole() {
      setRoleSaving(true);
      try {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "assign_role",
            role_input: {
              role: newRole,
              customer_id: needsCustomer && newCustomerId ? newCustomerId : null,
              is_default: user.roles.filter((r) => r.active).length === 0,
            },
          }),
        });
        await safeJson(res);
        await reload();
        setAddingRole(false);
        setNewRole("corporate_employee");
        setNewCustomerId("");
        flash("ok", "Role assigned.");
      } catch (err) {
        flash("err", err instanceof Error ? err.message : "Failed to assign role.");
      } finally {
        setRoleSaving(false);
      }
    }

    async function deactivate(roleId: string) {
      await postAction("deactivate_role", { role_assignment_id: roleId });
    }

    async function setDefault(roleId: string) {
      await postAction("set_default_role", { role_assignment_id: roleId });
    }

    const activeRoles = user.roles.filter((r) => r.active);
    const inactiveRoles = user.roles.filter((r) => !r.active);

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Role assignments</h2>
          <button
            onClick={() => setAddingRole((v) => !v)}
            className="text-xs text-emerald-600 hover:underline"
          >
            {addingRole ? "Cancel" : "+ Add role"}
          </button>
        </div>

        {/* Add role form */}
        {addingRole && (
          <div className="mb-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => { setNewRole(e.target.value as UserRole); setNewCustomerId(""); }}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            {needsCustomer && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Customer <span className="text-red-500">*</span></label>
                <select
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={addRole}
              disabled={roleSaving || (needsCustomer && !newCustomerId)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {roleSaving ? "Assigning…" : "Assign role"}
            </button>
          </div>
        )}

        {/* Active roles */}
        {activeRoles.length === 0 && !addingRole && (
          <p className="text-sm text-zinc-400 mb-3">No active roles.</p>
        )}
        <div className="space-y-2">
          {activeRoles.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {ROLE_LABELS[r.role]}
                </span>
                {r.customer_name && (
                  <span className="text-xs text-zinc-400">— {r.customer_name}</span>
                )}
                {r.is_default && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!r.is_default && (
                  <button
                    onClick={() => setDefault(r.id)}
                    disabled={saving}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-50"
                    title="Set as default"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => deactivate(r.id)}
                  disabled={saving}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                  title="Deactivate role"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Inactive roles (collapsed) */}
        {inactiveRoles.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-200">
              {inactiveRoles.length} inactive role{inactiveRoles.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1.5">
              {inactiveRoles.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-400 line-through">
                  {ROLE_LABELS[r.role]}
                  {r.customer_name && <span>— {r.customer_name}</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  // ── Actions section ───────────────────────────────────────────────────────

  function ActionsSection() {
    const [resetConfirm, setResetConfirm] = useState(false);
    const [resetSaving, setResetSaving] = useState(false);

    async function sendReset() {
      setResetSaving(true);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
        await safeJson<{ ok: boolean }>(res);
        setResetConfirm(false);
        flash("ok", "Password reset email sent.");
      } catch (err) {
        flash("err", err instanceof Error ? err.message : "Failed to send reset email.");
      } finally {
        setResetSaving(false);
      }
    }

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Actions</h2>

        <div className="space-y-4">
          {/* Account status */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Account status</p>
            <StatusActions />
            {isSelf && (
              <p className="text-xs text-zinc-400 mt-2">
                You are viewing your own account. Destructive actions require another active Super Admin to exist.
              </p>
            )}
          </div>

          {/* Password reset */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Password reset</p>
            {resetConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-300">
                  Send reset email to {user.email}?
                </span>
                <button
                  onClick={sendReset}
                  disabled={resetSaving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60"
                >
                  {resetSaving ? "Sending…" : "Send"}
                </button>
                <button onClick={() => setResetConfirm(false)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetConfirm(true)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                Send password reset email
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Audit history section ──────────────────────────────────────────────────

  function AuditSection() {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);

    useEffect(() => {
      setLoading(true);
      fetch(`/api/admin/audit?targetId=${user.id}&page=${page}&pageSize=20`)
        .then((r) => r.json())
        .then((data: { events: AuditEvent[]; total: number }) => {
          setEvents(data.events ?? []);
          setTotal(data.total ?? 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, [page]);

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          Audit history
          {total > 0 && <span className="ml-1 text-zinc-400 font-normal">({total})</span>}
        </h2>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-400">No audit events for this user.</p>
        ) : (
          <>
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3 text-xs">
                  <span className="text-zinc-400 shrink-0 pt-0.5 tabular-nums">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                    {e.event_type}
                  </span>
                  {e.actor_role && (
                    <span className="text-zinc-400">by {e.actor_role}</span>
                  )}
                </div>
              ))}
            </div>
            {total > 20 && (
              <div className="flex items-center gap-3 mt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-xs text-emerald-600 hover:underline disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs text-zinc-400">
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  disabled={page >= Math.ceil(total / 20)}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs text-emerald-600 hover:underline disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <a href="/admin/users" className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          ← Users &amp; Roles
        </a>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">{user.full_name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {user.full_name}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">{user.email}</p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium border capitalize ${STATUS_BADGE[user.status] ?? ""}`}>
          {user.status}
        </span>
      </div>

      {/* Global feedback message */}
      {actionMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          actionMsg.type === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400"
            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400"
        }`}>
          {actionMsg.text}
        </div>
      )}

      <ProfileSection />
      <RolesSection />
      <ActionsSection />
      <AuditSection />
    </div>
  );
}
