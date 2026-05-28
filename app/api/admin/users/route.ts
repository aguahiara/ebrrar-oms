import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  adminListUserProfiles,
  adminCreateUserProfile,
  logAuditEvent,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  await requireRole(["ebrrar_super_admin"]);

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const profiles = await adminListUserProfiles({ search, status });
  return NextResponse.json(profiles);
}

export async function POST(request: NextRequest) {
  const session = await requireRole(["ebrrar_super_admin"]);
  const body = await request.json();

  const profile = await adminCreateUserProfile(body);

  await logAuditEvent({
    event_type: "user_profile_created",
    actor_user_id: session.user.id,
    actor_role: session.selectedRole.role,
    target_type: "user_profile",
    target_id: profile.id,
    after: { email: profile.email, full_name: profile.full_name },
  });

  return NextResponse.json(profile, { status: 201 });
}
