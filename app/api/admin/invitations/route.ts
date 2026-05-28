import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { adminListInvitations, adminCreateInvitation, logAuditEvent } from "@/lib/auth";
import type { AppSession } from "@/lib/auth-types";

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

// ─── GET /api/admin/invitations ───────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const invitations = await adminListInvitations();
    return NextResponse.json(invitations);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list invitations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST /api/admin/invitations ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    const result = await adminCreateInvitation({
      ...body,
      invited_by: auth.session.user.id,
    });

    await logAuditEvent({
      event_type: "invitation_created",
      actor_user_id: auth.session.user.id,
      actor_role: auth.session.selectedRole.role,
      target_type: "invitation",
      target_id: result.invitation.id,
      after: { email: body.email, role: body.role, email_sent: result.emailSent },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create invitation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
