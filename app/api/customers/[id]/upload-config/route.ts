/**
 * GET  /api/customers/[id]/upload-config
 *   Returns the active customer_upload_config row for this customer, or null.
 *
 * PUT  /api/customers/[id]/upload-config
 *   Body { formatName, parserType, config }
 *     → deactivates any existing active row, inserts a new one.
 *   Body { deactivate: true }
 *     → deactivates any existing active row without inserting a new one.
 *
 * Both operations require the `manage_customers` permission.
 */

import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import type { ConfigurableParserType } from "@/lib/upload-config";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_PARSER_TYPES = new Set<ConfigurableParserType>([
  "single_sheet_weekly_grid",
  "multi_sheet_daily_form",
  "multi_sheet_daily_remarks",
  "summary_quantity_format",
  "single_sheet_weekly_grid_with_reference_menu",
]);

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from("customer_upload_config")
      .select(
        "id, customer_id, format_name, parser_type, is_active, config, created_at, updated_at",
      )
      .eq("customer_id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      // Table may not exist yet (migration not applied) — return null gracefully.
      return NextResponse.json({ config: null });
    }

    if (!data) return NextResponse.json({ config: null });

    return NextResponse.json({
      config: {
        id:         data.id as string,
        customerId: data.customer_id as string,
        formatName: data.format_name as string,
        parserType: data.parser_type as ConfigurableParserType,
        isActive:   data.is_active as boolean,
        config:     (data.config ?? {}) as Record<string, unknown>,
        createdAt:  data.created_at as string,
        updatedAt:  (data.updated_at as string | null) ?? null,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch upload config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

type PutBody =
  | { deactivate: true }
  | {
      formatName: string;
      parserType: string;
      config: Record<string, unknown>;
    };

export async function PUT(request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.selectedRole.role, "manage_customers")) {
    return NextResponse.json(
      { error: "You do not have permission to configure customer upload formats." },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as PutBody;

    // ── Deactivate all existing active configs ──────────────────────────────
    const { error: deactivateError } = await supabase
      .from("customer_upload_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("customer_id", id)
      .eq("is_active", true);

    if (deactivateError) {
      // If the table doesn't exist, this will fail — handle gracefully only if
      // we're in "deactivate only" mode.
      if ("deactivate" in body && body.deactivate) {
        return NextResponse.json({ ok: true });
      }
      throw new Error(deactivateError.message);
    }

    // ── Deactivate-only mode ────────────────────────────────────────────────
    if ("deactivate" in body && body.deactivate) {
      return NextResponse.json({ ok: true });
    }

    // ── Insert new config ───────────────────────────────────────────────────
    const putBody = body as Exclude<PutBody, { deactivate: true }>;

    if (!putBody.formatName?.trim()) {
      return NextResponse.json(
        { error: "Format name is required." },
        { status: 400 },
      );
    }

    if (!VALID_PARSER_TYPES.has(putBody.parserType as ConfigurableParserType)) {
      return NextResponse.json(
        { error: `Invalid parser type: "${putBody.parserType}".` },
        { status: 400 },
      );
    }

    const { error: insertError } = await supabase
      .from("customer_upload_config")
      .insert({
        customer_id: id,
        format_name: putBody.formatName.trim(),
        parser_type: putBody.parserType,
        is_active:   true,
        config:      putBody.config ?? {},
        created_by:  session.user?.email ?? null,
      });

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save upload config.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
