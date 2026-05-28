import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

/** Returns active customers with both id and display_name — used by forms that need UUIDs. */
export async function GET() {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("customer")
    .select("id, display_name")
    .neq("status", "Inactive")
    .order("display_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
