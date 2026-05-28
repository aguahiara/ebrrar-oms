import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { adminListInvitations, adminCreateInvitation, logAuditEvent } from "@/lib/auth";

export async function GET() {
  await requireRole(["ebrrar_super_admin"]);
  const invitations = await adminListInvitations();
  return NextResponse.json(invitations);
}

export async function POST(request: NextRequest) {
  const session = await requireRole(["ebrrar_super_admin"]);
  const body = await request.json();

  const result = await adminCreateInvitation({
    ...body,
    invited_by: session.user.id,
  });

  await logAuditEvent({
    event_type: "invitation_created",
    actor_user_id: session.user.id,
    actor_role: session.selectedRole.role,
    target_type: "invitation",
    target_id: result.invitation.id,
    after: { email: body.email, role: body.role, email_sent: result.emailSent },
  });

  return NextResponse.json(result, { status: 201 });
}
