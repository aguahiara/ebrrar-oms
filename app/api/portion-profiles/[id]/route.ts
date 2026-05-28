import {
  activatePortionProfile,
  copyPortionProfile,
  fetchPortionProfileById,
  replacePortionComponents,
  updatePortionProfile,
  upsertPackagingProfile,
} from "@/lib/portion-profiles";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const profile = await fetchPortionProfileById(id);
    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();

    const { components, packaging, ...profileFields } = body;

    // Update profile header fields if any provided
    if (Object.keys(profileFields).length > 0) {
      await updatePortionProfile(id, profileFields);
    }

    // Replace components if provided
    if (Array.isArray(components)) {
      await replacePortionComponents(id, components);
    }

    // Upsert packaging if provided
    if (packaging && typeof packaging === "object") {
      await upsertPackagingProfile(id, packaging);
    }

    const updated = await fetchPortionProfileById(id);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === "activate") {
      const result = await activatePortionProfile(id);
      return NextResponse.json({ ok: true, supersededId: result.supersededId });
    }

    if (action === "deactivate") {
      await updatePortionProfile(id, { status: "Inactive" });
      return NextResponse.json({ ok: true });
    }

    if (action === "copy") {
      const { target_customer_id, new_name, effective_from } = body;
      if (!target_customer_id || !new_name?.trim() || !effective_from) {
        return NextResponse.json(
          { error: "target_customer_id, new_name, and effective_from are required." },
          { status: 400 },
        );
      }
      const copied = await copyPortionProfile({
        source_profile_id: id,
        target_customer_id,
        new_name: new_name.trim(),
        effective_from,
      });
      return NextResponse.json(copied, { status: 201 });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
