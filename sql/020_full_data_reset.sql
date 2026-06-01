-- ============================================================
-- FULL ORDER DATA RESET
-- ============================================================
-- Purpose : Remove ALL transactional / test order data so the
--           system is ready for fresh production uploads.
--
-- HOW TO RUN:
--   1. Read through every section before running.
--   2. Open the Supabase SQL Editor (or connect via psql).
--   3. Paste the entire file and run it.
--   4. The script is wrapped in BEGIN / COMMIT — if any step
--      fails the whole transaction is automatically rolled back.
--   5. DRY-RUN: change the final COMMIT to ROLLBACK to preview
--      what would be deleted without actually deleting anything.
--
-- ──────────────────────────────────────────────────────────────
-- Tables PRESERVED (this script does NOT touch these):
-- ──────────────────────────────────────────────────────────────
--   customer                customer master records
--   user_profiles           operator / admin accounts
--   role_assignments        RBAC grants
--   user_invitations        pending invite tokens
--   portion_profiles        customer portion specifications
--   portion_components      per-profile component rules
--   packaging_profiles      per-profile packaging specs
--   menu_version            published menu versions
--   menu_item               canonical menu items
--   protein_option          protein vocabulary entries
--   swallow_option          swallow-level vocabulary entries
--   menu_assignment         customer ↔ menu version links
--   customer_menu_item      per-customer menu item overrides
--   menu_item_alias         learned alternate spellings (kept by
--                           default — see Step 8 to optionally clear)
--
-- ──────────────────────────────────────────────────────────────
-- Tables CLEARED (in FK-safe order):
-- ──────────────────────────────────────────────────────────────
--   Step 1  production_quantity_lines   child of quantity runs
--   Step 2  production_quantity_runs    kitchen quantity reports
--   Step 3  dashboard_release           release records
--   Step 4a UPDATE order_exception      nullify self-referential FK
--   Step 4b order_exception             exception rows
--   Step 5  order_line                  reconciled order lines
--   Step 6  order_batch                 uploaded file records
--
-- Optional (commented out by default):
--   Step 7  audit_events
--   Step 8  menu_item_alias
-- ============================================================

BEGIN;

-- ── Step 1: Production quantity lines ────────────────────────────────────────
-- One row per component inside a saved production quantity report.
-- References production_quantity_runs(id) — must be cleared first.
DELETE FROM production_quantity_lines;

-- ── Step 2: Production quantity runs ─────────────────────────────────────────
-- One row per "Generate Production Quantities" report run.
-- Safe to delete after step 1 clears all child lines.
-- production_quantity_lines (cleared above) is the only table that
-- references this one.
DELETE FROM production_quantity_runs;

-- ── Step 3: Dashboard release records ────────────────────────────────────────
-- One row per (customer_id, service_day) that has been released to the kitchen.
-- Clearing these rows allows operators to re-release after a fresh upload.
-- References customer(id) — customer rows are preserved.
DELETE FROM dashboard_release;

-- ── Step 4a: Nullify the self-referential FK in order_exception ───────────────
-- order_exception.source_exception_id → order_exception(id)  ON DELETE NO ACTION
--
-- For a full-table DELETE Postgres evaluates FK constraints at statement end,
-- so the delete would succeed even without this step.  However, explicitly
-- nullifying the column first is a belt-and-suspenders measure: it guarantees
-- correctness if the script is ever adapted for partial deletes (e.g. clearing
-- only a specific service_day) and removes any dependency on constraint-deferral
-- behaviour.
UPDATE order_exception
SET    source_exception_id = NULL
WHERE  source_exception_id IS NOT NULL;

-- ── Step 4b: Order exceptions ─────────────────────────────────────────────────
-- Every exception row created during test uploads — open, resolved, and
-- accepted-as-is — along with all resolution metadata (resolved_by,
-- bulk_applied, resolution_reason, etc.).
-- Recreated automatically the next time an order file is processed.
-- References order_batch(id) and customer(id) — both kept or cleared below.
DELETE FROM order_exception;

