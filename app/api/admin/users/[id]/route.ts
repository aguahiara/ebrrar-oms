import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import {
  adminGetUserProfileWithRoles,
  adminUpdateUserProfile,
  adminAssignRole,
  adminDeactivateRole,
  logAuditEvent,
} from "@/lib/auth";
import type { AppSession } from "@/lib/auth-types";

interface Params {
  params: Promise<{ id: string }>;
}

// ─── Auth helper — JSON errors only, never redirect ───────────────────────────

async function requireAdminSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; response: NextResponse }
> {
  const session = await getAppSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.selectedRole.role !== "ebrrar_super_admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Super Admin role required." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session };
}

// ─── GET /api/admin/users/[id] ────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const data = await adminGetUserProfileWithRoles(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PATCH /api/admin/users/[id] ─────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const updates = await request.json();

    const profile = await adminUpdateUserProfile(id, updates);

    await logAuditEvent({
      event_type: "user_profile_updated",
      actor_user_id: auth.session.user.id,
      actor_role: auth.session.selectedRole.role,
      target_type: "user_profile",
      target_id: id,
      after: updates,
    });

    return NextResponse.json(profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST /api/admin/users/[id] — actions ────────────────────────────────────

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "assign_role") {
      const assignment = await adminAssignRole({
        user_profile_id: id,
        ...body.role_input,
      });
      await logAuditEvent({
        event_type: "role_assigned",
        actor_user_id: auth.session.user.id,
        actor_role: auth.session.selectedRole.role,
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
        actor_user_id: auth.session.user.id,
        actor_role: auth.session.selectedRole.role,
        target_type: "role_assignment",
        target_id: body.role_assignment_id,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
