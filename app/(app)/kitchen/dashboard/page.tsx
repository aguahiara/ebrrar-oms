import { requireRole } from "@/lib/auth";
import Link from "next/link";

export default async function KitchenDashboardPage() {
  const session = await requireRole(["kitchen_operations"]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Kitchen Dashboard
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">{today}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/production-quantities"
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">🏭</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Production Quantities
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              View today&apos;s kitchen production targets and component
              quantities per meal type.
            </p>
          </div>
        </Link>

        <Link
          href="/portion-profiles"
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">⚖️</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Portion Profiles
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              View portion specification profiles and component weights for each
              customer.
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
              Order Review
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Browse released order summaries for today&apos;s service.
            </p>
          </div>
        </Link>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          Signed in as {session.profile.full_name || session.user.email}
        </p>
        <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
          Kitchen Operations · Read-only access
        </p>
      </div>
    </div>
  );
}
