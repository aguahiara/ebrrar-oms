import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PARSER_FORMAT_OPTIONS } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_FORMATS = new Set(PARSER_FORMAT_OPTIONS.map((o) => o.value));
const VALID_STATUSES = new Set(["Active", "Inactive"]);

type PatchBody = {
  displayName?: string;
  customerCode?: string | null;
  status?: string;
  parserFormat?: string | null;
  notes?: string | null;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(session.selectedRole.role, "manage_customers")) {
    return NextResponse.json(
      { error: "You do not have permission to edit customers." },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;

    if (
      body.displayName !== undefined &&
      !String(body.displayName).trim()
    ) {
      return NextResponse.json(
        { error: "Customer name cannot be empty." },
        { status: 400 },
      );
    }

    // null is allowed (clears the parser format); validate only non-null values.
    if (
      body.parserFormat !== undefined &&
      body.parserFormat !== null &&
      !VALID_FORMATS.has(body.parserFormat)
    ) {
      return NextResponse.json(
        { error: "Invalid order file format." },
        { status: 400 },
      );
    }

    if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: "Status must be Active or Inactive." },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.displayName !== undefined)
      update.display_name = String(body.displayName).trim();
    if (body.customerCode !== undefined)
      update.customer_code = body.customerCode;
    if (body.status !== undefined) update.status = body.status;
    if (body.parserFormat !== undefined)
      update.parser_format = body.parserFormat;
    if (body.notes !== undefined) update.notes = body.notes;

    const { error } = await supabase
      .from("customer")
      .update(update)
      .eq("id", id);

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json(
          { error: "A customer with that name already exists." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
