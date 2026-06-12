import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Shown when a suspended or deactivated user tries to access the application.
 * We sign them out of Supabase so they can't loop back in without a valid
 * session. The sign-out happens server-side via the server client.
 */
export default async function SuspendedPage() {
  // Sign the user out so their session cookie is cleared. Even if this fails,
  // the rest of the app guards will keep blocking them.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Non-fatal — the page still renders correctly.
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-600 mb-6 shadow-sm">
          <svg
            className="h-7 w-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
          Account suspended
        </h1>
        <p className="text-sm text-zinc-500 leading-relaxed mb-6">
          Your account has been suspended or deactivated. Please contact your
          system administrator to restore access.
        </p>

        <a
          href="/login"
          className="inline-block text-sm text-emerald-600 hover:underline"
        >
          Back to sign in
        </a>
      </div>
    </div>
  );
}
