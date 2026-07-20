-- Replace bookings.series_result (text 'team1'|'team2'|'draw') with
-- series_winner_id: the winning team's customer id, or null for a draw / no
-- result. This is more useful and relational — you can read who won directly,
-- rather than a positional token — and matches how teams are modelled (a team
-- IS a customer).
--
-- The leaderboard recomputes standings from booking_matches, so this column is
-- informational/denormalised only; dropping the old text values loses nothing
-- that can't be re-derived from the match rows.
--
-- Idempotent across both states: on remote (series_result exists) it swaps the
-- columns; on a fresh local `db reset` (20260715120000 already creates
-- series_result) the drop/add still lands on the same final shape.

alter table "public"."bookings"
  add column if not exists "series_winner_id" text references "public"."customers"("id");

create index if not exists "idx_bookings_series_winner_id"
  on "public"."bookings" ("series_winner_id");

alter table "public"."bookings"
  drop column if exists "series_result";

-- If applied by hand in the SQL editor rather than `supabase db push`:
--   notify pgrst, 'reload schema';
