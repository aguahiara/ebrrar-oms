-- ============================================================
-- 022_backfill_generic_swallow_v2.sql
-- ============================================================
-- Extended idempotent backfill that adds two previously-missed
-- generic-swallow patterns:
--
--   1. "preferred swallow" — added to GENERIC_SWALLOW_PHRASES in
--      parse-order.ts; may appear in text-path (AVON / HGI) orders.
--
--   2. "your choice of swallow" — phrase present in the parser but
--      omitted from the original backfill regex set.
--
-- This file supplements 021_backfill_generic_swallow.sql.  Any rows
-- already set to 'Not Selected' by that script are untouched (the
-- WHERE clause filters on swallow_name IS NULL).
--
-- NOTE: For ELCREST / Heirs orders the swallow phrase was in a
-- separate spreadsheet column that is not persisted in meal_name_raw,
-- so those rows cannot be backfilled from the database alone.  The
-- fix in avon-orders.ts ensures all future uploads are handled
-- correctly.
--
-- SAFE TO RUN MULTIPLE TIMES — the WHERE clause prevents double-updates.
--
-- DO NOT run automatically.  Review the DRY RUN output first, then
-- uncomment the UPDATE block when satisfied.
-- ============================================================

-- ── DRY RUN: preview affected rows ──────────────────────────
SELECT
    ol.id,
    ol.service_day,
    c.display_name  AS customer,
    ol.employee_ref,
    ol.meal_name_raw
FROM  order_line ol
JOIN  order_batch ob ON ob.id = ol.order_batch_id
JOIN  customer    c  ON c.id  = ol.customer_id
WHERE ol.swallow_name IS NULL
  AND (
        lower(ol.meal_name_raw) ~* '\mpreferred\s+swallow\M'
     OR lower(ol.meal_name_raw) ~* '\myour\s+choice\s+of\s+swallow\M'
  )
ORDER BY ol.service_day, c.display_name, ol.employee_ref;

-- ── ACTUAL UPDATE (uncomment to apply) ──────────────────────
-- BEGIN;
--
-- UPDATE order_line ol
-- SET    swallow_name = 'Not Selected'
-- FROM   order_batch ob
-- WHERE  ob.id = ol.order_batch_id   -- batch must still exist
--   AND  ol.swallow_name IS NULL
--   AND  (
--           lower(ol.meal_name_raw) ~* '\mpreferred\s+swallow\M'
--        OR lower(ol.meal_name_raw) ~* '\myour\s+choice\s+of\s+swallow\M'
--       );
--
-- -- Verification
-- SELECT COUNT(*) AS rows_updated
-- FROM   order_line
-- WHERE  swallow_name = 'Not Selected';
--
-- COMMIT;
