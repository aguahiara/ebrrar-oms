-- Add protein_requirement to menu_item.
-- Indicates whether the meal requires a protein selection:
--   required     — protein is mandatory (default for all meals)
--   optional     — protein is nice-to-have but not required for release
--   not_required — meal never has a protein (e.g. Fruits Only)
-- Additive and idempotent: safe to re-run.

alter table menu_item
  add column if not exists protein_requirement text not null default 'required'
    check (protein_requirement in ('required', 'optional', 'not_required'));
