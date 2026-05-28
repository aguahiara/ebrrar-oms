import { getAppSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("menu_version")
      .select(
        `id,
         customer_id,
         service_week_start,
         status,
         source_filename,
         created_by,
         created_at,
         customer:customer_id ( display_name ),
         menu_item ( id ),
         protein_option ( id ),
         swallow_option ( id )`,
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load menus: ${error.message}`);

    const items = (data ?? []).map((row) => {
      const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer;
      const customerName =
        cust && typeof cust === "object" && "display_name" in cust
          ? String((cust as Record<string, unknown>).display_name)
          : null;

      return {
        id: row.id as string,
        customerId: (row.customer_id as string | null) ?? null,
        customerName,
        serviceWeekStart: String(row.service_week_start),
        status: String(row.status),
        sourceFilename: (row.source_filename as string | null) ?? null,
        createdBy: (row.created_by as string | null) ?? null,
        createdAt: String(row.created_at),
        itemCount: Array.isArray(row.menu_item) ? row.menu_item.length : 0,
        proteinCount: Array.isArray(row.protein_option)
          ? row.protein_option.length
          : 0,
        swallowCount: Array.isArray(row.swallow_option)
          ? row.swallow_option.length
          : 0,
      };
    });

    return NextResponse.json(items);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load menus.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
