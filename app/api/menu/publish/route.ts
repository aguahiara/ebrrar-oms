import { getAppSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type PublishBody = { menuVersionId?: string };

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { menuVersionId } = (await request.json()) as PublishBody;

    if (!menuVersionId) {
      return NextResponse.json(
        { error: "menuVersionId is required." },
        { status: 400 },
      );
    }

    // Archive any other currently-published global menu (supersede prior version).
    const { error: archiveError } = await supabase
      .from("menu_version")
      .update({ status: "Archived" })
      .is("customer_id", null)
      .eq("status", "Published")
      .neq("id", menuVersionId);

    if (archiveError) {
      throw new Error(`Failed to archive prior menu: ${archiveError.message}`);
    }

    // Publish the chosen version.
    const { error: publishError } = await supabase
      .from("menu_version")
      .update({ status: "Published" })
      .eq("id", menuVersionId);

    if (publishError) {
      throw new Error(`Failed to publish menu: ${publishError.message}`);
    }

    return NextResponse.json({ ok: true, status: "Published" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to publish the menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
