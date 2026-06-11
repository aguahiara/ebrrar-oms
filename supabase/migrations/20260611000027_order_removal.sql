-- 027_order_removal.sql
-- Adds soft-delete support to order_line so individual orders can be removed
-- from Order Review or the Exceptions page without permanently losing data.
--
-- Semantics
-- ─────────
--   deleted_at IS NULL  → the line is active and appears in all production queries
--   deleted_at IS NOT NULL → the line is removed and must be excluded everywhere
--
-- Hard deletes (rejectUploadBatch) are still used for full-batch removal — soft
-- delete is only for individual or exception-driven removals.
--
-- quantity_before and quantity_after are recorded when the operator reduces a
-- manual order quantity so the audit trail is complete.

ALTER TABLE order_line
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by        text,          -- actor email/name
  ADD COLUMN IF NOT EXISTS delete_reason     text,          -- canonical reason key
  ADD COLUMN IF NOT EXISTS delete_notes      text,          -- optional free-text
  ADD COLUMN IF NOT EXISTS deletion_source   text,          -- 'order_review' | 'exceptions_page'
  ADD COLUMN IF NOT EXISTS deletion_scope    text,          -- 'individual' | 'batch' (informational)
  ADD COLUMN IF NOT EXISTS quantity_before   integer,       -- populated on quantity edits
  ADD COLUMN IF NOT EXISTS quantity_after    integer;       -- populated on quantity edits

-- Partial index so active-line lookups (the common path) stay fast even as the
-- deleted_at column is added.
CREATE INDEX IF NOT EXISTS idx_order_line_active
  ON order_line (customer_id, service_day)
  WHERE deleted_at IS NULL;
