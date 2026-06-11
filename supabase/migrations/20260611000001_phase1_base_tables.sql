-- Phase 1 — base tables for the upload -> dashboard slice.
-- Idempotent: safe to re-run. Run in order (001, 002, 003), then apply
-- migrations as needed. RLS is disabled in development (see note at bottom).

create table if not exists customer (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists menu_version (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),   -- null = global/shared menu (Phase 4a)
  service_week_start date not null,
  status text not null default 'Published',   -- 'Draft' | 'Published' | 'Archived'
  created_at timestamptz not null default now()
);

create table if not exists menu_item (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid references menu_version(id),
  day_of_week text not null,                  -- 'Mon','Tue','Wed','Thu','Fri'
  canonical_name text not null,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists order_batch (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  service_day date not null,
  channel text not null default 'ScheduleUpload',
  source_filename text,
  created_at timestamptz not null default now()
);

create table if not exists order_line (
  id uuid primary key default gen_random_uuid(),
  order_batch_id uuid references order_batch(id),
  customer_id uuid references customer(id),
  service_day date not null,
  menu_item_id uuid references menu_item(id),
  meal_name_raw text,
  employee_ref text,
  quantity int not null default 1,
  match_type text,                            -- 'Direct' | 'Alias' | 'Fuzzy' | null
  created_at timestamptz not null default now()
);

-- DEV ONLY: Supabase enables Row Level Security by default, which blocks the
-- anon key the app uses. While there is no login, disable it on these tables:
--   alter table customer            disable row level security;
--   alter table menu_version        disable row level security;
--   alter table menu_item           disable row level security;
--   alter table order_batch         disable row level security;
--   alter table order_line          disable row level security;
-- Re-enable with proper policies once authentication is added.
