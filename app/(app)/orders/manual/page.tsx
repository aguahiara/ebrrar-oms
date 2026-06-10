import { requirePermission } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import ManualOrderForm from "./manual-order-form";

// Fetch active non-system customers for the corporate customer dropdown.
async function fetchSelectableCustomers(): Promise<
  { id: string; displayName: string }[]
> {
  const { data } = await supabase
    .from("customer")
    .select("id, display_name, is_system_customer")
    .neq("status", "Inactive")
    .order("display_name");

  return (data ?? [])
    .filter((c) => !c.is_system_customer)
    .map((c) => ({ id: c.id, displayName: c.display_name }));
}

// Fetch the Special Orders system customer.
async function fetchSpecialOrdersCustomer(): Promise<{
  id: string;
  displayName: string;
} | null> {
  const { data } = await supabase
    .from("customer")
    .select("id, display_name")
    .eq("is_system_customer", true)
    .eq("display_name", "Special Orders")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, displayName: data.display_name };
}

// Fetch recent manual order batches (last 60 days) for the review list.
async function fetchRecentManualBatches(): Promise<
  {
    id: string;
    customerName: string;
    serviceDay: string;
    channel: string;
    batchNotes: string | null;
    contactName: string | null;
    lineCount: number;
    totalQuantity: number;
    isReleased: boolean;
    releasedAt: string | null;
    createdAt: string;
  }[]
> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [batchRes, releaseRes] = await Promise.all([
    supabase
      .from("order_batch")
      .select("id, customer_id, service_day, channel, batch_notes, contact_name, created_at, customer ( display_name )")
      .eq("channel", "ManualEntry")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase
      .from("dashboard_release")
      .select("customer_id, service_day, released_at")
      .gte("service_day", since)
      .is("revoked_at", null),
  ]);

  if (!batchRes.data || batchRes.data.length === 0) return [];

  // Fetch lines for these batches.
  const batchIds = batchRes.data.map((b) => b.id);
  const { data: lines } = await supabase
    .from("order_line")
    .select("order_batch_id, quantity")
    .in("order_batch_id", batchIds);

  // Build release lookup by customer_id+service_day.
  const releaseKey = (cid: string, sd: string) => `${cid}::${sd}`;
  const releaseMap = new Map<string, string>();
  for (const rel of releaseRes.data ?? []) {
    if (rel.released_at) {
      releaseMap.set(
        releaseKey(rel.customer_id as string, rel.service_day as string),
        rel.released_at as string,
      );
    }
  }

  // Aggregate line counts per batch.
  const lineCountByBatch = new Map<string, { count: number; qty: number }>();
  for (const line of lines ?? []) {
    const bId = line.order_batch_id as string;
    const cur = lineCountByBatch.get(bId) ?? { count: 0, qty: 0 };
    cur.count += 1;
    cur.qty += (line.quantity as number) ?? 1;
    lineCountByBatch.set(bId, cur);
  }

  return batchRes.data.map((b) => {
    const custRel = Array.isArray(b.customer) ? b.customer[0] : b.customer;
    const customerName =
      custRel && typeof custRel === "object" && "display_name" in custRel
        ? String((custRel as Record<string, unknown>).display_name)
        : b.customer_id;
    const lineSummary = lineCountByBatch.get(b.id) ?? { count: 0, qty: 0 };
    const releasedAt =
      releaseMap.get(releaseKey(b.customer_id as string, b.service_day as string)) ??
      null;
    return {
      id: b.id,
      customerName,
      serviceDay: b.service_day as string,
      channel: b.channel,
      batchNotes: b.batch_notes ?? null,
      contactName: b.contact_name ?? null,
      lineCount: lineSummary.count,
      totalQuantity: lineSummary.qty,
      isReleased: releasedAt !== null,
      releasedAt,
      createdAt: b.created_at as string,
    };
  });
}

type ManualOrdersPageProps = {
  searchParams: Promise<{ editBatchId?: string }>;
};

export default async function ManualOrdersPage({ searchParams }: ManualOrdersPageProps) {
  const params = await searchParams;
  await requirePermission("manage_orders");

  const [corporateCustomers, specialOrdersCustomer, recentBatches] =
    await Promise.all([
      fetchSelectableCustomers(),
      fetchSpecialOrdersCustomer(),
      fetchRecentManualBatches(),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Manual Orders
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enter corporate add-on orders or special orders that were not in an
          uploaded schedule.
        </p>
      </div>

      <ManualOrderForm
        corporateCustomers={corporateCustomers}
        specialOrdersCustomer={specialOrdersCustomer}
        canEdit={true}
        recentBatches={recentBatches}
        initialEditBatchId={params.editBatchId ?? null}
      />
    </div>
  );
}
