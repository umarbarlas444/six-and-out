-- Phase 3 — RLS helper functions + enablement
-- Helpers live in a `private` schema that is NOT exposed to the API. They are
-- SECURITY DEFINER so they bypass RLS on organization_members — this is what
-- prevents infinite recursion when member/tenant policies call them.

create schema if not exists private;

-- Org ids the current user is an ACTIVE member of.
create or replace function private.user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select organization_id
  from public.organization_members
  where user_id = (select auth.uid())
    and status = 'active';
$$;

-- True if the current user holds one of `roles` in `org_id` (and is active).
create or replace function private.has_org_role(org_id uuid, roles text[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role::text = any(roles)
  );
$$;

-- All user ids that share an active org with the current user (for reading
-- co-workers' profiles).
create or replace function private.org_coworker_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select distinct user_id
  from public.organization_members
  where organization_id in (
    select organization_id
    from public.organization_members
    where user_id = (select auth.uid())
      and status = 'active'
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.org_coworker_ids() to authenticated;

-- Enable RLS on every table. With RLS on and no matching policy, access is
-- denied (default-deny). Policies are added in the next migration.
alter table public.organizations       enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_members enable row level security;
alter table public.bookings             enable row level security;
alter table public.statuses             enable row level security;
