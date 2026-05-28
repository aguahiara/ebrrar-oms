import { CustomerEditForm } from "@/app/(app)/customers/[id]/customer-edit-form";
import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: PageProps) {
  const session = await getAppSession();
  if (!session) redirect("/login");

  const { id } = await params;

  // ── Fetch customer row ────────────────────────────────────────────────────
  const { data: customer, error: custErr } = await supabase
    .from("customer")
    .select(
      "id, display_name, customer_code, status, parser_format, notes, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (custErr) throw new Error(custErr.message);
  if (!customer) notFound();

  const canEdit = hasPermission(session.selectedRole.role, "manage_customers");

  // ── Parallel side-queries ─────────────────────────────────────────────────
  const [profilesRes, ownedMenusRes, assignedMenusRes, batchRes, openExRes] = await Promise.all([
    // Portion profiles assigned to this customer
    supabase
      .from("portion_profile")
      .select("id, name, description")
      .eq("customer_id", id)
      .order("name"),

    // Menus owned directly by this customer
    supabase
      .from("menu_version")
      .select("id, status, service_week_start, source_filename, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(20),

    // Menu versions assigned to this customer via menu_assignment
    supabase
      .from("menu_assignment")
      .select(
        "menu_version_id, menu_version ( id, status, service_week_start, source_filename, created_at )",
      )
      .eq("customer_id", id)
      .limit(20),

    // Total order batches uploaded for this customer
    supabase
      .from("order_batch")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id),

    // Open exceptions for this customer (all service days)
    supabase
      .from("order_exception")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id)
      .eq("status", "Open"),
  ]);

  const profiles = profilesRes.data ?? [];

  // Merge owned + assigned menus, dedupe by id, most-recent first
  type MenuRow = {
    id: string;
    status: string | null;
    service_week_start: string | null;
    source_filename: string | null;
    created_at: string | null;
  };
  const ownedMenus: MenuRow[] = (ownedMenusRes.data ?? []).map((m) => ({
    id: m.id as string,
    status: m.status as string | null,
    service_week_start: m.service_week_start as string | null,
    source_filename: m.source_filename as string | null,
    created_at: m.created_at as string | null,
  }));
  const assignedMenus: MenuRow[] = (assignedMenusRes.data ?? [])
    .map((a) => {
      const mv = Array.isArray(a.menu_version)
        ? a.menu_version[0]
        : a.menu_version;
      if (!mv || typeof mv !== "object") return null;
      const r = mv as Record<string, unknown>;
      return {
        id: r.id as string,
        status: (r.status as string | null) ?? null,
        service_week_start: (r.service_week_start as string | null) ?? null,
        source_filename: (r.source_filename as string | null) ?? null,
        created_at: (r.created_at as string | null) ?? null,
      };
    })
    .filter((x): x is MenuRow => x !== null);

  const seenIds = new Set<string>();
  const menus: MenuRow[] = [];
  for (const m of [...ownedMenus, ...assignedMenus]) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id);
      menus.push(m);
    }
  }
  menus.sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );

  const batchCount = batchRes.count ?? 0;
  const openExCount = openExRes.count ?? 0;

  // ── Formatting helpers ────────────────────────────────────────────────────
  function fmtDate(iso: string | null | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const statusColor: Record<string, string> = {
    Published:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    Draft: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    Archived: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="w-full max-w-3xl space-y-8">

        {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
        <nav className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/customers"
            className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200"
          >
            Customers
          </Link>
          <span>/</span>
          <span className="text-zinc-900 dark:text-zinc-50">
            {customer.display_name as string}
          </span>
        </nav>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Customer
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
              {customer.display_name as string}
            </h1>
            {customer.customer_code && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Code: <span className="font-mono">{customer.customer_code as string}</span>
              </p>
            )}
          </div>

          {/* ── Stats chips ──────────────────────────────────────────────── */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatChip label="Batches" value={batchCount} href="/upload" />
            {openExCount > 0 && (
              <StatChip
                label="Open exceptions"
                value={openExCount}
                href="/exceptions"
                highlight
              />
            )}
          </div>
        </header>

        {/* ── Customer detail card (view + edit) ──────────────────────────── */}
        <CustomerEditForm
          customer={{
            id: customer.id as string,
            displayName: customer.display_name as string,
            customerCode: (customer.customer_code as string | null) ?? null,
            status: customer.status as string,
            parserFormat: (customer.parser_format as string | null) ?? null,
            notes: (customer.notes as string | null) ?? null,
          }}
          canEdit={canEdit}
        />

        {/* ── Meta row ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-6 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            Created{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {fmtDate(customer.created_at as string)}
            </span>
          </span>
          {customer.updated_at && (
            <span>
              Last updated{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {fmtDate(customer.updated_at as string)}
              </span>
            </span>
          )}
        </div>

        {/* ── Assigned menus ──────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Menus"
            action={
              <Link
                href="/menu"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Manage menus →
              </Link>
            }
          />
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {menus.length === 0 ? (
              <EmptyRow message="No menus assigned to this customer." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    <Th>Service week</Th>
                    <Th>Status</Th>
                    <Th>Source file</Th>
                    <Th>Uploaded</Th>
                  </tr>
                </thead>
                <tbody>
                  {menus.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        {m.service_week_start
                          ? fmtDate(m.service_week_start)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            statusColor[m.status ?? ""] ??
                            "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {m.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {m.source_filename ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {fmtDate(m.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── Portion profiles ────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Portion profiles"
            action={
              <Link
                href="/portion-profiles"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Manage profiles →
              </Link>
            }
          />
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {profiles.length === 0 ? (
              <EmptyRow message="No portion profiles assigned to this customer." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    <Th>Profile name</Th>
                    <Th>Description</Th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr
                      key={p.id as string}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                        {p.name as string}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {(p.description as string | null) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── Delivery locations (placeholder) ────────────────────────────── */}
        <section>
          <SectionHeader title="Delivery locations" />
          <PlaceholderCard message="Delivery location management is not yet available." />
        </section>

        {/* ── Contacts (placeholder) ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="Contacts" />
          <PlaceholderCard message="Contact management is not yet available." />
        </section>

      </main>
    </div>
  );
}

// ── Reusable layout sub-components ───────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      {action}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-900 dark:text-zinc-50">
      {children}
    </th>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
      {message}
    </div>
  );
}

function PlaceholderCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-500">
      {message}
    </div>
  );
}

function StatChip({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href?: string;
  highlight?: boolean;
}) {
  const base = highlight
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";

  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${base}`}
    >
      <span className="text-base font-semibold">{value}</span>
      <span className="text-xs">{label}</span>
    </span>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
