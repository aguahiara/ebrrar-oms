-- Phase 4c — store the decomposed meal core on each exception so that, when an
-- operator maps it and saves an alias, the alias is keyed on the same core the
-- matcher compares against (not the raw string, which still carries the protein).
-- Idempotent.

alter table order_exception add column if not exists meal_core text;
