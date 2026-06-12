import { NextRequest, NextResponse } from "next/server";
import { getAppSession, adminCancelInvitation, adminResendInvitation, logAuditEvent } from "@/lib/auth";

interface Params {
  params: Promise<{ id: string }>;
}

async function requireSuperAdmin(session: Awaited<ReturnType<typeof getAppSession>>) {
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.selectedRole.role !== "ebrrar_super_admin") {
    return NextResponse.json({ error: "Forbidden: Super Admin role required." }, { status: 403 });
  }
  return null;
}

/**
 * POST /api/admin/invitations/[id]
 *
 * Supported actions:
 *   { action: "cancel" }  — marks a pending invitation as cancelled
 *   { action: "resend" }  — cancels the old record and sends a fresh invite email
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAppSession();
  const deny = await requireSuperAdmin(session);
  if (deny) return deny;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    if (body.action === "cancel") {
      await adminCancelInvitation(id, session!.user.id);
      await logAuditEvent({
        event_type: "invitation_cancelled",
        actor_user_id: session!.user.id,
        actor_role: session!.selectedRole.role,
        target_type: "user_invitation",
        target_id: id,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "resend") {
      const { invitation, emailSent } = await adminResendInvitation(id, session!.user.id);
      await logAuditEvent({
        event_type: "invitation_resent",
        actor_user_id: session!.user.id,
        actor_role: session!.selectedRole.role,
        target_type: "user_invitation",
        target_id: id,
        after: { new_invitation_id: (invitation as { id: string }).id, email_sent: emailSent },
      });
      return NextResponse.json({ invitation, emailSent });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
