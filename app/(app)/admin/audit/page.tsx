"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuditEvent } from "@/lib/auth-types";

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<string, string> = {
  user_profile_created:      "Profile created",
  user_profile_updated:      "Profile updated",
  user_suspended:            "User suspended",
  user_reactivated:          "User reactivated",
  user_deactivated:          "User deactivated",
  role_assigned:             "Role assigned",
  role_deactivated:          "Role removed",
  default_role_changed:      "Default role changed",
  password_reset_triggered:  "Password reset sent",
  invitation_created:        "Invitation created",
  invitation_cancelled:      "Invitation cancelled",
  invitation_resent:         "Invitation resent",
  unauthorized_access_attempt: "Unauthorised access attempt",
};

const EVENT_COLOUR: Record<string, string> = {
  user_suspended:              "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800",
  user_deactivated:            "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800",
  unauthorized_access_attempt: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800",
  user_reactivated:            "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800",
};

const DEFAULT_COLOUR = "text-zinc-600 bg-zinc-100 border-zinc-200 dark:text-zinc-300 dark:bg-zinc-800 dark:border-zinc-700";

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (eventType) params.set("eventType", eventType);

    fetch(`/api/admin/audit?${params}`)
      .then((r) => r.json())
      .then((data: { events: AuditEvent[]; total: number }) => {
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, eventType]);

  useEffect(() => { load(); }, [load]);

  function handleFilter(type: string) {
    setEventType(type);
    setPage(1);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Audit Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          All user management actions performed by Super Admins.
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={eventType}
          onChange={(e) => handleFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All event types</option>
          {Object.entries(EVENT_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        {(eventType) && (
          <button
            onClick={() => handleFilter("")}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            Clear filter
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-400">
          {total} event{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Event</th>
              <th className="px-4 py-3 text-left hidden sm:table-cell">Actor</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Target</th>
              <th className="px-4 py-3 text-left w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">Loading…</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No events found.</td>
              </tr>
            ) : (
              events.map((e) => {
                const isOpen = expanded === e.id;
                const colour = EVENT_COLOUR[e.event_type] ?? DEFAULT_COLOUR;
                const label = EVENT_LABELS[e.event_type] ?? e.event_type;
                const hasDetail = e.before || e.after;

                return (
                  <>
                    <tr
                      key={e.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-4 py-3 text-xs text-zinc-400 tabular-nums whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colour}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500 hidden sm:table-cell">
                        {e.actor_role ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-zinc-400 hidden md:table-cell">
                        {e.target_type && e.target_id
                          ? `${e.target_type} ${e.target_id.slice(0, 8)}…`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {hasDetail && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : e.id)}
                            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            title={isOpen ? "Collapse" : "Show detail"}
                          >
                            {isOpen ? "▲" : "▼"}
                          </button>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={`${e.id}-detail`} className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            {e.before && (
                              <div>
                                <p className="text-zinc-500 mb-1 font-medium">Before</p>
                                <pre className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                                  {JSON.stringify(e.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {e.after && (
                              <div>
                                <p className="text-zinc-500 mb-1 font-medium">After</p>
                                <pre className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                                  {JSON.stringify(e.after, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            ← Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
