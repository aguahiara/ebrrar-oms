import { NewCustomerForm } from "@/app/customers/new-customer-form";
import { PARSER_FORMAT_OPTIONS } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";

const FORMAT_LABEL: Record<string, string> = Object.fromEntries(
  PARSER_FORMAT_OPTIONS.map((o) => [o.value, o.label]),
);

export default async function CustomersPage() {
  const { data: customers } = await supabase
    .from("customer")
    .select("display_name, parser_format, status")
    .order("display_name");

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Order management
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            Customers
          </h1>
        </header>

        <div className="mb-8">
          <NewCustomerForm formats={PARSER_FORMAT_OPTIONS} />
        </div>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50">
                  Customer
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50">
                  Order file format
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-zinc-50">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No customers yet.
                  </td>
                </tr>
              ) : (
                (customers ?? []).map((c) => (
                  <tr
                    key={c.display_name}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {c.display_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.parser_format
                        ? (FORMAT_LABEL[c.parser_format] ?? c.parser_format)
                        : "— not set —"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
