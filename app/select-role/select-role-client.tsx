"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoleAssignment } from "@/lib/auth-types";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_LANDING } from "@/lib/permissions";

interface Props {
  // Only roles already confirmed by the server as assigned to this user.
  // The server page redirects immediately for single-role users, so this
  // component is only rendered when roles.length >= 2.
  roles: RoleAssignment[];
}

export default function SelectRoleClient({ roles }: Props) {
  const router = useRouter();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(role: RoleAssignment) {
    setSelecting(role.id);
    setError(null);

    const res = await fetch("/api/auth/select-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send the assignment id so the server can verify ownership without
      // trusting the role string from the client at all.
      body: JSON.stringify({ assignment_id: role.id }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: string }).error ?? "Could not select role. Please try again.");
      setSelecting(null);
      return;
    }

    router.push(ROLE_LANDING[role.role]);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 mb-4 shadow-sm">
            <span className="text-white font-bold text-2xl tracking-tighter">E</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Select your role
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Choose the role you want to work in for this session.
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              disabled={!!selecting}
              className="w-full text-left px-5 py-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-sm disabled:opacity-50 transition group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50 text-sm">
                      {ROLE_LABELS[r.role]}
                    </span>
                    {r.customer_name && (
                      <span className="text-xs text-zinc-500 font-normal">
                        — {r.customer_name}
                      </span>
                    )}
                    {r.is_default && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {ROLE_DESCRIPTIONS[r.role]}
                  </p>
                </div>
                {selecting === r.id ? (
                  <span className="shrink-0 text-xs text-zinc-400">Loading…</span>
                ) : (
                  <svg
                    className="shrink-0 h-4 w-4 text-zinc-400 group-hover:text-emerald-500 transition"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <a
            href="/login"
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
          >
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}
