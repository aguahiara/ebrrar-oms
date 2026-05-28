import { requireRole } from "@/lib/auth";
import Link from "next/link";

export default async function ManagementDashboardPage() {
  const session = await requireRole(["management_viewer"]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Management Dashboard
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Read-only reports and production summaries.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/production-quantities"
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">📊</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Production Reports
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              View kitchen production quantities and component breakdowns by
              service day.
            </p>
          </div>
        </Link>

        <Link
          href="/dashboard"
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">📋</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Customer Summaries
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              View released order summaries by customer for any service day.
            </p>
          </div>
        </Link>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">
          {session.profile.full_name || session.user.email}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Management Viewer · Read-only access
        </p>
      </div>
    </div>
  );
}
