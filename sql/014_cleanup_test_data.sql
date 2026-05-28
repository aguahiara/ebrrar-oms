-- ============================================================
-- TEST DATA CLEANUP SCRIPT
-- ============================================================
-- Purpose : Remove all transactional test data so the system
--           can be loaded with real orders for the first
--           production run.
--
-- REVIEW BEFORE RUNNING.  Each statement is explained below.
-- Run the whole script inside a single transaction so that
-- any failure leaves the database unchanged.
--
-- Tables this script DOES NOT touch (preserved permanently):
--   customer                    — customer master records
--   user_profiles               — operator / admin accounts
--   role_assignments            — RBAC grants
--   invitations                 — pending invite tokens
--   portion_profiles            — customer portion specifications
--   portion_components          — per-profile component rules
--   packaging_profiles          — per-profile packaging specs
--   menu_version                — published menu versions
--   menu_item                   — canonical menu items
--   menu_item_alias             — learned alternate spellings
--                                 (kept: represents accumulated operator
--                                  knowledge; re-deleting on every test
--                                  reset would lose it permanently)
--
-- If you also want to clear learned aliases, uncomment the
-- optional DELETE near the bottom of this file.
-- ============================================================

BEGIN;

-- ── 1. Production quantity lines ─────────────────────────────────────────────
-- What  : Per-component breakdown rows saved inside a production quantity run.
-- Why   : All rows are test-generated; the reports will be regenerated from
--         real orders after the next upload.
-- FK    : References production_quantity_runs(id).  Must be deleted before
--         the runs table.
DELETE FROM production_quantity_lines;

-- ── 2. Production quantity runs ──────────────────────────────────────────────
-- What  : One row per saved "Generate Production Quantities" report.
-- Why   : Test runs only; will be regenerated from real data.
-- FK    : Referenced by production_quantity_lines (cleared above).
DELETE FROM production_quantity_runs;

-- ── 3. Dashboard release records ─────────────────────────────────────────────
-- What  : One row per (customer, service_day) pair that has been released.
--         Stores released_by, released_at, meal_count, exception_count.
-- Why   : All releases to date are test runs.  Clearing lets operators
--         re-release after uploading real order files.
-- FK    : References customer(id) — customer rows are kept.
DELETE FROM dashboard_release;

-- ── 4. Order exceptions ───────────────────────────────────────────────────────
-- What  : Unmatched orders flagged during upload processing, plus their
--         resolution history (resolved_by, resolution_reason, resolved_at).
-- Why   : All exceptions are from test uploads.  Recreated on next upload.
-- WARNING: This removes ALL exception history including resolution notes and
--          audit trail (resolved_by, bulk_applied, source_exception_id).
-- FK    : References order_batch(id), customer(id), menu_item(id).
--         Must be deleted before order_batch.
DELETE FROM order_exception;

-- ── 5. Order lines ────────────────────────────────────────────────────────────
-- What  : Matched (reconciled) order lines — one per employee per service day,
--         including lines created by resolving exceptions with "Map".
-- Why   : All lines are from test uploads.  Recreated on next upload.
-- WARNING: This removes ALL order history for ALL service days and customers.
-- FK    : References order_batch(id), customer(id), menu_item(id).
--         Must be deleted before order_batch.
DELETE FROM order_line;

-- ── 6. Order batches ──────────────────────────────────────────────────────────
-- What  : One row per uploaded file (tracks source_filename, service_day,
--         upload timestamp, customer).
-- Why   : Upload audit trail for test files only.
-- FK    : References customer(id) — customer rows are kept.
--         order_line and order_exception (both cleared above) reference this.
DELETE FROM order_batch;

-- ── Optional: clear learned menu aliases ─────────────────────────────────────
-- Uncomment ONLY if you also want to wipe aliases that were saved during
-- exception resolution ("Save as alias" checkbox).  Aliases represent
-- accumulated operator knowledge and are usually worth keeping across resets.
--
-- DELETE FROM menu_item_alias;

COMMIT;
