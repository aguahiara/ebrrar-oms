import { NextRequest, NextResponse } from "next/server";
import { getAppSession, adminListAuditEvents } from "@/lib/auth";

/**
 * GET /api/admin/audit
 *
 * Returns paginated audit events. Only ebrrar_super_admin may access this.
 *
 * Query params:
 *   targetId    — filter by target_id (UUID)
 *   actorUserId — filter by actor_user_id (UUID)
 *   eventType   — filter by event_type string
 *   page        — page number (default 1)
 *   pageSize    — items per page (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.selectedRole.role !== "ebrrar_super_admin") {
    return NextResponse.json({ error: "Forbidden: Super Admin role required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const opts = {
    targetId:    searchParams.get("targetId")    ?? undefined,
    actorUserId: searchParams.get("actorUserId") ?? undefined,
    eventType:   searchParams.get("eventType")   ?? undefined,
    page:        parseInt(searchParams.get("page")     ?? "1",  10),
    pageSize:    parseInt(searchParams.get("pageSize") ?? "50", 10),
  };

  try {
    const result = await adminListAuditEvents(opts);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load audit log.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
