/**
 * POST /api/upload/preview
 *
 * Runs the full parse → resolve pipeline but stops before persistUpload.
 * No rows are inserted into order_line, order_exception, or any other table.
 *
 * Returns an UploadPreview object that the upload page renders in a
 * "Preview before import" panel.  The user then clicks "Confirm Import"
 * to POST the same file to /api/upload (which runs the full pipeline
 * including persistUpload).
 *
 * Accepts the same FormData fields as /api/upload:
 *   file        — .xlsx file
 *   serviceDay  — YYYY-MM-DD (Monday of service week)
 *   customer    — customer display name (defaults to "AVON")
 */

import { getAppSession } from "@/lib/auth";
import {
  fetchAliases,
  fetchMenuItems,
  fetchProteins,
  fetchSwallows,
} from "@/lib/avon-menu";
import { buildMatchSummary, resolveOrders } from "@/lib/avon-orders";
import { isCalendarDate } from "@/lib/calendar-date";
import {
  getParserByFormat,
  getParserLabel,
  getWorkbookSheetNames,
  parseWithConfig,
} from "@/lib/parsers";
import { fetchActiveUploadConfig } from "@/lib/upload-config";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    // ── Fetch customer ────────────────────────────────────────────────────────
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

    // ── Workbook info (sheet names, for preview display) ──────────────────────
    const sheetsDetected = getWorkbookSheetNames(buffer);

    // ── Parser resolution (same logic as /api/upload) ─────────────────────────
    const uploadConfig = await fetchActiveUploadConfig(customerRow.id as string);

    const effectiveParserType = uploadConfig
      ? uploadConfig.parserType
      : (customerRow.parser_format as string | null) ?? "(none)";
    const parserLabel = getParserLabel(effectiveParserType);

    const orders = uploadConfig
      ? parseWithConfig(buffer, uploadConfig)
      : getParserByFormat(customerRow.parser_format as string | null)(buffer);

    const rowsDetected = orders.length;

    // ── Resolve against menu (same logic as /api/upload) ──────────────────────
    const [menuItems, aliases, proteins, swallows] = await Promise.all([
      fetchMenuItems(customer, serviceDay),
      fetchAliases(customer, serviceDay),
      fetchProteins(customer, serviceDay),
      fetchSwallows(customer, serviceDay),
    ]);

    const resolved = await resolveOrders(
      orders,
      menuItems,
      aliases,
      proteins,
      swallows,
    );

    // ── Build summary (same as /api/upload, but no persistUpload) ─────────────
    const summary = buildMatchSummary(resolved);

    // ── Duplicate warning: count employees that already have lines for this week
    let duplicateWarnings = 0;
    try {
      const employeeRefs = orders.map((o) => o.employeeName);
      const { data: existingLines } = await supabase
        .from("order_line")
        .select("employee_ref")
        .eq("customer_id", customerRow.id as string)
        .eq("service_day", serviceDay)
        .in("employee_ref", employeeRefs);

      const existingRefs = new Set(
        (existingLines ?? []).map((r) => r.employee_ref as string),
      );
      duplicateWarnings = orders.filter((o) =>
        existingRefs.has(o.employeeName),
      ).length;
    } catch {
      // Best-effort — if it fails, just show 0
    }

    return NextResponse.json({
      // Meta
      customerName: customer,
      parserType: effectiveParserType,
      parserLabel,
      serviceWeek: serviceDay,
      sheetsDetected,
      rowsDetected,
      // Match summary
      ...summary,
      // Extras
      duplicateWarnings,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to preview the Excel file.";

    const status =
      message.includes("Missing required column") ||
      message.includes("Workbook has no sheets") ||
      message.includes("Sheet is empty") ||
      message.includes("service day") ||
      message.includes("No upload parser registered") ||
      message.includes("header row") ||
      message.includes("not found in header") ||
      message.includes("No weekday sheets found") ||
      message.includes("No valid summary rows")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
