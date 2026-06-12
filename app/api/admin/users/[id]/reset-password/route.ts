import { NextRequest, NextResponse } from "next/server";
import { getAppSession, adminGetUserProfileWithRoles, adminResetUserPassword, logAuditEvent } from "@/lib/auth";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Sends a Supabase password recovery email to the user.
 * The recovery link goes to the user's inbox — it is never returned to the caller.
 * Only ebrrar_super_admin may trigger this action.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.selectedRole.role !== "ebrrar_super_admin") {
    return NextResponse.json({ error: "Forbidden: Super Admin role required." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const profile = await adminGetUserProfileWithRoles(id);
    if (!profile) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    await adminResetUserPassword(profile.email);

    await logAuditEvent({
      event_type: "password_reset_triggered",
      actor_user_id: session.user.id,
      actor_role: session.selectedRole.role,
      target_type: "user_profile",
      target_id: id,
      after: { email: profile.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
