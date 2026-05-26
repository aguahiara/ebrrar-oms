import { isCalendarDate } from "@/lib/calendar-date";
import { parseWeeklyMenu } from "@/lib/menu-excel";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const serviceWeekStart = formData.get("serviceWeekStart");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (typeof serviceWeekStart !== "string" || !isCalendarDate(serviceWeekStart)) {
      return NextResponse.json(
        { error: "A valid service week start (YYYY-MM-DD) is required." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are allowed." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const menu = parseWeeklyMenu(buffer);

    // Create a Draft global menu version (customer_id null = global/shared).
    const { data: version, error: versionError } = await supabase
      .from("menu_version")
      .insert({
        customer_id: null,
        service_week_start: serviceWeekStart,
        status: "Draft",
      })
      .select("id")
      .single();

    if (versionError || !version) {
      throw new Error(
        `Failed to create menu version: ${versionError?.message ?? "unknown error"}`,
      );
    }

    const menuVersionId = version.id;

    const { error: itemsError } = await supabase.from("menu_item").insert(
      menu.options.map((option) => ({
        menu_version_id: menuVersionId,
        day_of_week: option.day,
        canonical_name: option.name,
        option_label: option.optionLabel,
      })),
    );
    if (itemsError) {
      throw new Error(`Failed to insert menu items: ${itemsError.message}`);
    }

    if (menu.proteins.length > 0) {
      const { error: proteinError } = await supabase
        .from("protein_option")
        .insert(
          menu.proteins.map((p) => ({
            menu_version_id: menuVersionId,
            day_of_week: p.day,
            name: p.name,
          })),
        );
      if (proteinError) {
        throw new Error(`Failed to insert proteins: ${proteinError.message}`);
      }
    }

    if (menu.swallows.length > 0) {
      const { error: swallowError } = await supabase
        .from("swallow_option")
        .insert(
          menu.swallows.map((s) => ({
            menu_version_id: menuVersionId,
            day_of_week: s.day,
            name: s.name,
          })),
        );
      if (swallowError) {
        throw new Error(`Failed to insert swallows: ${swallowError.message}`);
      }
    }

    return NextResponse.json({
      menuVersionId,
      status: "Draft",
      optionsInserted: menu.options.length,
      proteinsInserted: menu.proteins.length,
      swallowsInserted: menu.swallows.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save the menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
