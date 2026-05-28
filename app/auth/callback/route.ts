import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Handles the Supabase auth callback (magic link / OAuth).
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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/select-role";

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

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to login with error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
