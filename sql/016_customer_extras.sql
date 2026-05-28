-- Extend customer with an optional short code, free-text notes, and an
-- updated_at timestamp so the detail page can show when the record last changed.
-- Idempotent.

alter table customer add column if not exists customer_code text;
alter table customer add column if not exists notes        text;
alter table customer add column if not exists updated_at   timestamptz;