-- ── Step 5: Order lines ───────────────────────────────────────────────────────
-- Reconciled order lines created at upload time (matched rows) and by
-- operators who resolved exceptions via the "Map" action.
-- All rows are from test uploads; cleared before order_batch.
-- References order_batch(id), customer(id), menu_item(id) — latter two kept.
DELETE FROM order_line;

-- ── Step 6: Order batches ─────────────────────────────────────────────────────
-- One row per uploaded order file (source_filename, service_day, customer_id,
-- uploaded_at timestamp, parsed_at, status).
-- order_line and order_exception (both cleared above) reference this table,
-- so it is safe to delete last.
DELETE FROM order_batch;

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL SECTIONS — review and uncomment as needed
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 7 (optional): Audit events ──────────────────────────────────────────
-- Clears the full operator audit trail (release_released, release_revoked, etc.).
-- The audit log is harmless to keep and is useful for diagnosing past activity.
-- Uncomment ONLY if you explicitly want a completely clean slate.
--
-- DELETE FROM audit_events;

-- ── Step 8 (optional): Learned menu aliases ──────────────────────────────────
-- Aliases are saved when an operator resolves an exception and checks
-- "Save as alias".  They prevent the same raw meal text from failing to
-- match on future uploads — accumulated operator knowledge.
-- Strongly recommended to keep across resets.
-- Uncomment ONLY if you are certain you want to lose all learned aliases.
--
-- DELETE FROM menu_item_alias;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — confirm cleared and preserved row counts
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment the block below (or run it separately after COMMIT) to see
-- row counts in one result set.  All "cleared" rows should be 0;
-- all "preserved" rows should match your pre-reset counts.

/*
-- Cleared tables — all should be 0 after COMMIT:
SELECT 'production_quantity_lines' AS table_name, COUNT(*) AS row_count FROM production_quantity_lines
UNION ALL
SELECT 'production_quantity_runs',               COUNT(*) FROM production_quantity_runs
UNION ALL
SELECT 'dashboard_release',                      COUNT(*) FROM dashboard_release
UNION ALL
SELECT 'order_exception',                        COUNT(*) FROM order_exception
UNION ALL
SELECT 'order_line',                             COUNT(*) FROM order_line
UNION ALL
SELECT 'order_batch',                            COUNT(*) FROM order_batch
ORDER BY table_name;

-- Preserved tables — these should all be > 0:
SELECT 'customer'              AS table_name, COUNT(*) AS row_count FROM customer
UNION ALL
SELECT 'menu_version',                        COUNT(*) FROM menu_version
UNION ALL
SELECT 'menu_item',                           COUNT(*) FROM menu_item
UNION ALL
SELECT 'protein_option',                      COUNT(*) FROM protein_option
UNION ALL
SELECT 'swallow_option',                      COUNT(*) FROM swallow_option
UNION ALL
SELECT 'menu_assignment',                     COUNT(*) FROM menu_assignment
UNION ALL
SELECT 'customer_menu_item',                  COUNT(*) FROM customer_menu_item
UNION ALL
SELECT 'portion_profiles',                    COUNT(*) FROM portion_profiles
UNION ALL
SELECT 'portion_components',                  COUNT(*) FROM portion_components
UNION ALL
SELECT 'packaging_profiles',                  COUNT(*) FROM packaging_profiles
UNION ALL
SELECT 'user_profiles',                       COUNT(*) FROM user_profiles
UNION ALL
SELECT 'role_assignments',                    COUNT(*) FROM role_assignments
UNION ALL
SELECT 'menu_item_alias',                     COUNT(*) FROM menu_item_alias
ORDER BY table_name;
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Change COMMIT → ROLLBACK below for a safe dry-run (no data is deleted).
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;
