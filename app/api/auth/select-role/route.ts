import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SELECTED_ROLE_COOKIE, SELECTED_CUSTOMER_COOKIE } from "@/lib/auth";

/**
 * POST /api/auth/select-role
 * Body: { role: UserRole, customer_id: string | null }
 *
 * Sets the role and customer-scope cookies so the app shell reads the
 * correct role on subsequent requests.
 */
export async function POST(request: NextRequest) {
  const { role, customer_id } = (await request.json()) as {
    role: string;
    customer_id: string | null;
  };

  if (!role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };

  cookieStore.set(SELECTED_ROLE_COOKIE, role, cookieOpts);

  if (customer_id) {
    cookieStore.set(SELECTED_CUSTOMER_COOKIE, customer_id, cookieOpts);
  } else {
    cookieStore.delete(SELECTED_CUSTOMER_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
