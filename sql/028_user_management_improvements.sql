-- 028: User management improvements
-- Adds cancellation tracking to user_invitations, a composite audit index,
-- and a safety-guard RPC used before suspend/deactivate operations.
--
-- Apply to Dev first via: npx supabase db push
-- Then review and apply to Production separately.

-- ── 1. Invitation cancellation tracking ──────────────────────────────────────
-- Lets us record who cancelled an invitation and when.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;


-- ── 2. Composite index for per-user audit history queries ─────────────────────
-- Speeds up "show me all audit events for this user profile" queries.

CREATE INDEX IF NOT EXISTS idx_audit_events_target_created
  ON public.audit_events(target_id, created_at DESC);


-- ── 3. count_active_super_admins() ───────────────────────────────────────────
-- Returns the number of users with an active ebrrar_super_admin role assignment
-- AND an active profile status.  Used by API routes to enforce:
--   "at least one active Super Admin must always remain."
-- STABLE (read-only, repeatable within transaction).

CREATE OR REPLACE FUNCTION public.count_active_super_admins()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::INT
  FROM   public.role_assignments ra
  JOIN   public.user_profiles    up ON up.id = ra.user_profile_id
  WHERE  ra.role   = 'ebrrar_super_admin'
    AND  ra.active = TRUE
    AND  up.status = 'active';
$$;

COMMENT ON FUNCTION public.count_active_super_admins() IS
  'Returns the count of active ebrrar_super_admin users. '
  'Called by admin API routes before suspend/deactivate to enforce the '
  '"last active Super Admin cannot be removed" safety rule.';
