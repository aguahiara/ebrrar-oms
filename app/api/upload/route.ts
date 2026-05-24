import { parseAvonExcel } from "@/lib/avon-excel";
import { fetchAvonMenuItems } from "@/lib/avon-menu";
import {
  buildMatchSummary,
  persistAvonUpload,
  resolveAvonOrders,
} from "@/lib/avon-orders";
import { isCalendarDate } from "@/lib/calendar-date";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const serviceDay = formData.get("serviceDay");

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
    const orders = parseAvonExcel(buffer);
    const menuItems = await fetchAvonMenuItems();
    const resolved = resolveAvonOrders(orders, menuItems);
    const { linesInserted } = await persistAvonUpload({
      serviceDay,
      sourceFilename: file.name,
      orders: resolved,
    });
    const summary = buildMatchSummary(resolved);

    return NextResponse.json({
      ...summary,
      linesInserted,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process the Excel file.";

    const status = message.includes("Missing required column") ||
      message.includes("Workbook has no sheets") ||
      message.includes("Sheet is empty") ||
      message.includes("service day")
      ? 400
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
