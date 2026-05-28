-- Audit snapshot captured at the moment a customer day is released.
-- meal_count   — total order lines at release time.
-- exception_count — total exception rows (any status) at release time.
-- Both are NULL for pre-migration release records.
-- Idempotent.

alter table dashboard_release
  add column if not exists meal_count    integer,
  add column if not exists exception_count integer;
