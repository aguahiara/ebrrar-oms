-- ============================================================
-- 023_customer_upload_config.sql
-- ============================================================
-- Per-customer configurable upload format definitions.
--
-- When a row with is_active = true exists for a customer, it
-- takes precedence over customer.parser_format for upload
-- processing.  Existing customers that still use parser_format
-- are not affected — the new table is simply empty for them.
--
-- parser_type values match the ConfigurableParserType union in
-- lib/upload-config.ts.
-- ============================================================

create table if not exists customer_upload_config (
  id          uuid        primary key default gen_random_uuid(),
  customer_id uuid        not null references customer(id) on delete cascade,
  format_name text        not null,
  parser_type text        not null,
  is_active   boolean     not null default true,
  config      jsonb       not null default '{}',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,

  constraint customer_upload_config_parser_type_check check (
    parser_type in (
      'single_sheet_weekly_grid',
      'multi_sheet_daily_form',
      'multi_sheet_daily_remarks',
      'summary_quantity_format',
      'single_sheet_weekly_grid_with_reference_menu'
    )
  )
);

-- Enforce one active config per customer.
create unique index if not exists customer_upload_config_one_active_per_customer
  on customer_upload_config (customer_id)
  where is_active = true;

comment on table customer_upload_config is
  'Configurable upload-format definitions for the flexible parser engine. '
  'When a row with is_active = true exists for a customer it overrides '
  'customer.parser_format for upload processing.';

comment on column customer_upload_config.parser_type is
  'One of: single_sheet_weekly_grid | multi_sheet_daily_form | '
  'multi_sheet_daily_remarks | summary_quantity_format | '
  'single_sheet_weekly_grid_with_reference_menu';

comment on column customer_upload_config.config is
  'JSON configuration for the selected parser_type. '
  'See lib/upload-config.ts for the per-type shape documentation.';
