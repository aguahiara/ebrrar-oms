-- Bulk-correction audit fields for order_exception.
-- Added so that when one exception is resolved and the same action is applied
-- to all similar Open exceptions for the same customer, each bulk-updated row
-- records that it was automatically corrected and which exception triggered it.
-- Idempotent: safe to re-run.

alter table order_exception
  add column if not exists bulk_applied boolean not null default false,
  add column if not exists source_exception_id uuid references order_exception(id);
