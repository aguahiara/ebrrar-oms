import { getAppSession } from "@/lib/auth";
import { normalize } from "@/lib/matchMeal";
import { PROTEIN_EXCEPTION_TYPE } from "@/lib/avon-orders";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type ResolveAction = "map" | "drop" | "accept";
type BulkScope = "service_day" | "all";

type ResolveBody = {
  exceptionId?: string;
  action?: ResolveAction;
  menuItemId?: string;
  /** For "Protein not recognised" exceptions — the canonical protein name to assign. */
  proteinName?: string;
  saveAsAlias?: boolean;
  /**
   * For "Protein not recognised" exceptions — when true, mark the matched menu
   * item's protein_requirement as "not_required" so future uploads for this meal
   * never create a protein exception.
   */
  saveAsNotRequired?: boolean;
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
  proteinName?: string;
  saveAsNotRequired?: boolean;
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
    exception_type: string;
  };
}): Promise<void> {
  const {
    exceptionId,
    action,
    menuItemId,
    proteinName,
    saveAsNotRequired = false,
    resolvedAt,
    bulkApplied,
    sourceExceptionId,
    exception,
  } = params;

  // ── Protein-exception path: update the existing order_line, never insert ──
  if (exception.exception_type === PROTEIN_EXCEPTION_TYPE) {
    // Find the order_line that corresponds to this exception by batch + employee + day.
    const { data: orderLine, error: lineErr } = await supabase
      .from("order_line")
      .select("id, menu_item_id")
      .eq("order_batch_id", exception.order_batch_id)
      .eq("customer_id", exception.customer_id)
      .eq("service_day", exception.service_day)
      .eq("employee_ref", exception.employee_ref)
      .maybeSingle();

    if (lineErr)
      throw new Error(`Failed to find order line for protein exception: ${lineErr.message}`);

    if (orderLine) {
      // "map" → set the chosen protein. "drop" / "accept" → sentinel so Guard 4
      // (protein_name IS NULL) clears without requiring a real protein value.
      const newProteinName =
        action === "map" && proteinName ? proteinName : "(No protein)";

      const { error: updateErr } = await supabase
        .from("order_line")
        .update({ protein_name: newProteinName })
        .eq("id", orderLine.id);

      if (updateErr)
        throw new Error(`Failed to update protein on order line: ${updateErr.message}`);

      // When the operator marks the meal as "protein not required", update the
      // menu_item permanently so future uploads never create this exception again.
      if (saveAsNotRequired && orderLine.menu_item_id) {
        const { error: menuItemErr } = await supabase
          .from("menu_item")
          .update({ protein_requirement: "not_required" })
          .eq("id", orderLine.menu_item_id);

        if (menuItemErr)
          throw new Error(
            `Failed to update protein_requirement on menu item: ${menuItemErr.message}`,
          );
      }
    }

    // Mark the exception resolved/accepted
    const newStatus = action === "accept" ? "AcceptedAsIs" : "Resolved";
    const { error: exErr } = await supabase
      .from("order_exception")
      .update({
        status: newStatus,
        resolved_by: "operator",
        resolved_at: resolvedAt,
        bulk_applied: bulkApplied,
        source_exception_id: sourceExceptionId,
      })
      .eq("id", exceptionId);

    if (exErr) throw new Error(`Failed to resolve exception: ${exErr.message}`);
    return;
  }

  // ── Standard meal-exception path ──────────────────────────────────────────
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
      proteinName,
      saveAsAlias = false,
      saveAsNotRequired = false,
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
    if (action === "map" && !menuItemId && !proteinName) {
      return NextResponse.json(
        { error: "menuItemId (or proteinName for protein exceptions) is required for Map." },
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
      proteinName,
      saveAsNotRequired,
      resolvedAt,
      bulkApplied: false,
      sourceExceptionId: null,
      exception: {
        order_batch_id: exception.order_batch_id,
        customer_id: exception.customer_id,
        service_day: exception.service_day,
        raw_value: exception.raw_value,
        employee_ref: exception.employee_ref,
        meal_core: exception.meal_core,
        exception_type: exception.exception_type as string,
      },
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
      type SimilarRow = {
        id: string;
        order_batch_id: string;
        customer_id: string;
        service_day: string;
        raw_value: string;
        employee_ref: string;
        meal_core: string | null;
        exception_type: string;
      };

      let similar: SimilarRow[] = [];

      if (exception.exception_type === PROTEIN_EXCEPTION_TYPE) {
        // ── Protein exceptions: group by menu_item_id, NOT raw_value ─────────
        //
        // raw_value for a protein exception is the meal text (e.g. "Chicken &
        // Rice").  While it is often the same across employees, the correct
        // grouping criterion is the matched menu item, because:
        //   • multiple raw texts may map to the same canonical meal
        //   • using menu_item_id avoids any text-normalisation gaps
        //
        // Algorithm (2 queries + in-process join, no N+1):
        //   1. Fetch the menu_item_id from the primary exception's order_line.
        //   2. Fetch all order_lines for that menu_item_id where protein is
        //      still NULL (= still needs a protein exception resolved).
        //   3. Fetch all open protein exceptions for the customer/scope.
        //   4. Inner-join on (order_batch_id, employee_ref, service_day).

        // Step 1 — look up primary exception's order_line
        const { data: primaryLine, error: primaryLineErr } = await supabase
          .from("order_line")
          .select("menu_item_id")
          .eq("order_batch_id", exception.order_batch_id)
          .eq("customer_id", exception.customer_id)
          .eq("service_day", exception.service_day)
          .eq("employee_ref", exception.employee_ref)
          .maybeSingle();

        if (primaryLineErr) {
          throw new Error(`Bulk protein: failed to look up primary order line: ${primaryLineErr.message}`);
        }

        const targetMenuItemId = primaryLine?.menu_item_id as string | null;

        if (targetMenuItemId) {
          // Step 2 — order_lines for same menu_item_id with protein still null
          let linesQuery = supabase
            .from("order_line")
            .select("order_batch_id, employee_ref, service_day")
            .eq("customer_id", exception.customer_id)
            .eq("menu_item_id", targetMenuItemId)
            .is("protein_name", null);

          if (scope === "service_day") {
            linesQuery = linesQuery.eq("service_day", exception.service_day);
          }

          const { data: matchingLines, error: linesErr } = await linesQuery;
          if (linesErr) {
            throw new Error(`Bulk protein: failed to fetch matching order lines: ${linesErr.message}`);
          }

          if (matchingLines && matchingLines.length > 0) {
            // Build a lookup keyed by NUL-delimited composite key
            const lineKeys = new Set(
              matchingLines.map(
                (l) => `${l.order_batch_id}\x00${l.employee_ref}\x00${l.service_day}`,
              ),
            );

            // Step 3 — open protein exceptions for this customer (+ scope)
            let exceptionsQuery = supabase
              .from("order_exception")
              .select(
                "id, order_batch_id, customer_id, service_day, raw_value, employee_ref, meal_core, exception_type",
              )
              .eq("customer_id", exception.customer_id)
              .eq("exception_type", PROTEIN_EXCEPTION_TYPE)
              .eq("status", "Open")
              .neq("id", exceptionId);

            if (scope === "service_day") {
              exceptionsQuery = exceptionsQuery.eq("service_day", exception.service_day);
            }

            const { data: candidates, error: candidatesErr } = await exceptionsQuery;
            if (candidatesErr) {
              throw new Error(`Bulk protein: failed to fetch candidate exceptions: ${candidatesErr.message}`);
            }

            // Step 4 — keep only exceptions whose order_line key matches
            similar = ((candidates ?? []) as SimilarRow[]).filter((ex) =>
              lineKeys.has(
                `${ex.order_batch_id}\x00${ex.employee_ref}\x00${ex.service_day}`,
              ),
            );
          }
        } else {
          // Fallback when order_line lookup fails (shouldn't normally happen):
          // use raw_value so at least obvious duplicates on the same day get caught.
          let fallbackQuery = supabase
            .from("order_exception")
            .select(
              "id, order_batch_id, customer_id, service_day, raw_value, employee_ref, meal_core, exception_type",
            )
            .eq("customer_id", exception.customer_id)
            .eq("exception_type", exception.exception_type)
            .eq("raw_value", exception.raw_value)
            .eq("status", "Open")
            .neq("id", exceptionId);

          if (scope === "service_day") {
            fallbackQuery = fallbackQuery.eq("service_day", exception.service_day);
          }

          const { data: fallbackSimilar, error: fallbackErr } = await fallbackQuery;
          if (fallbackErr) {
            throw new Error(`Bulk protein (fallback): failed to find similar exceptions: ${fallbackErr.message}`);
          }
          similar = (fallbackSimilar ?? []) as SimilarRow[];
        }
      } else {
        // ── Meal exceptions: original raw_value matching ──────────────────────
        //
        // Similarity criteria:
        //   • same customer_id
        //   • same exception_type
        //   • same raw_value (exact)
        //   • status = "Open"
        //   • not the exception we just resolved
        //   • (when scope = "service_day") same service_day
        let similarQuery = supabase
          .from("order_exception")
          .select(
            "id, order_batch_id, customer_id, service_day, raw_value, employee_ref, meal_core, exception_type",
          )
          .eq("customer_id", exception.customer_id)
          .eq("exception_type", exception.exception_type)
          .eq("raw_value", exception.raw_value)
          .eq("status", "Open")
          .neq("id", exceptionId);

        if (scope === "service_day") {
          similarQuery = similarQuery.eq("service_day", exception.service_day);
        }

        const { data: foundSimilar, error: similarError } = await similarQuery;
        if (similarError) {
          throw new Error(`Failed to find similar exceptions: ${similarError.message}`);
        }
        similar = (foundSimilar ?? []) as SimilarRow[];
      }

      for (const sim of similar) {
        await resolveOne({
          exceptionId: sim.id,
          action,
          menuItemId,
          proteinName,
          // saveAsNotRequired is intentionally NOT propagated to bulk copies:
          // the menu_item was already updated for the primary exception, and
          // we don't want to re-run the update N times unnecessarily.
          saveAsNotRequired: false,
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
            exception_type: sim.exception_type,
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
