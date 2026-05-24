import type { AvonDayOfWeek } from "@/lib/avon-excel";
import type { MenuItemAliasForMatch } from "@/lib/matchMeal";
import { supabase } from "@/lib/supabase";

export type AvonMenuItem = {
  id: string;
  day_of_week: AvonDayOfWeek;
  canonical_name: string;
};

export async function fetchAvonMenuItems(): Promise<AvonMenuItem[]> {
  const { data, error } = await supabase
    .from("menu_item")
    .select(
      `
      id,
      day_of_week,
      canonical_name,
      menu_version!inner (
        status,
        customer!inner ( display_name )
      )
    `,
    )
    .eq("menu_version.status", "Published")
    .eq("menu_version.customer.display_name", "AVON");

  if (error) {
    throw new Error(`Failed to load AVON menu items: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    day_of_week: row.day_of_week as AvonDayOfWeek,
    canonical_name: row.canonical_name,
  }));
}

/**
 * Aliases for AVON's published menu items, used as step 2 of matchMeal.
 * normalized_text is stored pre-normalized so matching is a plain equality check.
 */
export async function fetchAvonAliases(): Promise<MenuItemAliasForMatch[]> {
  const { data, error } = await supabase
    .from("menu_item_alias")
    .select(
      `
      menu_item_id,
      normalized_text,
      menu_item!inner (
        menu_version!inner (
          status,
          customer!inner ( display_name )
        )
      )
    `,
    )
    .eq("menu_item.menu_version.status", "Published")
    .eq("menu_item.menu_version.customer.display_name", "AVON");

  if (error) {
    throw new Error(`Failed to load AVON menu aliases: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    menu_item_id: row.menu_item_id,
    normalized_text: row.normalized_text,
  }));
}
