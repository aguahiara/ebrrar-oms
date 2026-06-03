-- ============================================================
-- 025_customer_upload_config_rls.sql
-- ============================================================
-- Row Level Security policies for customer_upload_config.
--
-- Background
-- ----------
-- Supabase enables RLS on every newly-created table by default.
-- Migration 023 (which created this table) did not define any
-- policies, so the table had no matching rows for any role and
-- every access was silently denied:
--
--   • SELECT via the anon singleton returned null, causing the
--     upload page and customer detail page to always show
--     "Not configured" even when a config row exists.
--   • INSERT / UPDATE raised "new row violates row-level security
--     policy" — the error seen in the UI.
--   • fetchActiveUploadConfig() silently returned null, so the
--     upload pipeline always fell back to the legacy parser_format
--     path (Energia → "Expected Sheet1" error).
--
-- Fix
-- ---
-- Two targeted policies are added:
--
--   SELECT  open to all roles (including anon).  The config data
--           (parser type, sheet names, column letters) is operational
--           metadata with the same sensitivity level as the customer
--           table itself, which has RLS disabled.  Keeping SELECT
--           open lets the existing server components and API routes
--           read configs without session plumbing changes.
--
--   ALL     restricted to the service role.  Every write path
--   (INSERT / UPDATE)  goes through API route handlers that verify the
--           caller has the manage_customers permission BEFORE
--           obtaining a service-role client, so authorisation is
--           enforced in application code.  Hard DELETEs are
--           avoided; deactivation uses is_active = false.
-- ============================================================

-- Idempotent: Supabase enables this by default, but make the intent
-- explicit so the migration is self-documenting.
alter table customer_upload_config enable row level security;

-- ── SELECT: allow all roles (anon + authenticated + service_role) ─────────────
-- The anon singleton used by server components and API route handlers can now
-- read upload configs without a user-session JWT attached.
create policy "Anyone can read upload configs"
  on customer_upload_config
  for select
  using (true);

-- ── WRITE: service role only ──────────────────────────────────────────────────
-- INSERT / UPDATE / DELETE are restricted to the service role.
-- The upload-config API route (app/api/customers/[id]/upload-config/route.ts)
-- already checks hasPermission(session.selectedRole.role, "manage_customers")
-- before calling createSupabaseServiceClient(), so only authorised admin roles
-- (ebrrar_super_admin, ebrrar_operations_admin) can reach this code path.
--
-- Roles with manage_customers:
--   • ebrrar_super_admin       (full system access)
--   • ebrrar_operations_admin  (day-to-day operations)
create policy "Service role manages upload configs"
  on customer_upload_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
