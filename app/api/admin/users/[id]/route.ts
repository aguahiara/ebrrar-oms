import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import {
  adminGetUserProfileWithRoles,
  adminUpdateUserProfile,
  adminAssignRole,
  adminDeactivateRole,
  adminSuspendUser,
  adminReactivateUser,
  adminDeactivateUser,
  adminSetDefaultRole,
  adminCountActiveSuperAdmins,
  adminGetProfileIdForAuthUser,
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
    // Only allow safe profile fields — never accept status changes via PATCH;
    // those go through the POST actions below so guards can run.
    const body = await request.json();
    const safe: Record<string, unknown> = {};
    if ("full_name" in body) safe.full_name = body.full_name;
    if ("phone" in body) safe.phone = body.phone;
    // updated_by: record who made the change
    safe.updated_by = auth.session.user.id;

    const profile = await adminUpdateUserProfile(id, safe);

    await logAuditEvent({
      event_type: "user_profile_updated",
      actor_user_id: auth.session.user.id,
      actor_role: auth.session.selectedRole.role,
      target_type: "user_profile",
      target_id: id,
      after: safe,
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

  const { id } = await params;
  const actorId = auth.session.user.id;
  const actorRole = auth.session.selectedRole.role;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ── Shared safety helpers ────────────────────────────────────────────────

  // Prevent a Super Admin from performing destructive actions on their own account
  // unless another active Super Admin exists who can still manage the system.
  async function guardSelfAndLastSA(targetProfileId: string): Promise<NextResponse | null> {
    const actorProfileId = await adminGetProfileIdForAuthUser(actorId);
    const isSelf = actorProfileId === targetProfileId;

    const activeSACount = await adminCountActiveSuperAdmins();

    if (isSelf && activeSACount <= 1) {
      return NextResponse.json(
        {
          error:
            "You are the only active Super Admin. Assign another Super Admin before modifying your own account.",
        },
        { status: 422 },
      );
    }
    return null;
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  try {
    // ── assign_role ──────────────────────────────────────────────────────
    if (body.action === "assign_role") {
      const roleInput = body.role_input as Record<string, unknown> | undefined;
      if (!roleInput?.role) {
        return NextResponse.json({ error: "role_input.role is required." }, { status: 400 });
      }
      const assignment = await adminAssignRole({
        user_profile_id: id,
        role: roleInput.role as import("@/lib/auth-types").UserRole,
        customer_id: (roleInput.customer_id as string | null) ?? null,
        is_default: (roleInput.is_default as boolean | undefined) ?? false,
        effective_from: (roleInput.effective_from as string | undefined),
        effective_to: (roleInput.effective_to as string | null | undefined) ?? null,
      });
      await logAuditEvent({
        event_type: "role_assigned",
        actor_user_id: actorId,
        actor_role: actorRole,
        target_type: "user_profile",
        target_id: id,
        after: { role: assignment.role, customer_id: assignment.customer_id },
      });
      return NextResponse.json(assignment, { status: 201 });
    }

    // ── deactivate_role ──────────────────────────────────────────────────
    if (body.action === "deactivate_role") {
      const roleAssignmentId = body.role_assignment_id as string | undefined;
      if (!roleAssignmentId) {
        return NextResponse.json({ error: "role_assignment_id is required." }, { status: 400 });
      }
      // If deactivating a SA role, check last-SA rule
      const profileWithRoles = await adminGetUserProfileWithRoles(id);
      const targetRole = profileWithRoles?.roles.find((r) => r.id === roleAssignmentId);
      if (targetRole?.role === "ebrrar_super_admin" && targetRole.active) {
        const guard = await guardSelfAndLastSA(id);
        if (guard) return guard;
      }
      await adminDeactivateRole(roleAssignmentId);
      await logAuditEvent({
        event_type: "role_deactivated",
        actor_user_id: actorId,
        actor_role: actorRole,
        target_type: "role_assignment",
        target_id: roleAssignmentId,
        after: { user_profile_id: id },
      });
      return NextResponse.json({ ok: true });
    }

    // ── set_default_role ─────────────────────────────────────────────────
    if (body.action === "set_default_role") {
      const roleAssignmentId = body.role_assignment_id as string | undefined;
      if (!roleAssignmentId) {
        return NextResponse.json({ error: "role_assignment_id is required." }, { status: 400 });
      }
      await adminSetDefaultRole(id, roleAssignmentId, actorId, actorRole);
      return NextResponse.json({ ok: true });
    }

    // ── suspend ──────────────────────────────────────────────────────────
    if (body.action === "suspend") {
      // Guard: cannot suspend the last active SA (safeguard 4 & 5)
      const guard = await guardSelfAndLastSA(id);
      if (guard) return guard;

      await adminSuspendUser(id, actorId, actorRole);
      return NextResponse.json({ ok: true });
    }

    // ── reactivate ───────────────────────────────────────────────────────
    if (body.action === "reactivate") {
      await adminReactivateUser(id, actorId, actorRole);
      return NextResponse.json({ ok: true });
    }

    // ── deactivate ───────────────────────────────────────────────────────
    if (body.action === "deactivate") {
      // Guard: cannot deactivate the last active SA
      const guard = await guardSelfAndLastSA(id);
      if (guard) return guard;

      await adminDeactivateUser(id, actorId, actorRole);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
