import {
  fetchProteins,
  fetchSwallows,
  type MenuVocabItem,
} from "@/lib/avon-menu";
import type { DayOfWeek } from "@/lib/order-types";
import { supabase } from "@/lib/supabase";

export type CustomerMenuOption = {
  day_of_week: DayOfWeek;
  optionLabel: string | null;
  canonical_name: string;
};

export type CustomerMenu = {
  customerName: string;
  options: CustomerMenuOption[];
  proteins: MenuVocabItem[];
  swallows: MenuVocabItem[];
};

/**
 * The weekly menu as a given customer would receive it: the meal options they
 * are offered (from their availability allow-list) plus the day's protein and
 * swallow choices from the menu they are assigned to.
 */
export async function fetchCustomerMenu(
  customerDisplayName: string,
): Promise<CustomerMenu> {
  const { data, error } = await supabase
    .from("menu_item")
    .select(
      `
      day_of_week,
      canonical_name,
      option_label,
      customer_menu_item!inner (
        customer!inner ( display_name )
      )
    `,
    )
    .eq("customer_menu_item.customer.display_name", customerDisplayName);

  if (error) {
    throw new Error(
      `Failed to load menu for ${customerDisplayName}: ${error.message}`,
    );
  }

  const options: CustomerMenuOption[] = (data ?? []).map((row) => ({
    day_of_week: row.day_of_week as DayOfWeek,
    optionLabel: row.option_label,
    canonical_name: row.canonical_name,
  }));

  const [proteins, swallows] = await Promise.all([
    fetchProteins(customerDisplayName),
    fetchSwallows(customerDisplayName),
  ]);

  return { customerName: customerDisplayName, options, proteins, swallows };
}
