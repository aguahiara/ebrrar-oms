import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SELECTED_ROLE_COOKIE,
  SELECTED_CUSTOMER_COOKIE,
  getCurrentUser,
  getCurrentUserProfile,
  getActiveRoleAssignments,
} from "@/lib/auth";

/**
 * POST /api/auth/select-role
 * Body: { assignment_id: string }
 *
 * Validates that the authenticated user actually owns the requested
 * role_assignment, then sets the role + customer-scope cookies.
 *
 * Security model:
 * - The requested role is NEVER taken from the request body.
 * - Only the assignment UUID is accepted from the client.
 * - The server looks up the assignment from the database and verifies it
 *   belongs to the current user before writing any cookie.
 * - An attacker cannot self-assign ebrrar_super_admin or any other role
 *   by forging this request — if the assignment_id is not in their
 *   role_assignments, the server returns 403.
 */
export async function POST(request: NextRequest) {
  // 1. Parse body — only accept assignment_id, nothing else.
  let assignment_id: string | undefined;
  try {
    const body = (await request.json()) as { assignment_id?: unknown };
    if (typeof body.assignment_id === "string") {
      assignment_id = body.assignment_id;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
  }

  // 2. Verify the caller is authenticated.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Load the user's actual role assignments from the database.
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  const allRoles = await getActiveRoleAssignments(profile.id);

  // 4. Find the requested assignment — it must exist in the DB-loaded list.
  //    If the assignment_id is not in the user's own assignments, reject it.
  const chosen = allRoles.find((r) => r.id === assignment_id);
  if (!chosen) {
    return NextResponse.json(
      { error: "Role not available for your account" },
      { status: 403 },
    );
  }

  // 5. Write the cookies using the server-verified role values — never the
  //    client-supplied ones.
  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };

  cookieStore.set(SELECTED_ROLE_COOKIE, chosen.role, cookieOpts);

  if (chosen.customer_id) {
    cookieStore.set(SELECTED_CUSTOMER_COOKIE, chosen.customer_id, cookieOpts);
  } else {
    cookieStore.delete(SELECTED_CUSTOMER_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
