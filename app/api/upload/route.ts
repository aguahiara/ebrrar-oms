import { getAppSession } from "@/lib/auth";
import {
  fetchAliases,
  fetchMenuItems,
  fetchProteins,
  fetchSwallows,
} from "@/lib/avon-menu";
import {
  buildMatchSummary,
  persistUpload,
  resolveOrders,
} from "@/lib/avon-orders";
import { isCalendarDate } from "@/lib/calendar-date";
import { getParserByFormat } from "@/lib/parsers";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const serviceDay = formData.get("serviceDay");
    const customerField = formData.get("customer");
    const customer =
      typeof customerField === "string" && customerField.trim() !== ""
        ? customerField.trim()
        : "AVON";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (typeof serviceDay !== "string" || !isCalendarDate(serviceDay)) {
      return NextResponse.json(
        { error: "A valid service day (YYYY-MM-DD) is required." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are allowed." },
        { status: 400 },
      );
    }

    const { data: customerRow } = await supabase
      .from("customer")
      .select("id, parser_format")
      .eq("display_name", customer)
      .maybeSingle();

    if (!customerRow) {
      return NextResponse.json(
        { error: `Customer ${customer} not found.` },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parse = getParserByFormat(customerRow.parser_format);
    const orders = parse(buffer);
    const [menuItems, aliases, proteins, swallows] = await Promise.all([
      fetchMenuItems(customer),
      fetchAliases(customer),
      fetchProteins(customer),
      fetchSwallows(customer),
    ]);
    const resolved = await resolveOrders(
      orders,
      menuItems,
      aliases,
      proteins,
      swallows,
    );
    const { batchId, linesInserted, exceptionsInserted, duplicatesSkipped } =
      await persistUpload({
        customerDisplayName: customer,
        serviceDay,
        sourceFilename: file.name,
        orders: resolved,
      });
    const summary = buildMatchSummary(resolved);

    return NextResponse.json({
      ...summary,
      batchId,
      linesInserted,
      exceptionsInserted,
      duplicatesSkipped,
      customerId: customerRow.id as string,
      customerName: customer,
      serviceDay,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process the Excel file.";

    const status = message.includes("Missing required column") ||
      message.includes("Workbook has no sheets") ||
      message.includes("Sheet is empty") ||
      message.includes("service day") ||
      message.includes("No upload parser registered")
      ? 400
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
