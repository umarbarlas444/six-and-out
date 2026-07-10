-- Phase 1 — Tenant scoping of existing tables (schema)
-- Adds organization_id to every tenant-scoped table the app uses today
-- (bookings, statuses) plus a supporting index for tenant-filtered queries.
--
-- The column is added NULLABLE here so the immediately-following data migration
-- (20260709120200_seed_default_org_and_backfill.sql) can populate existing rows
-- before the NOT NULL constraint is applied. Splitting schema from data keeps
-- each step reviewable and lets the pair apply cleanly on both live and fresh DBs.

alter table public.bookings
  add column organization_id uuid references public.organizations (id) on delete cascade;

create index bookings_organization_id_idx on public.bookings (organization_id);

alter table public.statuses
  add column organization_id uuid references public.organizations (id) on delete cascade;

create index statuses_organization_id_idx on public.statuses (organization_id);
