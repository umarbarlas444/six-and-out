-- Phase 1 — Seed the default organization and backfill existing data
-- Creates the "Six & Out" organization for the existing single arena, assigns
-- every existing booking and status to it, then enforces organization_id NOT NULL
-- so no tenant-scoped row can ever exist without an owner org.
--
-- Idempotent: the org is inserted with a fixed id (on conflict do nothing) and
-- the backfill only touches rows that are still unassigned. On a fresh database
-- the backfill updates zero rows and the NOT NULL constraint still applies.
--
-- The org's owner membership is NOT created here because no auth user exists yet
-- (auth arrives in Phase 2). Phase 4/6 links the real owner account to this org.

-- 1. Seed the default organization.
insert into public.organizations (id, name, slug, timezone, currency)
values (
  '67f06812-af31-42bd-88f5-cd3c03bfbbdf',
  'Six & Out',
  'six-and-out',
  'Asia/Karachi',
  'PKR'
)
on conflict (id) do nothing;

-- 2. Backfill existing rows onto the default org.
update public.bookings
  set organization_id = '67f06812-af31-42bd-88f5-cd3c03bfbbdf'
  where organization_id is null;

update public.statuses
  set organization_id = '67f06812-af31-42bd-88f5-cd3c03bfbbdf'
  where organization_id is null;

-- 3. Now that every row has an org, forbid nulls going forward.
alter table public.bookings
  alter column organization_id set not null;

alter table public.statuses
  alter column organization_id set not null;
