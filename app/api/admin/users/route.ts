import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import {
  adminListUserProfiles,
  adminCreateUserProfile,
  logAuditEvent,
} from "@/lib/auth";
import type { AppSession } from "@/lib/auth-types";

// ─── Auth helper — returns JSON errors instead of redirecting ─────────────────
// Calling requireRole() (which uses redirect()) inside a route handler sends an
// HTML redirect to the client. fetch().json() then fails with
// "Unexpected end of JSON input".  This helper returns typed discriminated
// results so every branch always produces a JSON NextResponse.

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

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const profiles = await adminListUserProfiles({ search, status });
    return NextResponse.json(profiles);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST /api/admin/users ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const profile = await adminCreateUserProfile(body);

    await logAuditEvent({
      event_type: "user_profile_created",
      actor_user_id: auth.session.user.id,
      actor_role: auth.session.selectedRole.role,
      target_type: "user_profile",
      target_id: profile.id,
      after: { email: profile.email, full_name: profile.full_name },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
