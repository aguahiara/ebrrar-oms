import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  adminGetUserProfileWithRoles,
  adminUpdateUserProfile,
  adminAssignRole,
  adminDeactivateRole,
  logAuditEvent,
} from "@/lib/auth";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  await requireRole(["ebrrar_super_admin"]);
  const { id } = await params;
  const data = await adminGetUserProfileWithRoles(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireRole(["ebrrar_super_admin"]);
  const { id } = await params;
  const updates = await request.json();

  const profile = await adminUpdateUserProfile(id, updates);

  await logAuditEvent({
    event_type: "user_profile_updated",
    actor_user_id: session.user.id,
    actor_role: session.selectedRole.role,
    target_type: "user_profile",
    target_id: id,
    after: updates,
  });

  return NextResponse.json(profile);
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireRole(["ebrrar_super_admin"]);
  const { id } = await params;
  const body = await request.json();

  if (body.action === "assign_role") {
    const assignment = await adminAssignRole({
      user_profile_id: id,
      ...body.role_input,
    });
    await logAuditEvent({
      event_type: "role_assigned",
      actor_user_id: session.user.id,
      actor_role: session.selectedRole.role,
      target_type: "user_profile",
      target_id: id,
      after: { role: assignment.role, customer_id: assignment.customer_id },
    });
    return NextResponse.json(assignment, { status: 201 });
  }

  if (body.action === "deactivate_role") {
    await adminDeactivateRole(body.role_assignment_id);
    await logAuditEvent({
      event_type: "role_deactivated",
      actor_user_id: session.user.id,
      actor_role: session.selectedRole.role,
      target_type: "role_assignment",
      target_id: body.role_assignment_id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
