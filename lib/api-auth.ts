import "server-only";
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";
import type { AppSession } from "@/lib/auth-types";

/**
 * Wraps an API route handler with authentication.
 * Returns a 401 JSON response if the user is not authenticated.
 *
 * Usage:
 *   export const GET = withAuth(async (req, session) => { ... })
 */
export function withAuth<T extends unknown[]>(
  handler: (session: AppSession, ...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    const session = await getAppSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(session, ...args);
  };
}

/**
 * Wraps an API route handler with permission check.
 * Returns 401 if not authenticated, 403 if insufficient permission.
 *
 * Usage:
 *   export const POST = withPermission("manage_orders", async (req, session) => { ... })
 */
export function withPermission<T extends unknown[]>(
  permission: Permission,
  handler: (session: AppSession, ...args: T) => Promise<NextResponse>,
) {
  return async (...args: T): Promise<NextResponse> => {
    const session = await getAppSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.selectedRole.role, permission)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(session, ...args);
  };
}
