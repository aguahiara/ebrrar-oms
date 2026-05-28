import { requireRole } from "@/lib/auth";
import Link from "next/link";

const QUICK_ACTIONS = [
  {
    label: "Customers",
    href: "/customers",
    description: "Manage customer accounts and settings",
    icon: "🏢",
  },
  {
    label: "Menus",
    href: "/menu",
    description: "Build and publish weekly menus",
    icon: "🍽️",
  },
  {
    label: "Upload Orders",
    href: "/upload",
    description: "Upload customer order files",
    icon: "📤",
  },
  {
    label: "Exceptions",
    href: "/exceptions",
    description: "Review and resolve order exceptions",
    icon: "⚠️",
  },
  {
    label: "Portion Profiles",
    href: "/portion-profiles",
    description: "Define kitchen portion specifications",
    icon: "⚖️",
  },
  {
    label: "Production",
    href: "/production-quantities",
    description: "Generate kitchen production quantities",
    icon: "🏭",
  },
  {
    label: "Order Review",
    href: "/dashboard",
    description: "Review and release daily dashboards",
    icon: "📋",
  },
  {
    label: "Reports",
    href: "/management/dashboard",
    description: "View management and production reports",
    icon: "📊",
  },
];

const ADMIN_ACTIONS = [
  {
    label: "Users & Roles",
    href: "/admin/users",
    description: "Manage user profiles and role assignments",
    icon: "👥",
  },
  {
    label: "Invitations",
    href: "/admin/invitations",
    description: "Invite new users to the system",
    icon: "✉️",
  },
];

export default async function AdminDashboardPage() {
  const session = await requireRole([
    "ebrrar_super_admin",
    "ebrrar_operations_admin",
  ]);

  const isSuperAdmin = session.selectedRole.role === "ebrrar_super_admin";

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Good {getGreeting()},{" "}
          {session.profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Here&apos;s your Ebrrar OMS command centre.
        </p>
      </div>

      {/* Operations */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Operations
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-600 hover:shadow-sm transition"
            >
              <span className="text-2xl">{action.icon}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                  {action.label}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-snug">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Admin (super admin only) */}
      {isSuperAdmin && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Administration
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ADMIN_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-col gap-2 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-600 hover:shadow-sm transition"
              >
                <span className="text-2xl">{action.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                    {action.label}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-snug">
                    {action.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
