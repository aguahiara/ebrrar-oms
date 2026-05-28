import Link from "next/link";

export default function ProfileNotConfiguredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 mb-6">
          <span className="text-3xl">⚙️</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
          Profile not configured
        </h1>
        <p className="text-zinc-500 mb-8 leading-relaxed text-sm">
          Your account exists but your user profile hasn&apos;t been set up yet.
          Please contact your system administrator to complete your account
          setup before signing in.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
