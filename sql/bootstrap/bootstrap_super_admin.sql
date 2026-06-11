-- ============================================================
-- sql/bootstrap/bootstrap_super_admin.sql
-- ============================================================
-- ONE-TIME controlled bootstrap: assigns ebrrar_super_admin to
-- one explicitly named account.
--
-- This script is NOT part of the production migration sequence
-- (001–027). It is a manually-run administrative tool executed
-- once, after all migrations have been applied.
--
-- Prerequisites (in order):
--   1. All schema migrations (001–027) have been applied to the
--      Production Supabase project.
--   2. The intended Super Admin account has been created directly
--      in the Supabase Dashboard:
--        Dashboard → Authentication → Users → Add user
--        (use "Create new user", set a strong temporary password,
--        and note the email address used)
--      Do NOT use the application invitation flow for this step —
--      that flow assumes a Super Admin already exists to send the
--      invite. Create the account at the Supabase level first.
--   3. The user has signed in at least once (or the
--      handle_new_auth_user() trigger has otherwise fired) so that
--      a user_profiles row exists for their auth.users ID.
--      The easiest way: log in to the application at the /login
--      page with the temporary password, which triggers the profile
--      creation, then change the password from within the app.
--
-- Usage:
--   1. Replace the placeholder email below with the exact address
--      used when creating the account in step 2.
--   2. Paste the entire script into the Supabase SQL Editor
--      (Production project) and run it.
--   3. Confirm the NOTICE: "Bootstrap complete: ebrrar_super_admin
--      assigned to <email>."
--   4. Verify with:
--        SELECT ra.role, up.email
--        FROM   role_assignments ra
--        JOIN   user_profiles    up ON up.id = ra.user_profile_id
--        WHERE  ra.role = 'ebrrar_super_admin';
--
-- Safety guarantees:
--   • Email matching is case-insensitive (Guard 2).
--   • Errors if any active ebrrar_super_admin already exists (Guard 1).
--   • Errors if the target email is not in auth.users (Guard 2).
--   • Errors if no user_profiles row exists yet for that user (Guard 3).
--   • Errors if the target user already has any role assignment (Guard 4).
--   • The INSERT is the only write — all guards are read-only checks.
--   • Safe to re-run: Guard 1 will abort cleanly if already bootstrapped.
-- ============================================================

DO $$
DECLARE
  v_target_email   TEXT := 'REPLACE_WITH_SUPER_ADMIN_EMAIL@example.com';
  v_auth_user_id   UUID;
  v_profile_id     UUID;
  v_existing_admin INT;
BEGIN

  -- ── Guard 1: a Super Admin must not already exist ──────────────────────────
  SELECT COUNT(*) INTO v_existing_admin
  FROM   public.role_assignments
  WHERE  role   = 'ebrrar_super_admin'
    AND  active = TRUE;

  IF v_existing_admin > 0 THEN
    RAISE EXCEPTION
      E'Bootstrap aborted: an active ebrrar_super_admin already exists.\n'
      'Run the following to review:\n'
      '  SELECT ra.role, up.email\n'
      '  FROM   role_assignments ra\n'
      '  JOIN   user_profiles    up ON up.id = ra.user_profile_id\n'
      '  WHERE  ra.role = ''ebrrar_super_admin'';';
  END IF;

  -- ── Guard 2: target email must exist in auth.users (case-insensitive) ───────
  SELECT id INTO v_auth_user_id
  FROM   auth.users
  WHERE  lower(email) = lower(v_target_email);

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION
      'Bootstrap aborted: no auth.users row found for email "%". '
      'Create the account in the Supabase Dashboard first '
      '(Authentication → Users → Add user), then re-run this script.',
      v_target_email;
  END IF;

  -- ── Guard 3: user_profiles row must already exist ──────────────────────────
  SELECT id INTO v_profile_id
  FROM   public.user_profiles
  WHERE  auth_user_id = v_auth_user_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION
      'Bootstrap aborted: user_profiles row not found for "%". '
      'The user must sign in at least once so the handle_new_auth_user() '
      'trigger fires and creates their profile row, then re-run this script.',
      v_target_email;
  END IF;

  -- ── Guard 4: target user must have no existing role assignment ─────────────
  IF EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  user_profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION
      'Bootstrap aborted: user "%" already has a role assignment. '
      'Inspect:  SELECT * FROM role_assignments WHERE user_profile_id = ''%'';',
      v_target_email, v_profile_id;
  END IF;

  -- ── All guards passed — assign the role ────────────────────────────────────
  INSERT INTO public.role_assignments
    (user_profile_id, role, is_default, active)
  VALUES
    (v_profile_id, 'ebrrar_super_admin', TRUE, TRUE);

  RAISE NOTICE 'Bootstrap complete: ebrrar_super_admin assigned to "%".', v_target_email;

END;
$$;
