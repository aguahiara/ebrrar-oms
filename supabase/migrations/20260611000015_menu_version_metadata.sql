-- Track the original Excel filename and who uploaded each menu version.
-- Nullable — existing rows will be NULL; new uploads set both via the save route.
-- Idempotent.

alter table menu_version add column if not exists source_filename text;
alter table menu_version add column if not exists created_by text;
