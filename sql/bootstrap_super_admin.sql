-- ============================================================
-- sql/bootstrap_super_admin.sql
-- ============================================================
-- ONE-TIME controlled bootstrap: assigns ebrrar_super_admin to
-- one explicitly named account.
--
-- Prerequisites (in order):
--   1. All schema migrations (001–027) have been applied.
--   2. The intended Super Admin has been created in Supabase Auth
--      (via Dashboard → Authentication → Users → Invite user,
--      or via the application's invitation flow).
--   3. That user has signed in at least once so that the
--      handle_new_auth_user() trigger has created their
--      user_profiles row.
--
-- Usage:
--   1. Replace the email value below with the real address.
--   2. Paste the entire script into the Supabase SQL Editor
--      (Production project) and run it.
--   3. Confirm the NOTICE line: "Bootstrap complete: ebrrar_super_admin
--      assigned to <email>."
--   4. Verify with:
--        SELECT ra.role, up.email
--        FROM   role_assignments ra
--        JOIN   user_profiles    up ON up.id = ra.user_profile_id
--        WHERE  ra.role = 'ebrrar_super_admin';
--
-- Safety guarantees:
--   • Errors if any ebrrar_super_admin already exists (Guard 1).
--   • Errors if the target email is not in auth.users (Guard 2).
--   • Errors if no user_profiles row exists yet for that user (Guard 3).
--   • Errors if the target user already has any role assignment (Guard 4).
--   • The INSERT is the only write — all guards are read-only checks.
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
  WHERE  role = 'ebrrar_super_admin'
    AND  active = TRUE;

  IF v_existing_admin > 0 THEN
    RAISE EXCEPTION
      E'Bootstrap aborted: an active ebrrar_super_admin already exists.\n'
      'Run:  SELECT ra.role, up.email FROM role_assignments ra '
      'JOIN user_profiles up ON up.id = ra.user_profile_id '
      'WHERE ra.role = ''ebrrar_super_admin'';  to review.';
  END IF;

  -- ── Guard 2: target email must exist in auth.users ─────────────────────────
  SELECT id INTO v_auth_user_id
  FROM   auth.users
  WHERE  email = v_target_email;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION
      'Bootstrap aborted: no auth.users row found for email "%". '
      'Create and confirm the account first, then re-run this script.',
      v_target_email;
  END IF;

  -- ── Guard 3: user_profiles row must already exist ──────────────────────────
  SELECT id INTO v_profile_id
  FROM   public.user_profiles
  WHERE  auth_user_id = v_auth_user_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION
      'Bootstrap aborted: user_profiles row not found for "%". '
      'The user must complete the set-password step so the profile trigger '
      'fires, then re-run this script.',
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
      'Inspect role_assignments WHERE user_profile_id = ''%''.',
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
