import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 mb-6">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
          Access denied
        </h1>
        <p className="text-zinc-500 mb-8 leading-relaxed text-sm">
          You don&apos;t have permission to access this page. If you believe
          this is a mistake, try switching to a different role or contact your
          administrator.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/select-role"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
          >
            Switch role
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Sign out
          </Link>
        </div>
      </div>
    </div>
  );
}
