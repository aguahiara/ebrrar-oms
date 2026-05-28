import { getAppSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

// ── GET: full menu detail (items + proteins + swallows grouped by day) ────────

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const [itemsRes, proteinsRes, swallowsRes] = await Promise.all([
      supabase
        .from("menu_item")
        .select("day_of_week, canonical_name, option_label, category")
        .eq("menu_version_id", id)
        .order("day_of_week")
        .order("option_label"),
      supabase
        .from("protein_option")
        .select("day_of_week, name")
        .eq("menu_version_id", id)
        .order("day_of_week"),
      supabase
        .from("swallow_option")
        .select("day_of_week, name")
        .eq("menu_version_id", id)
        .order("day_of_week"),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (proteinsRes.error) throw new Error(proteinsRes.error.message);
    if (swallowsRes.error) throw new Error(swallowsRes.error.message);

    return NextResponse.json({
      items: itemsRes.data ?? [],
      proteins: proteinsRes.data ?? [],
      swallows: swallowsRes.data ?? [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load menu detail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH: update status and/or customer assignment ───────────────────────────

type PatchBody = {
  status?: string;
  customerId?: string | null;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { status, customerId } = (await request.json()) as PatchBody;

    // When publishing, archive all other published versions for the same
    // customer scope (null = global) so there is always at most one live menu.
    if (status === "Published") {
      const { data: current, error: fetchErr } = await supabase
        .from("menu_version")
        .select("customer_id")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);

      let archiveQuery = supabase
        .from("menu_version")
        .update({ status: "Archived" })
        .eq("status", "Published")
        .neq("id", id);

      if (current?.customer_id) {
        archiveQuery = archiveQuery.eq(
          "customer_id",
          current.customer_id as string,
        );
      } else {
        archiveQuery = archiveQuery.is("customer_id", null);
      }

      const { error: archiveErr } = await archiveQuery;
      if (archiveErr)
        throw new Error(
          `Failed to archive prior published version: ${archiveErr.message}`,
        );
    }

    const update: Record<string, unknown> = {};
    if (status !== undefined) update.status = status;
    // customerId can be explicitly null (to make the menu global)
    if (customerId !== undefined) update.customer_id = customerId;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from("menu_version")
      .update(update)
      .eq("id", id);

    if (updateErr)
      throw new Error(`Failed to update menu: ${updateErr.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE: only Draft menus, with production-reference safety check ──────────

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    // Confirm the version exists and is a Draft.
    const { data: version, error: fetchErr } = await supabase
      .from("menu_version")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!version)
      return NextResponse.json({ error: "Menu not found." }, { status: 404 });
    if (version.status !== "Draft") {
      return NextResponse.json(
        { error: "Only Draft menus can be deleted." },
        { status: 409 },
      );
    }

    // Collect all menu_item IDs for this version.
    const { data: items } = await supabase
      .from("menu_item")
      .select("id")
      .eq("menu_version_id", id);

    const itemIds = (items ?? []).map((i) => i.id as string);

    // Block deletion if any order line or resolved exception references these items.
    if (itemIds.length > 0) {
      const { count: lineCount } = await supabase
        .from("order_line")
        .select("id", { count: "exact", head: true })
        .in("menu_item_id", itemIds);

      if ((lineCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete: ${lineCount} order line${lineCount !== 1 ? "s" : ""} reference this menu's items.`,
          },
          { status: 409 },
        );
      }

      const { count: exCount } = await supabase
        .from("order_exception")
        .select("id", { count: "exact", head: true })
        .in("resolved_item_id", itemIds);

      if ((exCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete: ${exCount} resolved exception${exCount !== 1 ? "s" : ""} reference this menu's items.`,
          },
          { status: 409 },
        );
      }

      // Clear child records in dependency order before removing items.
      await supabase.from("menu_item_alias").delete().in("menu_item_id", itemIds);
      await supabase
        .from("customer_menu_item")
        .delete()
        .in("menu_item_id", itemIds);
    }

    // Delete all version-level data, then the version itself.
    await supabase.from("menu_item").delete().eq("menu_version_id", id);
    await supabase.from("protein_option").delete().eq("menu_version_id", id);
    await supabase.from("swallow_option").delete().eq("menu_version_id", id);
    await supabase.from("menu_assignment").delete().eq("menu_version_id", id);

    const { error: deleteErr } = await supabase
      .from("menu_version")
      .delete()
      .eq("id", id);

    if (deleteErr)
      throw new Error(`Failed to delete menu: ${deleteErr.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
