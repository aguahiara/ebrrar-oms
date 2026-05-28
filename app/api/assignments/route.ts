import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

async function getCustomerId(displayName: string): Promise<string | null> {
  const { data } = await supabase
    .from("customer")
    .select("id")
    .eq("display_name", displayName)
    .maybeSingle();
  return data?.id ?? null;
}

async function getPublishedMenuId(): Promise<string | null> {
  const { data } = await supabase
    .from("menu_version")
    .select("id")
    .is("customer_id", null)
    .eq("status", "Published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const customer = new URL(request.url).searchParams.get("customer");
    if (!customer) {
      return NextResponse.json(
        { error: "customer is required." },
        { status: 400 },
      );
    }

    const publishedVersionId = await getPublishedMenuId();
    if (!publishedVersionId) {
      return NextResponse.json(
        { error: "No published menu found. Publish a menu first." },
        { status: 404 },
      );
    }

    const customerId = await getCustomerId(customer);
    if (!customerId) {
      return NextResponse.json(
        { error: `Customer ${customer} not found.` },
        { status: 404 },
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from("menu_item")
      .select("id, day_of_week, canonical_name, option_label")
      .eq("menu_version_id", publishedVersionId);
    if (itemsError) {
      throw new Error(itemsError.message);
    }

    const { data: assignment } = await supabase
      .from("menu_assignment")
      .select("id")
      .eq("customer_id", customerId)
      .eq("menu_version_id", publishedVersionId)
      .maybeSingle();

    const { data: avail, error: availError } = await supabase
      .from("customer_menu_item")
      .select("menu_item_id")
      .eq("customer_id", customerId);
    if (availError) {
      throw new Error(availError.message);
    }

    return NextResponse.json({
      publishedVersionId,
      assignedToPublished: Boolean(assignment),
      items: items ?? [],
      availableItemIds: (avail ?? []).map((r) => r.menu_item_id),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load assignment state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PostBody = {
  action?: "assign" | "toggle";
  customer?: string;
  menuItemId?: string;
  available?: boolean;
};

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as PostBody;
    const { action, customer } = body;

    if (!action || !customer) {
      return NextResponse.json(
        { error: "action and customer are required." },
        { status: 400 },
      );
    }

    const customerId = await getCustomerId(customer);
    if (!customerId) {
      return NextResponse.json(
        { error: `Customer ${customer} not found.` },
        { status: 404 },
      );
    }

    const publishedVersionId = await getPublishedMenuId();
    if (!publishedVersionId) {
      return NextResponse.json(
        { error: "No published menu found." },
        { status: 404 },
      );
    }

    if (action === "assign") {
      // Repoint the customer onto the published menu, resetting availability
      // to all options (the assign-all default).
      await supabase.from("customer_menu_item").delete().eq("customer_id", customerId);
      await supabase.from("menu_assignment").delete().eq("customer_id", customerId);

      const { error: assignError } = await supabase
        .from("menu_assignment")
        .insert({ customer_id: customerId, menu_version_id: publishedVersionId });
      if (assignError) {
        throw new Error(`Failed to assign menu: ${assignError.message}`);
      }

      const { data: items, error: itemsError } = await supabase
        .from("menu_item")
        .select("id")
        .eq("menu_version_id", publishedVersionId);
      if (itemsError) {
        throw new Error(itemsError.message);
      }

      if (items && items.length > 0) {
        const { error: availError } = await supabase
          .from("customer_menu_item")
          .insert(
            items.map((it) => ({
              customer_id: customerId,
              menu_item_id: it.id,
            })),
          );
        if (availError) {
          throw new Error(`Failed to populate availability: ${availError.message}`);
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "toggle") {
      const { menuItemId, available } = body;
      if (!menuItemId || typeof available !== "boolean") {
        return NextResponse.json(
          { error: "menuItemId and available are required for toggle." },
          { status: 400 },
        );
      }

      if (available) {
        const { error } = await supabase
          .from("customer_menu_item")
          .upsert(
            { customer_id: customerId, menu_item_id: menuItemId },
            { onConflict: "customer_id,menu_item_id" },
          );
        if (error) {
          throw new Error(error.message);
        }
      } else {
        const { error } = await supabase
          .from("customer_menu_item")
          .delete()
          .eq("customer_id", customerId)
          .eq("menu_item_id", menuItemId);
        if (error) {
          throw new Error(error.message);
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
