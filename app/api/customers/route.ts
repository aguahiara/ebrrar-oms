import { fetchActiveCustomerNames } from "@/lib/customers";
import { PARSER_FORMAT_OPTIONS, getParserLabel } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

const VALID_FORMATS = new Set(PARSER_FORMAT_OPTIONS.map((o) => o.value));

export async function GET() {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // ── Active customer names (existing behaviour, unchanged) ─────────────────
    const customers = await fetchActiveCustomerNames();

    // ── Per-customer format info (new — for upload page format display) ────────
    // Fetch parser_format from customer table and active configurable configs.
    // Failures here are non-fatal: we just omit the extra info.
    let customerFormats: Record<
      string,
      { label: string | null; parserType: string | null; hasConfig: boolean; configured: boolean }
    > = {};

    try {
      const [customersRes, configsRes] = await Promise.all([
        supabase
          .from("customer")
          .select("display_name, parser_format")
          .in("display_name", customers),
        supabase
          .from("customer_upload_config")
          .select(
            "customer_id, format_name, parser_type, customer:customer_id(display_name)",
          )
          .eq("is_active", true),
      ]);

      // Build a map of customer_id → configurable config info
      const configById = new Map<
        string,
        { formatName: string; parserType: string }
      >();
      for (const row of configsRes.data ?? []) {
        configById.set(row.customer_id as string, {
          formatName: row.format_name as string,
          parserType: row.parser_type as string,
        });
      }

      // Build a map of customer display_name → id for the join
      const idByName = new Map<string, string>();
      for (const row of customersRes.data ?? []) {
        idByName.set(row.display_name as string, ""); // will be unused, we need id
      }

      // Re-fetch with id so we can look up configs
      const { data: withIds } = await supabase
        .from("customer")
        .select("id, display_name, parser_format")
        .in("display_name", customers);

      for (const row of withIds ?? []) {
        const name = row.display_name as string;
        const configEntry = configById.get(row.id as string);

        if (configEntry) {
          // Configurable format takes precedence
          customerFormats[name] = {
            label: getParserLabel(configEntry.parserType),
            parserType: configEntry.parserType,
            hasConfig: true,
            configured: true,
          };
        } else if (row.parser_format) {
          // Legacy parser_format
          customerFormats[name] = {
            label: getParserLabel(row.parser_format as string),
            parserType: row.parser_format as string,
            hasConfig: false,
            configured: true,
          };
        } else {
          // No format configured
          customerFormats[name] = {
            label: null,
            parserType: null,
            hasConfig: false,
            configured: false,
          };
        }
      }
    } catch {
      // Non-fatal: return customers without format info
    }

    return NextResponse.json({ customers, customerFormats });
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

    // parserFormat is optional — a customer can be created without one and
    // have a customer_upload_config added later via the configurable engine.
    if (parserFormat && !VALID_FORMATS.has(parserFormat)) {
      return NextResponse.json(
        { error: "Invalid file format. Use a value from the supported formats list." },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("customer").insert({
      display_name: displayName.trim(),
      parser_format: parserFormat ?? null,
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
