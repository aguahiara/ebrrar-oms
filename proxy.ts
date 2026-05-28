import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (Next.js 16 replacement for middleware.ts).
 *
 * Performs a lightweight, optimistic authentication check using the Supabase
 * session cookie — NO extra database queries are made here.
 *
 * Full, secure auth checks (getUser + role verification) happen inside the
 * authenticated layout and individual page guards (requireAuth/requireRole).
 * This proxy only handles the "definitely not logged in" fast-path redirect.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Create a Supabase server client that can refresh the session cookie ──
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getSession() reads the JWT from the cookie — no network call, fast.
  // It is "optimistic": the full verifying check (getUser) happens server-side.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ── 2. Public paths — always allowed ──────────────────────────────────────
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/unauthorized");

  if (isPublic) {
    // Logged-in users hitting /login get sent to role selection
    if (session && pathname === "/login") {
      return NextResponse.redirect(new URL("/select-role", request.url));
    }
    return response;
  }

  // ── 3. Require auth for everything else ───────────────────────────────────
  if (!session) {
    // API routes must get a JSON error — never an HTML redirect.
    // Redirecting /api/* to /login would cause browser fetch() to follow the
    // redirect, receive the HTML login page, and then fail with
    // "Unexpected token '<'" (or "Unexpected end of JSON input") when the
    // caller calls response.json().
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── 4. Root redirect → role-based landing is handled by app/page.tsx ──────
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, robots.txt, sitemap.xml
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
