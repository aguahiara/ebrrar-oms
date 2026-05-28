import { requireRole } from "@/lib/auth";
import Link from "next/link";

export default async function CorporateDashboardPage() {
  const session = await requireRole(["corporate_admin"]);

  const customerName =
    session.selectedRole.customer_name ?? "your organisation";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Corporate Dashboard
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">{customerName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/upload"
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">📤</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Upload Orders
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Upload your employee meal order schedule for upcoming service
              days.
            </p>
          </div>
        </Link>

        <Link
          href={`/customer-menu/${session.selectedRole.customer_id ?? ""}`}
          className="group flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 hover:shadow-sm transition"
        >
          <span className="text-3xl">🍽️</span>
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              Menu Approval
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              Review and approve weekly menus assigned to your organisation.
            </p>
          </div>
        </Link>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
          {session.profile.full_name || session.user.email}
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
          Corporate Admin · {customerName}
        </p>
      </div>
    </div>
  );
}
