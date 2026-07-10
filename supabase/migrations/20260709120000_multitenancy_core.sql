-- Phase 1 — Multi-tenancy core
-- Creates the tenant (organizations), per-user profiles, and the
-- organization <-> user membership join table with roles.
--
-- RLS is intentionally NOT enabled here; it is added in Phase 3 for every table.
-- (Do not expose these tables to the anon key in production before Phase 3.)

-- ── Enums ─────────────────────────────────────────────────────────────────────

-- Role semantics:
--   owner  — the signup user; full control incl. billing and deleting the org.
--   admin  — everything except deleting the org / transferring ownership; can
--            invite/remove staff.
--   staff  — create/edit/cancel bookings and view customers; cannot change org
--            settings, pricing, or members.
create type public.org_role as enum ('owner', 'admin', 'staff');

-- Membership lifecycle: active users, pending invites, and disabled seats.
create type public.member_status as enum ('active', 'invited', 'disabled');

-- ── organizations (the tenant) ────────────────────────────────────────────────

create table public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,            -- used in public URLs
  timezone      text        not null default 'Asia/Karachi',
  currency      text        not null default 'PKR',
  contact_email text,
  contact_phone text,
  settings      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.organizations is 'Tenant. One arena workspace per row.';

-- ── profiles (one row per auth user) ──────────────────────────────────────────

create table public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  full_name  text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile data mirrored from auth.users.';

-- Auto-create a profile row whenever a new auth user is created.
-- security definer so it can write to public.profiles regardless of the caller;
-- empty search_path forces fully-qualified names (defense against hijacking).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── organization_members (join table) ─────────────────────────────────────────

create table public.organization_members (
  id              uuid            primary key default gen_random_uuid(),
  organization_id uuid            not null references public.organizations (id) on delete cascade,
  user_id         uuid            not null references auth.users (id) on delete cascade,
  role            public.org_role not null default 'staff',
  status          public.member_status not null default 'active',
  created_at      timestamptz     not null default now(),
  unique (organization_id, user_id)
);

comment on table public.organization_members is 'Which users belong to which org, with role and status.';

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);
