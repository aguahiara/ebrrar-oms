import {
  fetchRecentProductionRuns,
  generateProductionQuantities,
  saveProductionQuantityRun,
} from "@/lib/production-quantities";
import { isCalendarDate } from "@/lib/calendar-date";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const runs = await fetchRecentProductionRuns(20);
    return NextResponse.json(runs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load runs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { service_day, customer_id, save } = body;

    if (!service_day || !isCalendarDate(service_day)) {
      return NextResponse.json(
        { error: "A valid service_day (YYYY-MM-DD) is required." },
        { status: 400 },
      );
    }

    const report = await generateProductionQuantities(
      service_day,
      customer_id ?? undefined,
    );

    let runId: string | null = null;
    if (save) {
      runId = await saveProductionQuantityRun(report);
    }

    return NextResponse.json({ ...report, run_id: runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quantities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
