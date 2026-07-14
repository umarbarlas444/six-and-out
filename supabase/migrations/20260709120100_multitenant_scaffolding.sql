-- Baseline (already live): multi-tenant / auth scaffolding.
--
-- This layer exists in the remote DB but is currently UNUSED by the app, which
-- runs single-operator against the anon key with no login (see CLAUDE.md). It
-- is reproduced here so the baseline round-trips to the real schema.

create type "public"."org_role" as enum ('owner', 'admin', 'staff');

create type "public"."member_status" as enum ('active', 'invited', 'disabled');

-- Tenant. One arena workspace per row.
create table if not exists "public"."organizations" (
  "id"            uuid not null default gen_random_uuid(),
  "name"          text not null,
  "slug"          text not null,
  "timezone"      text not null default 'Asia/Karachi',
  "currency"      text not null default 'PKR',
  "contact_email" text,
  "contact_phone" text,
  "settings"      jsonb not null default '{}'::jsonb,
  "created_at"    timestamp with time zone not null default now(),
  constraint "organizations_pkey" primary key ("id"),
  constraint "organizations_slug_key" unique ("slug")
);

-- The single tenant every existing booking/status row is assigned to (the
-- hardcoded default org id used by bookings.organization_id / statuses.organization_id
-- in 20260709120200). Seeded here so that FK validates on a fresh DB; only runs
-- on local `db reset` or a brand-new deploy.
insert into "public"."organizations" ("id", "name", "slug")
values ('67f06812-af31-42bd-88f5-cd3c03bfbbdf', 'Six & Out', 'six-and-out')
on conflict ("id") do nothing;

-- Public profile data mirrored from auth.users.
create table if not exists "public"."profiles" (
  "id"         uuid not null,
  "full_name"  text,
  "phone"      text,
  "avatar_url" text,
  "created_at" timestamp with time zone not null default now(),
  constraint "profiles_pkey" primary key ("id"),
  constraint "profiles_id_fkey" foreign key ("id") references "auth"."users"("id") on delete cascade
);

-- Which users belong to which org, with role and status.
create table if not exists "public"."organization_members" (
  "id"              uuid not null default gen_random_uuid(),
  "organization_id" uuid not null,
  "user_id"         uuid not null,
  "role"            "public"."org_role" not null default 'staff',
  "status"          "public"."member_status" not null default 'active',
  "created_at"      timestamp with time zone not null default now(),
  constraint "organization_members_pkey" primary key ("id"),
  constraint "organization_members_organization_id_user_id_key" unique ("organization_id", "user_id"),
  constraint "organization_members_organization_id_fkey" foreign key ("organization_id") references "public"."organizations"("id") on delete cascade,
  constraint "organization_members_user_id_fkey" foreign key ("user_id") references "auth"."users"("id") on delete cascade
);

create index if not exists "organization_members_organization_id_idx" on "public"."organization_members" using btree ("organization_id");
create index if not exists "organization_members_user_id_idx" on "public"."organization_members" using btree ("user_id");

-- Auto-create a profile row when a new auth user signs up.
create or replace function "public"."handle_new_user"()
returns trigger
language plpgsql
security definer
set search_path to ''
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

-- Standard Supabase auth hook wiring the function to auth.users.
drop trigger if exists "on_auth_user_created" on "auth"."users";
create trigger "on_auth_user_created"
  after insert on "auth"."users"
  for each row execute function "public"."handle_new_user"();
