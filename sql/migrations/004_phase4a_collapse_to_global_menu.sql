-- Phase 4a (migration) — ONE-TIME data migration. Already applied in dev.
--
-- Collapses the per-customer menus (AVON, HGI) into a single global menu, assigns
-- both customers to it, and populates each customer's availability with all options.
--
-- WARNING: clears test order data (order_line/order_batch/order_exception and
-- test aliases) so menu items can be restructured without dangling references.
-- Re-upload the customer files afterwards to rebuild order data.
--
-- This is a historical record of a one-off migration; do NOT re-run on a database
-- that has already been migrated (it would clear live order data again).

begin;

-- 1. Clear regenerable test order data (removes FK references and stale aliases).
truncate table order_exception, order_line, order_batch, menu_item_alias;

-- 2. Promote AVON's published menu to be the global (shared) menu.
update menu_version
set customer_id = null
where id = (
  select mv.id
  from menu_version mv
  join customer c on c.id = mv.customer_id and c.display_name = 'AVON'
  where mv.status = 'Published'
  order by mv.created_at desc
  limit 1
);

-- 3. Remove the now-redundant per-customer menus (e.g. HGI's copy) and their items.
delete from menu_item
where menu_version_id in (select id from menu_version where customer_id is not null);
delete from menu_version where customer_id is not null;

-- 4. Assign AVON and HGI to the global menu.
insert into menu_assignment (customer_id, menu_version_id)
select c.id, (select id from menu_version where customer_id is null limit 1)
from customer c
where c.display_name in ('AVON', 'HGI')
on conflict (customer_id, menu_version_id) do nothing;

-- 5. Populate each customer's availability with ALL global options (assign-all default).
insert into customer_menu_item (customer_id, menu_item_id)
select ma.customer_id, mi.id
from menu_assignment ma
join menu_item mi on mi.menu_version_id = ma.menu_version_id
on conflict (customer_id, menu_item_id) do nothing;

commit;
