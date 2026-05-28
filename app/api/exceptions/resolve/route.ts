import { getAppSession } from "@/lib/auth";
import { normalize } from "@/lib/matchMeal";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type ResolveAction = "map" | "drop" | "accept";
type BulkScope = "service_day" | "all";

type ResolveBody = {
  exceptionId?: string;
  action?: ResolveAction;
  menuItemId?: string;
  saveAsAlias?: boolean;
  /** If true, apply the same correction to all similar Open exceptions. */
  applyToSimilar?: boolean;
  /** "service_day" (default) = same service day; "all" = any date. */
  scope?: BulkScope;
};

// ─── Helper: resolve one exception record ────────────────────────────────────

async function resolveOne(params: {
  exceptionId: string;
  action: ResolveAction;
  menuItemId?: string;
  resolvedAt: string;
  bulkApplied: boolean;
  sourceExceptionId: string | null;
  /** The full exception row, already fetched. */
  exception: {
    order_batch_id: string;
    customer_id: string;
    service_day: string;
    raw_value: string;
    employee_ref: string;
    meal_core: string | null;
  };
}): Promise<void> {
  const {
    exceptionId,
    action,
    menuItemId,
    resolvedAt,
    bulkApplied,
    sourceExceptionId,
    exception,
  } = params;

  if (action === "map") {
    if (!menuItemId) throw new Error("menuItemId is required for Map action.");

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
    if (lineError)
      throw new Error(`Failed to insert order line: ${lineError.message}`);

    const { error: updateError } = await supabase
      .from("order_exception")
      .update({
        resolved_item_id: menuItemId,
        status: "Resolved",
        resolved_by: "operator",
        resolved_at: resolvedAt,
        bulk_applied: bulkApplied,
        source_exception_id: sourceExceptionId,
      })
      .eq("id", exceptionId);
    if (updateError)
      throw new Error(`Failed to resolve exception: ${updateError.message}`);
  } else if (action === "drop") {
    const { error: updateError } = await supabase
      .from("order_exception")
      .update({
        status: "Resolved",
        resolved_by: "operator",
        resolved_at: resolvedAt,
        bulk_applied: bulkApplied,
        source_exception_id: sourceExceptionId,
      })
      .eq("id", exceptionId);
    if (updateError)
      throw new Error(`Failed to resolve exception: ${updateError.message}`);
  } else {
    // accept
    const { error: updateError } = await supabase
      .from("order_exception")
      .update({
        status: "AcceptedAsIs",
        resolved_by: "operator",
        resolved_at: resolvedAt,
        bulk_applied: bulkApplied,
        source_exception_id: sourceExceptionId,
      })
      .eq("id", exceptionId);
    if (updateError)
      throw new Error(`Failed to resolve exception: ${updateError.message}`);
  }
}

// ─── POST /api/exceptions/resolve ────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as ResolveBody;
    const {
      exceptionId,
      action,
      menuItemId,
      saveAsAlias = false,
      applyToSimilar = false,
      scope = "service_day",
    } = body;

    // ── Validate input ───────────────────────────────────────────────────────
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

    // ── Fetch the primary exception ──────────────────────────────────────────
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

    // ── Resolve the primary exception ────────────────────────────────────────
    await resolveOne({
      exceptionId,
      action,
      menuItemId,
      resolvedAt,
      bulkApplied: false,
      sourceExceptionId: null,
      exception,
    });

    let affected = 1;

    // ── Save alias (once, for the primary exception's raw value) ─────────────
    if (action === "map" && saveAsAlias && menuItemId) {
      const { error: aliasError } = await supabase
        .from("menu_item_alias")
        .insert({
          menu_item_id: menuItemId,
          alias_text: exception.raw_value,
          normalized_text:
            exception.meal_core ?? normalize(exception.raw_value),
        });
      if (aliasError) {
        throw new Error(`Failed to save alias: ${aliasError.message}`);
      }
    }

    // ── Bulk: apply the same correction to similar Open exceptions ───────────
    if (applyToSimilar) {
      // Find all similar Open exceptions for the same customer.
      // Similarity criteria (server-enforced):
      //   • same customer_id
      //   • same exception_type
      //   • same raw_value (exact)
      //   • status = "Open"
      //   • not the exception we just resolved
      //   • (when scope = "service_day") same service_day
      let similarQuery = supabase
        .from("order_exception")
        .select("id, order_batch_id, customer_id, service_day, raw_value, employee_ref, meal_core")
        .eq("customer_id", exception.customer_id)
        .eq("exception_type", exception.exception_type)
        .eq("raw_value", exception.raw_value)
        .eq("status", "Open")
        .neq("id", exceptionId);

      if (scope === "service_day") {
        similarQuery = similarQuery.eq("service_day", exception.service_day);
      }

      const { data: similar, error: similarError } = await similarQuery;
      if (similarError) {
        throw new Error(
          `Failed to find similar exceptions: ${similarError.message}`,
        );
      }

      for (const sim of similar ?? []) {
        await resolveOne({
          exceptionId: sim.id,
          action,
          menuItemId,
          resolvedAt,
          bulkApplied: true,
          sourceExceptionId: exceptionId,
          exception: {
            order_batch_id: sim.order_batch_id,
            customer_id: sim.customer_id,
            service_day: sim.service_day,
            raw_value: sim.raw_value,
            employee_ref: sim.employee_ref,
            meal_core: sim.meal_core,
          },
        });
        affected += 1;
      }
    }

    return NextResponse.json({ ok: true, affected });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to resolve exception.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
