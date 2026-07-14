-- Baseline (already live): tie the core booking tables to an organization.
--
-- The default '67f0…' org id is the hardcoded single tenant every existing row
-- was assigned to; it matches the live schema defaults.

alter table "public"."bookings"
  add column if not exists "organization_id" uuid not null default '67f06812-af31-42bd-88f5-cd3c03bfbbdf'::uuid;

alter table "public"."bookings"
  add constraint "bookings_organization_id_fkey" foreign key ("organization_id") references "public"."organizations"("id") on delete cascade;

create index if not exists "bookings_organization_id_idx" on "public"."bookings" using btree ("organization_id");

alter table "public"."statuses"
  add column if not exists "organization_id" uuid not null default '67f06812-af31-42bd-88f5-cd3c03bfbbdf'::uuid;

alter table "public"."statuses"
  add constraint "statuses_organization_id_fkey" foreign key ("organization_id") references "public"."organizations"("id") on delete cascade;

create index if not exists "statuses_organization_id_idx" on "public"."statuses" using btree ("organization_id");
