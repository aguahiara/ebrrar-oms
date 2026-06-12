import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Handles the Supabase auth callback (magic link / OAuth / invite).
 *
 * After exchanging the code for a session we call two SECURITY DEFINER RPCs:
 *
 *   ensure_user_profile()             — creates the user_profiles row if missing
 *   accept_invitation_for_current_user() — wires up the role_assignment from any
 *                                         pending invitation for this email
 *
 * Both RPCs are SECURITY DEFINER (run as the postgres superuser) so they bypass
 * RLS even when SUPABASE_SERVICE_ROLE_KEY is misconfigured.  They are no-ops if
 * the profile / role already exist.
 *
 * Destination priority after a successful exchange:
 *   1. Explicit ?next= param (set by adminCreateInvitation's redirectTo).
 *   2. Invite fallback: if no ?next= but session.user.app_metadata.invited_at
 *      is set, send to /auth/set-password (user must set a password first).
 *   3. Default: /select-role for all other auth flows.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code        = searchParams.get("code");
  const tokenHash   = searchParams.get("token_hash");
  const tokenType   = searchParams.get("type") as
    | "recovery" | "invite" | "email" | "signup" | null;
  const explicitNext = searchParams.get("next");

  // Track whether a code/tokenHash was present but the exchange failed.
  // Distinguishes a genuine auth error from the implicit-flow case where
  // neither param is present (session is in the URL fragment instead).
  let authFailed = false;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Belt-and-suspenders: ensure profile + role exist for this user.
      // The auth trigger (011_profile_trigger.sql) does this at the DB level,
      // but the RPCs catch any edge cases (e.g. the trigger missed a sign-in).
      // Failures here are non-fatal — the user might already have a profile.
      try {
        await supabase.rpc("ensure_user_profile");
        await supabase.rpc("accept_invitation_for_current_user");
      } catch {
        // Ignore — profile likely already exists or is handled elsewhere
      }

      // Resolve the post-callback destination.
      let next = explicitNext;
      if (!next) {
        // No explicit ?next= — check whether this is an invite session.
        // Supabase sets invited_at in app_metadata when inviteUserByEmail() is
        // used.  If present, the user has not yet set a password and must be
        // sent to the set-password page rather than directly into the app.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const isInvite = !!session?.user?.app_metadata?.invited_at;
        next = isInvite ? "/auth/set-password" : "/select-role";
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    authFailed = true;
  }

  // ── token_hash flow (updated Supabase email templates) ───────────────────
  // When the Recovery or Invite email template is updated to use:
  //   /auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/set-password
  // Supabase sends a server-side-verifiable token instead of a hash fragment,
  // which is more reliable than the implicit flow and works with SSR.
  if (tokenHash && tokenType) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tokenType,
    });

    if (!error) {
      try {
        await supabase.rpc("ensure_user_profile");
        await supabase.rpc("accept_invitation_for_current_user");
      } catch {
        // Non-fatal — profile / role may already exist
      }

      // Recovery and invite tokens always go to set-password unless overridden.
      const next =
        explicitNext ??
        (tokenType === "recovery" || tokenType === "invite"
          ? "/auth/set-password"
          : "/select-role");

      return NextResponse.redirect(`${origin}${next}`);
    }

    authFailed = true;
  }

  if (authFailed) {
    // A code or token_hash was present but the exchange/verify failed
    // (expired link, already used, etc.).
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  // No code and no token_hash — Supabase used the implicit flow and put the
  // session tokens in the URL fragment (#access_token=...).  The server cannot
  // read the fragment; browsers preserve it through HTTP redirects.  Forward
  // to /login where the client-side hash handler will call setSession().
  return NextResponse.redirect(`${origin}/login`);
}
