import type { AvonDayOfWeek } from "@/lib/avon-excel";
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
