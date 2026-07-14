-- Baseline (already live): core single-operator booking domain.
--
-- This file — together with the other three 20260709* migrations — is a
-- reconstructed baseline of the schema that was already applied to the remote
-- database by hand (via the Supabase SQL editor) before migrations existed.
-- Its version id matches an existing entry in the remote migration history, so
-- `supabase db push` treats it as already applied and only local `db reset`
-- ever executes it. See supabase/migrations/README.md.
--
-- NOTE: RLS is intentionally omitted from these migrations (operator decision).
-- The live DB has RLS enabled with wide-open "allow all" policies on bookings,
-- statuses, and inventory; a local `db reset` will therefore produce a schema
-- WITHOUT RLS, which differs from production by design.

create table if not exists "public"."bookings" (
  "id"            text not null,
  "customer_name" text not null,
  "phone"         text,
  "date_start"    text not null,
  "date_end"      text not null,
  "status"        text not null default 'inquiry',
  "notes"         text,
  "advance_paid"  real default 0,
  "total_amount"  real default 0,
  "created_at"    text not null,
  "updated_at"    text not null,
  "synced_at"     text,                       -- vestigial: sync design was abandoned
  "deleted_at"    timestamp with time zone,   -- soft delete
  constraint "bookings_pkey" primary key ("id")
);

create table if not exists "public"."statuses" (
  "id"           text not null,
  "label"        text not null,
  "color"        text not null,
  "availability" text not null default 'soft_flag',  -- hard_block | soft_flag | ignore
  "is_default"   integer default 0,
  "sort_order"   integer default 0,
  "created_at"   text not null,
  "updated_at"   text not null,
  "synced_at"    text,
  constraint "statuses_pkey" primary key ("id")
);

-- Seed the operator's current status set. These are the rows already live in the
-- remote DB; this INSERT only runs on a fresh DB (local `db reset` or a brand-new
-- deploy), since the baseline is marked already-applied on the existing remote.
-- organization_id is intentionally omitted here — that column is added in
-- 20260709120200_org_links, which backfills these rows with the default org
-- (seeded in 20260709120100) and then adds the FK.
insert into "public"."statuses" ("id", "label", "color", "availability", "is_default", "sort_order", "created_at", "updated_at") values
  ('f754b6ee-c0bf-484b-98e5-7d89fa0d6a39', 'Inquiry',         '#F59E0B', 'soft_flag',  0, 0, '2026-06-29T19:49:16.801Z', '2026-06-29T19:49:16.801Z'),
  ('5dd29163-8210-4c9a-ad5a-8abbe0240b92', 'Confirmed',       '#3bb066', 'hard_block', 1, 1, '2026-06-29T19:49:16.801Z', '2026-07-03T16:47:31.912Z'),
  ('8d4da73c-1d32-496b-a40b-8db5e2a21ace', 'On Hold',         '#F97316', 'soft_flag',  0, 2, '2026-06-29T19:49:16.801Z', '2026-06-29T19:49:16.801Z'),
  ('dbb5a2cd-336b-4396-9e76-f926d91c173d', 'Cancelled',       '#EF4444', 'ignore',     0, 3, '2026-06-29T19:49:16.801Z', '2026-06-29T19:49:16.801Z'),
  ('23140d8c-5085-4398-bc79-929f6feb1ea9', 'Completed',       '#6B7280', 'ignore',     0, 4, '2026-06-29T19:49:16.801Z', '2026-06-29T19:49:16.801Z'),
  ('62cc851b-94c8-4898-8edf-091830aafa03', 'Advance Paid',    '#3B82F6', 'hard_block', 0, 6, '2026-06-29T18:04:45.725Z', '2026-06-29T18:04:45.725Z'),
  ('85b186d3-018a-4429-b902-bde65c136684', 'Pending Payment', '#ff3a30', 'hard_block', 0, 6, '2026-06-29T20:49:41.259Z', '2026-06-29T20:49:41.259Z')
on conflict ("id") do nothing;

-- Single-row table (id = 'main') holding current consumable stock.
create table if not exists "public"."inventory" (
  "id"         text not null,
  "balls_new"  integer not null default 0,
  "balls_old"  integer not null default 0,
  "tapes"      integer not null default 0,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "inventory_pkey" primary key ("id")
);
