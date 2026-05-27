-- FR 5.3, 5.10, 5.11 — Portion Specifications and Production Quantity Planning.
-- Tables capture customer-specific portion profiles, their meal-component rules,
-- packaging requirements, and saved production quantity reports.
-- Idempotent: safe to re-run after the base tables (001–008) are applied.

-- ─── portion_profiles ────────────────────────────────────────────────────────
-- One profile per customer-period. Status lifecycle: Draft → Active → Superseded.
-- Only one profile should be Active per customer at any given service date.
-- Old profiles must never be deleted (historical reports depend on them).

create table if not exists portion_profiles (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null references customer(id),
  name                     text not null,
  status                   text not null default 'Draft',
  -- allowed: 'Draft' | 'Active' | 'Superseded' | 'Inactive'
  effective_from           date not null,
  effective_to             date,
  default_overage_percentage numeric default 0,
  notes                    text,
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz,
  updated_by               uuid
);

-- ─── portion_components ──────────────────────────────────────────────────────
-- Each profile has N components. Components are grouped by meal_category
-- (must match menu_item.category values used in order uploads).

create table if not exists portion_components (
  id                       uuid primary key default gen_random_uuid(),
  portion_profile_id       uuid not null references portion_profiles(id) on delete cascade,
  meal_category            text not null,
  component_name           text not null,
  quantity                 numeric not null,
  unit                     text not null,
  alternative_quantity     numeric,
  alternative_quantity_label text,
  overage_percentage       numeric,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz
);

-- ─── packaging_profiles ──────────────────────────────────────────────────────
-- One packaging spec per portion_profile (1-to-1 relationship).

create table if not exists packaging_profiles (
  id                       uuid primary key default gen_random_uuid(),
  portion_profile_id       uuid not null references portion_profiles(id) on delete cascade,
  pack_type                text,
  bowl_size                text,
  lid_type                 text,
  bag_type                 text,
  label_template           text,
  requires_employee_name   boolean not null default false,
  requires_customer_name   boolean not null default true,
  requires_meal_name       boolean not null default true,
  requires_date            boolean not null default true,
  requires_allergen_flag   boolean not null default false,
  reusable                 boolean not null default false,
  return_instructions      text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz
);

-- ─── production_quantity_runs ─────────────────────────────────────────────────
-- A saved report run for a given service day. Can be regenerated at any time;
-- saving is optional. dashboard_snapshot_id is reserved for a future snapshot
-- table and is currently unused.

create table if not exists production_quantity_runs (
  id                       uuid primary key default gen_random_uuid(),
  service_day              date not null,
  dashboard_snapshot_id    uuid,
  status                   text not null default 'Draft',
  -- allowed: 'Draft' | 'Generated' | 'Released' | 'Superseded'
  generated_by             uuid,
  generated_at             timestamptz not null default now(),
  notes                    text
);

-- ─── production_quantity_lines ────────────────────────────────────────────────
-- One row per component in a saved production quantity run.

create table if not exists production_quantity_lines (
  id                            uuid primary key default gen_random_uuid(),
  production_quantity_run_id    uuid not null references production_quantity_runs(id) on delete cascade,
  customer_id                   uuid references customer(id),
  meal_category                 text,
  component_name                text not null,
  total_required                numeric not null,
  overage_percentage            numeric not null default 0,
  total_with_overage            numeric not null,
  unit                          text not null,
  source_meal_count             integer not null default 0,
  portion_quantity              numeric,
  created_at                    timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_portion_profiles_customer
  on portion_profiles(customer_id);

create index if not exists idx_portion_profiles_status
  on portion_profiles(status);

create index if not exists idx_portion_components_profile
  on portion_components(portion_profile_id);

create index if not exists idx_pq_lines_run
  on production_quantity_lines(production_quantity_run_id);

create index if not exists idx_pq_runs_service_day
  on production_quantity_runs(service_day);

-- ─── DEV ONLY: disable RLS (re-enable with proper policies once auth is added) ─
--   alter table portion_profiles          disable row level security;
--   alter table portion_components        disable row level security;
--   alter table packaging_profiles        disable row level security;
--   alter table production_quantity_runs  disable row level security;
--   alter table production_quantity_lines disable row level security;
