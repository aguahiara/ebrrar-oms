-- Manual Orders & Special Orders support.
-- Idempotent: safe to re-run.

-- ── 1. order_source on order_line ────────────────────────────────────────────
-- Tracks how each order line entered the system.
-- NULL on legacy rows (pre-migration); apps treat NULL as 'bulk_upload'.
alter table order_line add column if not exists order_source text;

-- ── 2. side_name on order_line ───────────────────────────────────────────────
-- Side dish captured for manual orders (e.g. "Dodo", "Moi Moi").
alter table order_line add column if not exists side_name text;

-- ── 3. line_notes on order_line ──────────────────────────────────────────────
-- Free-text notes per order line (used by manual orders).
alter table order_line add column if not exists line_notes text;

-- ── 4. Audit / batch metadata on order_batch ─────────────────────────────────
-- created_by: the Supabase auth user who created the batch (manual orders only).
alter table order_batch add column if not exists created_by uuid;
-- batch_notes: free-text notes on the batch as a whole.
alter table order_batch add column if not exists batch_notes text;

-- ── 5. Special Order contact fields on order_batch ───────────────────────────
-- These are only populated for special (non-corporate) orders.
alter table order_batch add column if not exists contact_name     text;
alter table order_batch add column if not exists contact_phone    text;
-- 'Pickup' | 'Delivery'
alter table order_batch add column if not exists pickup_delivery  text;
alter table order_batch add column if not exists delivery_notes   text;

-- ── 6. is_system_customer on customer ────────────────────────────────────────
-- System customers (e.g. "Special Orders") are pseudo-customers used to route
-- non-corporate orders through the standard pipeline. They are hidden from the
-- customer-selection dropdown on the Upload Orders page.
alter table customer add column if not exists is_system_customer boolean not null default false;

-- ── 7. Seed the Special Orders system customer ───────────────────────────────
-- Idempotent: only inserted when no customer with this display_name exists.
insert into customer (display_name, status, is_system_customer)
select 'Special Orders', 'Active', true
where not exists (
  select 1 from customer where display_name = 'Special Orders'
);
