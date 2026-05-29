import Link from "next/link";

/**
 * /production — landing page for production-related tools.
 * Auth is enforced by the (app) layout. Individual tools enforce
 * their own role requirements.
 */

const PRODUCTION_TOOLS = [
  {
    label: "Daily Dashboard",
    href: "/dashboard",
    description: "Review released meal orders and customer summaries",
    icon: "📋",
  },
  {
    label: "Kitchen Quantities",
    href: "/production-quantities",
    description: "Generate portion quantities for kitchen preparation",
    icon: "🏭",
  },
  {
    label: "Portion Profiles",
    href: "/portion-profiles",
    description: "Define and manage kitchen portion specifications",
    icon: "⚖️",
  },
  {
    label: "Order Review",
    href: "/dashboard",
    description: "Inspect and release daily orders before production",
    icon: "✅",
  },
];

export default function ProductionLandingPage() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Operations
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Production
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Select a production activity below.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRODUCTION_TOOLS.map((tool) => (
            <Link
              key={`${tool.href}-${tool.label}`}
              href={tool.href}
              className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-600"
            >
              <span className="text-3xl">{tool.icon}</span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 transition group-hover:text-emerald-600 dark:text-zinc-50 dark:group-hover:text-emerald-400">
                  {tool.label}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                  {tool.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
