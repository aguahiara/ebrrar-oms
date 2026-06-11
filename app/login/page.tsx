"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  // True while a Supabase hash token is being exchanged — hides the login form.
  const [hashProcessing, setHashProcessing] = useState(false);

  // ── Hash-based token handler ───────────────────────────────────────────────
  // Default Supabase recovery and invite emails redirect to the Site URL with
  // the session tokens in the URL hash fragment:
  //   /login#access_token=...&refresh_token=...&type=recovery
  //
  // @supabase/ssr's createBrowserClient does NOT automatically process URL
  // hashes (it is a cookie-first, SSR-compatible client). We must read the
  // hash parameters and call setSession() explicitly, then redirect the user
  // to the appropriate page.
  //
  // Token type routing:
  //   recovery → /auth/set-password   (password reset flow)
  //   invite   → /auth/set-password   (new-user onboarding)
  //   magiclink → /select-role        (sign-in, not a password setup)
  //   missing / unknown → /auth/set-password (safe default for any auth link)
  useEffect(() => {
    const rawHash = window.location.hash;
    if (!rawHash.includes("access_token")) return;

    const params = new URLSearchParams(rawHash.slice(1));
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const tokenType    = params.get("type"); // "recovery" | "invite" | "magiclink" | null

    if (!accessToken || !refreshToken) return;

    // Show a processing screen immediately — prevent the login form from
    // flashing before the redirect fires.
    setHashProcessing(true);

    // Remove tokens from the address bar so they are not visible or bookmarked.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          // Token is expired or already used — show an error and let the user
          // request a new link rather than silently staying on the login page.
          setError(
            "This link has expired or has already been used. Please request a new one.",
          );
          setHashProcessing(false);
          return;
        }

        // Route based on token type.
        if (tokenType === "magiclink") {
          window.location.replace("/select-role");
        } else {
          // recovery, invite, or any unrecognised type → set-password.
          window.location.replace("/auth/set-password");
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();

    if (mode === "password") {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
      } else {
        window.location.href = "/select-role";
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
      } else {
        setMagicSent(true);
        setLoading(false);
      }
    }
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
          {/* Processing state — shown while a hash token is being exchanged */}
          {hashProcessing ? (
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500">Processing your link…</p>
              {error && (
                <div className="mt-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
                  {error}
                  <div className="mt-3">
                    <a href="/login" className="text-emerald-600 hover:underline text-sm">
                      Back to sign in
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : magicSent ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Check your email
              </h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                We sent a sign-in link to{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">{email}</strong>.
                Click the link in that email to continue.
              </p>
              <button
                onClick={() => {
                  setMagicSent(false);
                  setEmail("");
                }}
                className="mt-5 text-sm text-emerald-600 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
                Sign in to your account
              </h2>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  />
                </div>

                {mode === "password" && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition"
                >
                  {loading
                    ? "Signing in…"
                    : mode === "password"
                      ? "Sign in"
                      : "Send magic link"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "password" ? "magic" : "password");
                    setError(null);
                  }}
                  className="text-sm text-emerald-600 hover:underline"
                >
                  {mode === "password"
                    ? "Sign in with a magic link instead"
                    : "Sign in with password instead"}
                </button>
              </div>
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
