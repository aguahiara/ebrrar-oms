import { fetchAliases, fetchMenuItems } from "@/lib/avon-menu";
import {
  buildMatchSummary,
  persistUpload,
  resolveOrders,
} from "@/lib/avon-orders";
import { isCalendarDate } from "@/lib/calendar-date";
import { getParser } from "@/lib/parsers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const parse = getParser(customer);
    const orders = parse(buffer);
    const [menuItems, aliases] = await Promise.all([
      fetchMenuItems(customer),
      fetchAliases(customer),
    ]);
    const resolved = await resolveOrders(orders, menuItems, aliases);
    const { linesInserted, exceptionsInserted } = await persistUpload({
      customerDisplayName: customer,
      serviceDay,
      sourceFilename: file.name,
      orders: resolved,
    });
    const summary = buildMatchSummary(resolved);

    return NextResponse.json({
      ...summary,
      linesInserted,
      exceptionsInserted,
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
