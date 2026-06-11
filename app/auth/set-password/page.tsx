"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

type PageState = "loading" | "form" | "success" | "invalid";

export default function SetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // ── Hash-based token fallback ──────────────────────────────────────────
    // The normal path is: /login detects the hash, calls setSession(), then
    // redirects here with a cookie-backed session already established.
    //
    // Belt-and-suspenders: if Supabase ever directs a recovery/invite link
    // straight to /auth/set-password (e.g. a future config change), we handle
    // the hash here too so the page always works regardless of landing path.
    const rawHash = window.location.hash;
    if (rawHash.includes("access_token")) {
      const params      = new URLSearchParams(rawHash.slice(1));
      const accessToken  = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            setPageState(error ? "invalid" : "form");
          });
        return; // onAuthStateChange below will fire once setSession resolves
      }
    }

    // ── Cookie-backed session (normal path) ───────────────────────────────
    // onAuthStateChange fires once the SDK has fully settled — more reliable
    // than a one-shot getSession() call, which can return null if the session
    // cookie hasn't been read yet at the time the effect runs.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setPageState(session ? "form" : "invalid");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setPageState("success");
    setTimeout(() => {
      window.location.href = "/select-role";
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 mb-4 shadow-sm">
            <span className="text-white font-bold text-2xl tracking-tighter">E</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Ebrrar OMS
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Order Management System</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-8">
          {pageState === "loading" && (
            <p className="text-sm text-zinc-500 text-center py-4">Verifying invitation…</p>
          )}

          {pageState === "invalid" && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🔗</div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Link invalid or expired
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                This invitation link is no longer valid. Please ask your administrator
                to send a new invitation.
              </p>
              <a
                href="/login"
                className="mt-5 inline-block text-sm text-emerald-600 hover:underline"
              >
                Back to sign in
              </a>
            </div>
          )}

          {pageState === "success" && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Password set
              </h2>
              <p className="text-sm text-zinc-500">Redirecting you now…</p>
            </div>
          )}

          {pageState === "form" && (
            <>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                Set your password
              </h2>
              <p className="text-sm text-zinc-500 mb-6">
                Choose a password to complete your account setup.
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    New password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition"
                >
                  {submitting ? "Setting password…" : "Set password"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} Ebrrar. All rights reserved.
        </p>
      </div>
    </div>
  );
}
