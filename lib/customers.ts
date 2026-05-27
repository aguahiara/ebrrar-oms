import { supabase } from "@/lib/supabase";

/** Active customer display names, ordered — the source for every customer dropdown. */
export async function fetchActiveCustomerNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("customer")
    .select("display_name, status")
    .order("display_name");

  if (error) {
    throw new Error(`Failed to load customers: ${error.message}`);
  }

  return (data ?? [])
    .filter((c) => c.status !== "Inactive")
    .map((c) => c.display_name);
}
