import { getAppSession } from "@/lib/auth";
import { normalize } from "@/lib/matchMeal";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type ResolveAction = "map" | "drop" | "accept";

type ResolveBody = {
  exceptionId?: string;
  action?: ResolveAction;
  menuItemId?: string;
  saveAsAlias?: boolean;
};

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as ResolveBody;
    const { exceptionId, action, menuItemId, saveAsAlias = false } = body;

    if (!exceptionId || !action) {
      return NextResponse.json(
        { error: "exceptionId and action are required." },
        { status: 400 },
      );
    }

    if (!["map", "drop", "accept"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    if (action === "map" && !menuItemId) {
      return NextResponse.json(
        { error: "menuItemId is required for Map." },
        { status: 400 },
      );
    }

    const { data: exception, error: fetchError } = await supabase
      .from("order_exception")
      .select("*")
      .eq("id", exceptionId)
      .single();

    if (fetchError || !exception) {
      return NextResponse.json(
        { error: "Exception not found." },
        { status: 404 },
      );
    }

    if (exception.status !== "Open") {
      return NextResponse.json(
        { error: "Exception is no longer open." },
        { status: 409 },
      );
    }

    const resolvedAt = new Date().toISOString();

    if (action === "map") {
      const { error: lineError } = await supabase.from("order_line").insert({
        order_batch_id: exception.order_batch_id,
        customer_id: exception.customer_id,
        service_day: exception.service_day,
        menu_item_id: menuItemId,
        meal_name_raw: exception.raw_value,
        employee_ref: exception.employee_ref,
        quantity: 1,
        match_type: "Direct",
      });

      if (lineError) {
        throw new Error(`Failed to insert order line: ${lineError.message}`);
      }

      if (saveAsAlias) {
        const { error: aliasError } = await supabase.from("menu_item_alias").insert({
          menu_item_id: menuItemId,
          alias_text: exception.raw_value,
          // Key the alias on the decomposed meal core (what the matcher compares),
          // falling back to the raw value for older exceptions without a core.
          normalized_text: exception.meal_core ?? normalize(exception.raw_value),
        });

        if (aliasError) {
          throw new Error(`Failed to save alias: ${aliasError.message}`);
        }
      }

      const { error: updateError } = await supabase
        .from("order_exception")
        .update({
          resolved_item_id: menuItemId,
          status: "Resolved",
          resolved_by: "operator",
          resolved_at: resolvedAt,
        })
        .eq("id", exceptionId);

      if (updateError) {
        throw new Error(`Failed to resolve exception: ${updateError.message}`);
      }
    } else if (action === "drop") {
      const { error: updateError } = await supabase
        .from("order_exception")
        .update({
          status: "Resolved",
          resolved_by: "operator",
          resolved_at: resolvedAt,
        })
        .eq("id", exceptionId);

      if (updateError) {
        throw new Error(`Failed to resolve exception: ${updateError.message}`);
      }
    } else {
      const { error: updateError } = await supabase
        .from("order_exception")
        .update({ status: "AcceptedAsIs" })
        .eq("id", exceptionId);

      if (updateError) {
        throw new Error(`Failed to resolve exception: ${updateError.message}`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to resolve exception.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
