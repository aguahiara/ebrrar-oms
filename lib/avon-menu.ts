import type { DayOfWeek } from "@/lib/order-types";
import type { MenuItemAliasForMatch } from "@/lib/matchMeal";
import { supabase } from "@/lib/supabase";

export type AvonMenuItem = {
  id: string;
  day_of_week: DayOfWeek;
  canonical_name: string;
};

export async function fetchMenuItems(
  customerDisplayName: string,
): Promise<AvonMenuItem[]> {
  const { data, error } = await supabase
    .from("menu_item")
    .select(
      `
      id,
      day_of_week,
      canonical_name,
      customer_menu_item!inner (
        customer!inner ( display_name )
      )
    `,
    )
    .eq("customer_menu_item.customer.display_name", customerDisplayName);

  if (error) {
    throw new Error(
      `Failed to load menu items for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    day_of_week: row.day_of_week as DayOfWeek,
    canonical_name: row.canonical_name,
  }));
}

/**
 * Aliases for published menu items, used as step 2 of matchMeal.
 * normalized_text is stored pre-normalized so matching is a plain equality check.
 */
export async function fetchAliases(
  customerDisplayName: string,
): Promise<MenuItemAliasForMatch[]> {
  const { data, error } = await supabase
    .from("menu_item_alias")
    .select(
      `
      menu_item_id,
      normalized_text,
      menu_item!inner (
        customer_menu_item!inner (
          customer!inner ( display_name )
        )
      )
    `,
    )
    .eq("menu_item.customer_menu_item.customer.display_name", customerDisplayName);

  if (error) {
    throw new Error(
      `Failed to load menu aliases for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    menu_item_id: row.menu_item_id,
    normalized_text: row.normalized_text,
  }));
}
