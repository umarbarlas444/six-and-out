-- Drop orphan team artifacts.
--
-- team_a_id, team_b_id, match_results (on bookings) and a standalone "teams"
-- table were all added to the remote DB by hand during earlier experimentation
-- and are referenced NOWHERE in the app (no query, no migration, no UI). The
-- real teams/series feature lives in 20260715120000_teams_series.sql
-- (customer_id_2 / customer_name_2 / phone_2 on bookings + the booking_matches
-- table) — teams ARE customer records, there is no separate teams table. So
-- these are dead weight. `if exists` keeps this a no-op on a fresh local DB
-- where they never existed.
--
-- NOTE: dropping the "teams" table is irreversible. It holds no app data (the
-- app never wrote to it), but eyeball its contents in the Supabase table editor
-- before running this on remote if you want to be sure.

alter table "public"."bookings"
  drop column if exists "team_a_id",
  drop column if exists "team_b_id",
  drop column if exists "match_results";

-- Drop columns first (in case they FK'd into teams), then the orphan table.
drop table if exists "public"."teams";
