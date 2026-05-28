import {
  createPortionProfile,
  fetchPortionProfiles,
} from "@/lib/portion-profiles";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const profiles = await fetchPortionProfiles({ customerId, status });
    return NextResponse.json(profiles);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profiles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { customer_id, name, effective_from, effective_to, default_overage_percentage, notes } =
      body;

    if (!customer_id || !name?.trim() || !effective_from) {
      return NextResponse.json(
        { error: "customer_id, name, and effective_from are required." },
        { status: 400 },
      );
    }

    const profile = await createPortionProfile({
      customer_id,
      name: name.trim(),
      effective_from,
      effective_to: effective_to ?? null,
      default_overage_percentage: Number(default_overage_percentage ?? 0),
      notes: notes ?? null,
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
