-- FR-OV-5 — records when a customer's daily production dashboard is released.
-- A day cannot be released while open exceptions exist; 'Accept all as-is' is an
-- audited override (reason captured). One release per customer + service day.
-- Idempotent.

create table if not exists dashboard_release (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  service_day date not null,
  released_by text,
  reason text,
  released_at timestamptz not null default now(),
  unique (customer_id, service_day)
);

-- DEV ONLY: disable RLS.
--   alter table dashboard_release disable row level security;
