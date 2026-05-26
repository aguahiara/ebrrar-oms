-- Phase 4a (schema) — central menu, protein/swallow vocabularies,
-- customer assignment, and per-customer availability.
-- Additive and idempotent: safe to re-run.

-- Meal options gain an option label (OPTION 1..8); populated by the menu upload.
alter table menu_item add column if not exists option_label text;

-- Per-day protein and swallow vocabularies, attached to a menu version.
create table if not exists protein_option (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid references menu_version(id),
  day_of_week text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists swallow_option (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid references menu_version(id),
  day_of_week text not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- Which menu version a customer orders against.
create table if not exists menu_assignment (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  menu_version_id uuid references menu_version(id),
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (customer_id, menu_version_id)
);

-- Per-customer availability allow-list of meal options. The matcher reads only
-- a customer's available options, so an item a customer is not offered becomes
-- an exception automatically.
create table if not exists customer_menu_item (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  menu_item_id uuid references menu_item(id),
  created_at timestamptz not null default now(),
  unique (customer_id, menu_item_id)
);

-- order_line gains protein/swallow capture (used by the 4c decomposition).
alter table order_line add column if not exists protein_raw text;
alter table order_line add column if not exists protein_name text;
alter table order_line add column if not exists swallow_raw text;
alter table order_line add column if not exists swallow_name text;

-- DEV ONLY: disable RLS on the new tables.
--   alter table protein_option     disable row level security;
--   alter table swallow_option     disable row level security;
--   alter table menu_assignment    disable row level security;
--   alter table customer_menu_item disable row level security;
