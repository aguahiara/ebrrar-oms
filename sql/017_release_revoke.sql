-- Add revocation audit columns to dashboard_release so releases can be safely
-- reopened by a Super Admin without deleting the record.
--
-- Revocation state:
--   revoked_at IS NULL     → release is active
--   revoked_at IS NOT NULL → release has been revoked; customer+day is re-openable
--
-- On re-release after revoke, the existing row is updated in place (the unique
-- constraint on (customer_id, service_day) is preserved). The revocation data is
-- cleared on re-release; the audit_events table retains the full revocation history.
-- Idempotent.

alter table dashboard_release
  add column if not exists revoked_at   timestamptz,
  add column if not exists revoked_by   text,
  add column if not exists revoke_reason text;
