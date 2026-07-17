-- Teams, series & per-match results.
--
-- A booking now hosts a SERIES between two teams (both are customer records):
--   - Team 1 = the booker, already stored as customer_id / customer_name / phone.
--   - Team 2 = a second customer, chosen later (on edit).
-- Each match in the series is won by team1/team2 or drawn (e.g. rained off). The
-- series_result is whoever won more matches (draw when equal & > 0); it's stored,
-- not derived, so the operator can override an odd finish. See
-- docs/brain/features and the leaderboard plan for the full rationale.
--
-- Unlike the 20260709*/20260713* baselines, this migration is NOT already applied
-- to remote — `supabase db push` runs it for the first time on prod.
--
-- RLS note: the baseline app tables run WITHOUT RLS locally (see
-- migrations/README.md) but WITH allow-all policies on prod. This new table
-- enables RLS + an allow-all policy in the migration itself, so local and prod
-- match: wide-open access via the anon key, single-operator (see CLAUDE.md).

-- 1. Team 2 + series result on bookings.
alter table "public"."bookings"
  add column if not exists "customer_id_2"   text references "public"."customers"("id"),
  add column if not exists "customer_name_2" text,
  add column if not exists "phone_2"         text,
  -- 'team1' | 'team2' | 'draw' | null  (null = no series recorded yet)
  add column if not exists "series_result"   text;

create index if not exists "idx_bookings_customer_id_2"
  on "public"."bookings" ("customer_id_2");

-- 2. Per-match results for a booking's series.
create table if not exists "public"."booking_matches" (
  "id"           text primary key,          -- client-generated via generateId()
  "booking_id"   text not null references "public"."bookings"("id"),
  "match_number" integer not null,          -- 1-based order within the series
  "winner"       text not null,             -- 'team1' | 'team2' | 'draw'
  "created_at"   text not null,
  "updated_at"   text not null
);

create index if not exists "idx_booking_matches_booking"
  on "public"."booking_matches" ("booking_id");

-- 3. Grants + wide-open RLS so the anon key can read/write (matches how the
-- other app tables behave on prod). New tables are NOT auto-exposed under the
-- current Supabase default, so these grants are required, not optional.
grant select, insert, update, delete
  on table "public"."booking_matches"
  to anon, authenticated;

alter table "public"."booking_matches" enable row level security;

drop policy if exists "booking_matches_all" on "public"."booking_matches";
create policy "booking_matches_all"
  on "public"."booking_matches"
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- If applied by hand in the SQL editor rather than `supabase db push`, nudge
-- PostgREST to pick up the new table/columns immediately:
--   notify pgrst, 'reload schema';
