"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSession } from "@/lib/auth-types";
import { ROLE_LABELS } from "@/lib/permissions";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

interface Props {
  session: AppSession;
  onMenuClick: () => void;
}

export default function Topbar({ session, onMenuClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="flex items-center gap-3 px-4 md:px-6 h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Date */}
      <span className="hidden sm:block text-xs text-zinc-400">{today}</span>

      {/* Role badge */}
      <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
        {ROLE_LABELS[session.selectedRole.role]}
      </span>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-sm"
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold uppercase">
            {session.profile.full_name?.charAt(0) ?? session.user.email.charAt(0)}
          </div>
          <span className="hidden md:block text-sm text-zinc-700 dark:text-zinc-300 max-w-[140px] truncate font-medium">
            {session.profile.full_name || session.user.email}
          </span>
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <>
            {/* Click-away backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden text-sm">
              {/* User info */}
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">
                  {session.profile.full_name || "—"}
                </p>
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {session.user.email}
                </p>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/select-role");
                  }}
                  className="w-full text-left px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  Switch role
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
