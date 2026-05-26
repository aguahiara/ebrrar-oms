import { fetchCustomerMenu } from "@/lib/customer-menu";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const DAY_LABEL: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

type CustomerMenuPageProps = {
  params: Promise<{ customer: string }>;
};

export default async function CustomerMenuPage({
  params,
}: CustomerMenuPageProps) {
  const { customer } = await params;
  const name = decodeURIComponent(customer);
  const menu = await fetchCustomerMenu(name);

  const hasMenu = menu.options.length > 0;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-4xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Weekly menu
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {menu.customerName}
            </h1>
          </div>

          {hasMenu && (
            <div className="flex gap-2">
              <a
                href={`/api/customer-menu/${encodeURIComponent(name)}/pdf`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Download PDF
              </a>
              <a
                href={`/api/customer-menu/${encodeURIComponent(name)}/xlsx`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
              >
                Download Excel
              </a>
            </div>
          )}
        </header>

        {!hasMenu ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No menu is available for this customer. Assign them to the published
            menu on the Assignments screen.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DAYS.map((day) => {
              const options = menu.options
                .filter((o) => o.day_of_week === day)
                .sort((a, b) =>
                  (a.optionLabel ?? "").localeCompare(b.optionLabel ?? ""),
                );
              const proteins = menu.proteins
                .filter((p) => p.day_of_week === day)
                .map((p) => p.name);
              const swallows = menu.swallows
                .filter((s) => s.day_of_week === day)
                .map((s) => s.name);

              if (options.length === 0) {
                return null;
              }

              return (
                <section
                  key={day}
                  className="rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {DAY_LABEL[day]}
                  </h2>

                  <ol className="mb-4 space-y-1">
                    {options.map((option) => (
                      <li
                        key={option.optionLabel ?? option.canonical_name}
                        className="text-zinc-700 dark:text-zinc-300"
                      >
                        <span className="text-zinc-400">
                          {option.optionLabel ?? "•"}
                        </span>{" "}
                        {option.canonical_name}
                      </li>
                    ))}
                  </ol>

                  {proteins.length > 0 && (
                    <p className="text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        Proteins:
                      </span>{" "}
                      {proteins.join(", ")}
                    </p>
                  )}
                  {swallows.length > 0 && (
                    <p className="text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        Swallows:
                      </span>{" "}
                      {swallows.join(", ")}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
