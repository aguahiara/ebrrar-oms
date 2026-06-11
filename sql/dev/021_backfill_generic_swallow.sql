-- ============================================================
-- 021_backfill_generic_swallow.sql
-- ============================================================
-- Optional, idempotent backfill for order_line rows that were
-- uploaded before the "Not Selected" generic-swallow rule was
-- introduced.
--
-- Targets rows where:
--   • swallow_name IS NULL (no swallow was captured at upload time)
--   • meal_name_raw clearly indicates a swallow was requested but
--     the type was not specified (matches the same generic phrases
--     the parser now detects)
--   • The order_batch still exists (i.e. the order has not been
--     hard-deleted via a reject action)
--
-- SAFE TO RUN MULTIPLE TIMES — the WHERE clause ensures only
-- rows with swallow_name IS NULL are touched.
--
-- DO NOT run automatically.  Review the DRY RUN output first,
-- then uncomment the UPDATE block when satisfied.
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
        ol.meal_name_raw ~* '\mwith\s+swallow\M'
     OR ol.meal_name_raw ~* '\+\s*swallow\M'
     OR ol.meal_name_raw ~* '\mand\s+swallow\M'
     OR ol.meal_name_raw ~* '\mserved\s+with\s+swallow\M'
     OR lower(trim(ol.meal_name_raw)) ~* '\many\s+swallow\M'
     OR lower(trim(ol.meal_name_raw)) ~* '\mchoice\s+of\s+swallow\M'
     OR lower(trim(ol.meal_name_raw)) ~* '\mswallow\s+of\s+choice\M'
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
--           ol.meal_name_raw ~* '\mwith\s+swallow\M'
--        OR ol.meal_name_raw ~* '\+\s*swallow\M'
--        OR ol.meal_name_raw ~* '\mand\s+swallow\M'
--        OR ol.meal_name_raw ~* '\mserved\s+with\s+swallow\M'
--        OR lower(trim(ol.meal_name_raw)) ~* '\many\s+swallow\M'
--        OR lower(trim(ol.meal_name_raw)) ~* '\mchoice\s+of\s+swallow\M'
--        OR lower(trim(ol.meal_name_raw)) ~* '\mswallow\s+of\s+choice\M'
--       );
--
-- -- Verification
-- SELECT COUNT(*) AS rows_updated
-- FROM   order_line
-- WHERE  swallow_name = 'Not Selected';
--
-- COMMIT;
