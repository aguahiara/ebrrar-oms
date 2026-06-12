"use client";

import { useEffect, useState } from "react";
import type { UserInvitation, UserRole } from "@/lib/auth-types";
import { ROLE_LABELS } from "@/lib/permissions";

type InvitationRow = UserInvitation & { customer_name?: string };

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  accepted:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  expired:   "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  cancelled: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

const ALL_ROLES: UserRole[] = [
  "ebrrar_super_admin",
  "ebrrar_operations_admin",
  "kitchen_operations",
  "corporate_admin",
  "corporate_employee",
  "management_viewer",
];

type Customer = { id: string; display_name: string };

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `Expired ${Math.abs(diff)}d ago`;
  if (diff === 0) return "Expires today";
  return `Expires in ${diff}d`;
}

export default function AdminInvitationsPage() {
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/admin/invitations")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setInvitations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  async function invitationAction(id: string, action: "cancel" | "resend") {
    setRowMsg((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/invitations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      if (action === "resend") {
        setRowMsg((prev) => ({
          ...prev,
          [id]: data.emailSent
            ? "Resent. New invite email sent."
            : "Resent. Email not configured — share the login link manually.",
        }));
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setRowMsg((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Failed.",
      }));
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Invitations</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Invite new users to the Ebrrar OMS.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
        >
          + New invitation
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Role</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Customer</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left hidden lg:table-cell">Expiry</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading…</td>
              </tr>
            ) : invitations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">No invitations yet.</td>
              </tr>
            ) : (
              invitations.map((inv) => {
                const statusClass = STATUS_BADGE[inv.status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
                const canResend = inv.status === "pending" || inv.status === "expired";
                const canCancel = inv.status === "pending";

                return (
                  <>
                    <tr
                      key={inv.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        {inv.email}
                        {inv.full_name && (
                          <span className="ml-1 text-zinc-400 font-normal">({inv.full_name})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                        {ROLE_LABELS[inv.role]}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">
                        {inv.customer_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${statusClass}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs hidden lg:table-cell">
                        {daysUntil(inv.expires_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canResend && (
                            <button
                              onClick={() => invitationAction(inv.id, "resend")}
                              className="px-2.5 py-1 rounded text-xs font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                            >
                              Resend
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => invitationAction(inv.id, "cancel")}
                              className="px-2.5 py-1 rounded text-xs font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {rowMsg[inv.id] && (
                      <tr key={`${inv.id}-msg`} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td colSpan={6} className="px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                          {rowMsg[inv.id]}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <InviteModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ─── Invite modal (unchanged from before) ────────────────────────────────────

function InviteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("corporate_employee");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const needsCustomer = role === "corporate_admin" || role === "corporate_employee";

  useEffect(() => {
    let alive = true;
    if (needsCustomer && customers.length === 0) {
      fetch("/api/customers/full")
        .then((r) => r.json())
        .then((data) => { if (alive) setCustomers(data); });
    }
    return () => { alive = false; };
  }, [needsCustomer, customers.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName || null,
        role,
        customer_id: needsCustomer && customerId ? customerId : null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setSuccess(
        data.emailSent
          ? "Invitation sent! The user will receive an email."
          : "Invitation recorded. Email sending is not configured — share the login link manually.",
      );
      setTimeout(onSuccess, 2000);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? err.message ?? "Failed to create invitation.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Invite a user</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Full name (optional)
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value as UserRole); setCustomerId(""); }}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {needsCustomer && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.display_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !!success}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition"
            >
              {saving ? "Sending…" : "Send invitation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
