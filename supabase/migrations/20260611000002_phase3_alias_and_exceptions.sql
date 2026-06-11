-- Phase 3 — robust matching support: alias table and exception queue.
-- Idempotent: safe to re-run.

-- Learned alternate spellings for a menu item (step 2 of matchMeal).
create table if not exists menu_item_alias (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_item(id),
  alias_text text not null,
  normalized_text text not null,   -- lowercased, trimmed, punctuation-stripped
  created_by text,
  created_at timestamptz not null default now()
);

-- Order lines that could not be matched cleanly, routed for human triage
-- so nothing silently enters the production count (FRD 5.9).
create table if not exists order_exception (
  id uuid primary key default gen_random_uuid(),
  order_batch_id uuid references order_batch(id),
  customer_id uuid references customer(id),
  service_day date not null,
  raw_value text,
  employee_ref text,
  exception_type text not null,            -- e.g. 'Meal not on menu'
  suggested_item_id uuid references menu_item(id),  -- best fuzzy guess
  suggested_score numeric,
  status text not null default 'Open',     -- 'Open' | 'Resolved' | 'AcceptedAsIs'
  resolved_item_id uuid references menu_item(id),
  resolved_by text,
  resolution_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- DEV ONLY: disable RLS on the new tables.
--   alter table menu_item_alias disable row level security;
--   alter table order_exception disable row level security;
