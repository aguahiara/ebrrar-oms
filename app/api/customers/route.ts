import { fetchActiveCustomerNames } from "@/lib/customers";
import { PARSER_FORMAT_OPTIONS } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

const VALID_FORMATS = new Set(PARSER_FORMAT_OPTIONS.map((o) => o.value));

export async function GET() {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const customers = await fetchActiveCustomerNames();
    return NextResponse.json({ customers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load customers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  displayName?: string;
  parserFormat?: string;
};

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { displayName, parserFormat } = (await request.json()) as CreateBody;

    if (!displayName || !displayName.trim()) {
      return NextResponse.json(
        { error: "Customer name is required." },
        { status: 400 },
      );
    }

    if (!parserFormat || !VALID_FORMATS.has(parserFormat)) {
      return NextResponse.json(
        { error: "A valid file format is required." },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("customer").insert({
      display_name: displayName.trim(),
      parser_format: parserFormat,
      status: "Active",
    });

    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
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
      err instanceof Error ? err.message : "Failed to create customer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
