-- 011: Auto-profile creation — trigger, secure RPCs, and seed for existing users
-- Run via Supabase Dashboard → SQL Editor (or supabase db push) after 010_auth_tables.sql
--
-- What this migration does:
--   1. ensure_user_profile()          — SECURITY DEFINER RPC: creates/upserts the
--                                       calling user's profile row without needing
--                                       the service role key.
--   2. accept_invitation_for_current_user() — SECURITY DEFINER RPC: matches a
--                                       pending invitation by email, creates the
--                                       role_assignment, and marks it accepted.
--   3. handle_new_auth_user()         — trigger function + trigger on auth.users:
--                                       auto-creates a profile (and role if an
--                                       invitation is pending) for every new signup.
--   4. Seed INSERT                    — back-fills user_profiles for every
--                                       auth.users row that has no profile yet.
--   5. Bootstrap role assignment      — assigns ebrrar_super_admin to the
--                                       oldest profile with no roles (first install
--                                       only; no-op once roles exist).


-- ─── 1. ensure_user_profile() ────────────────────────────────────────────────
-- Called from app/auth/callback/route.ts after exchangeCodeForSession().
-- SECURITY DEFINER → runs as the function owner (postgres superuser) so it can
-- bypass RLS without the service role key.
-- Uses auth.uid() internally, so a user can only ever touch their own row.

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_email      TEXT;
  v_name       TEXT;
  v_profile_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ensure_user_profile: not authenticated';
  END IF;

  SELECT
    email,
    COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      split_part(email, '@', 1)
    )
  INTO v_email, v_name
  FROM auth.users
  WHERE id = v_uid;

  INSERT INTO public.user_profiles (auth_user_id, email, full_name, status)
  VALUES (v_uid, v_email, v_name, 'active')
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email      = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_user_profile() IS
  'Creates or updates the profile row for the currently authenticated user. '
  'SECURITY DEFINER — safe to call from the browser/anon client.';


-- ─── 2. accept_invitation_for_current_user() ─────────────────────────────────
-- Called from app/auth/callback/route.ts immediately after ensure_user_profile().
-- Finds the most-recent pending invitation for the current user's email, creates
-- the role_assignment row, and marks the invitation accepted.
-- Returns: the role string assigned, 'already_assigned', or 'none'.

CREATE OR REPLACE FUNCTION public.accept_invitation_for_current_user()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_profile user_profiles%ROWTYPE;
  v_invite  user_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_invitation_for_current_user: not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_profile
  FROM user_profiles
  WHERE auth_user_id = v_uid;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'accept_invitation_for_current_user: no profile found — call ensure_user_profile() first';
  END IF;

  -- No-op if the user already has at least one active role assignment
  IF EXISTS (
    SELECT 1 FROM role_assignments
    WHERE user_profile_id = v_profile.id AND active = TRUE
  ) THEN
    RETURN 'already_assigned';
  END IF;

  -- Find the newest pending invitation for this email
  SELECT * INTO v_invite
  FROM user_invitations
  WHERE email     = v_email
    AND status    = 'pending'
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY invited_at DESC
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RETURN 'none';
  END IF;

  INSERT INTO role_assignments
    (user_profile_id, role, customer_id, is_default, active)
  VALUES
    (v_profile.id, v_invite.role, v_invite.customer_id, TRUE, TRUE);

  UPDATE user_invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invite.id;

  RETURN v_invite.role;
END;
$$;

COMMENT ON FUNCTION public.accept_invitation_for_current_user() IS
  'Accepts the pending invitation for the calling user, creating their role '
  'assignment. SECURITY DEFINER — safe to call from the browser/anon client.';


-- ─── 3. Trigger: auto-create profile on new auth user ────────────────────────
-- Fires AFTER INSERT ON auth.users.
-- If a pending invitation matches the new user's email the role_assignment is
-- also created and the invitation marked accepted in the same transaction.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite  user_invitations%ROWTYPE;
  v_name    TEXT;
BEGIN
  -- Look for a pending invitation for this email
  SELECT * INTO v_invite
  FROM user_invitations
  WHERE email  = NEW.email
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY invited_at DESC
  LIMIT 1;

  v_name := COALESCE(
    v_invite.full_name,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create the profile (idempotent — skip if already exists)
  INSERT INTO public.user_profiles (auth_user_id, email, full_name, status)
  VALUES (NEW.id, NEW.email, v_name, 'active')
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- If an invitation was found, create the role assignment and accept the invite
  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.role_assignments
      (user_profile_id, role, customer_id, is_default, active)
    SELECT p.id, v_invite.role, v_invite.customer_id, TRUE, TRUE
    FROM   public.user_profiles p
    WHERE  p.auth_user_id = NEW.id;

    UPDATE public.user_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop first so this migration is idempotent (safe to re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Trigger function: creates a user_profiles row (and role_assignment if an '
  'invitation is pending) whenever a new row is inserted into auth.users.';


-- ─── 4. Seed: back-fill profiles for existing auth users ─────────────────────
-- Safe to run repeatedly — ON CONFLICT (auth_user_id) DO NOTHING is idempotent.

INSERT INTO public.user_profiles (auth_user_id, email, full_name, status)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  'active'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.auth_user_id = u.id
)
ON CONFLICT (auth_user_id) DO NOTHING;


-- ─── 5. Bootstrap: assign ebrrar_super_admin to the first profileless user ───
-- Targets only the oldest auth user that has a profile but no role assignments.
-- On a fresh install this seeds the bootstrapping super admin.
-- On an established installation (roles already exist) this is a no-op.

INSERT INTO public.role_assignments (user_profile_id, role, is_default, active)
SELECT p.id, 'ebrrar_super_admin', TRUE, TRUE
FROM   public.user_profiles p
JOIN   auth.users           u ON u.id = p.auth_user_id
WHERE  NOT EXISTS (
  SELECT 1 FROM public.role_assignments r WHERE r.user_profile_id = p.id
)
ORDER BY u.created_at ASC
LIMIT 1;
