-- FR 4, 5.16 — User profiles, role assignments, invitations, and audit events.
-- These tables live in the public schema and link to Supabase Auth (auth.users).
-- Unlike earlier migrations, RLS is ENABLED on these tables.
-- Run after migrations 001–009.

-- ─── user_profiles ───────────────────────────────────────────────────────────
-- Application-level profile for every authenticated user.
-- Created after a user accepts an invitation or is provisioned by an admin.

create table if not exists user_profiles (
  id                   uuid primary key default gen_random_uuid(),
  auth_user_id         uuid not null unique references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text not null,
  phone                text,
  status               text not null default 'active',
  -- allowed: 'active' | 'inactive' | 'invited' | 'suspended'
  default_role         text,
  default_customer_id  uuid references customer(id),
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz,
  updated_by           uuid
);

-- ─── role_assignments ────────────────────────────────────────────────────────
-- A user may have more than one role; corporate roles must have a customer_id.

create table if not exists role_assignments (
  id                uuid primary key default gen_random_uuid(),
  user_profile_id   uuid not null references user_profiles(id) on delete cascade,
  role              text not null,
  -- allowed: 'ebrrar_super_admin' | 'ebrrar_operations_admin' | 'kitchen_operations'
  --          | 'corporate_admin' | 'corporate_employee' | 'management_viewer'
  customer_id       uuid references customer(id),
  is_default        boolean not null default false,
  effective_from    date not null default current_date,
  effective_to      date,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz,
  updated_by        uuid
);

-- ─── user_invitations ────────────────────────────────────────────────────────

create table if not exists user_invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  full_name    text,
  role         text not null,
  customer_id  uuid references customer(id),
  invited_by   uuid,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  expires_at   timestamptz,
  status       text not null default 'pending'
  -- allowed: 'pending' | 'accepted' | 'expired' | 'cancelled'
);

-- ─── audit_events ────────────────────────────────────────────────────────────

create table if not exists audit_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,
  actor_user_id  uuid,
  actor_role     text,
  target_type    text,
  target_id      uuid,
  customer_id    uuid,
  before         jsonb,
  after          jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_events_type        on audit_events(event_type);
create index if not exists idx_audit_events_actor       on audit_events(actor_user_id);
create index if not exists idx_audit_events_created     on audit_events(created_at desc);
create index if not exists idx_role_assignments_profile on role_assignments(user_profile_id);
create index if not exists idx_role_assignments_role    on role_assignments(role);
create index if not exists idx_user_profiles_auth       on user_profiles(auth_user_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all auth tables (these contain sensitive identity data).

alter table user_profiles   enable row level security;
alter table role_assignments enable row level security;
alter table user_invitations enable row level security;
alter table audit_events     enable row level security;

-- user_profiles: users can read their own profile; service role can do everything.
create policy "Users can read own profile"
  on user_profiles for select
  using (auth_user_id = auth.uid());

create policy "Service role manages profiles"
  on user_profiles for all
  using (auth.role() = 'service_role');

-- role_assignments: users can read their own assignments.
create policy "Users can read own roles"
  on role_assignments for select
  using (
    user_profile_id in (
      select id from user_profiles where auth_user_id = auth.uid()
    )
  );

create policy "Service role manages role assignments"
  on role_assignments for all
  using (auth.role() = 'service_role');

-- audit_events: only service role writes; admins can read via service key.
create policy "Service role manages audit events"
  on audit_events for all
  using (auth.role() = 'service_role');

-- user_invitations: only service role.
create policy "Service role manages invitations"
  on user_invitations for all
  using (auth.role() = 'service_role');
