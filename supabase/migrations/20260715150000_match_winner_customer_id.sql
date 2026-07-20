-- booking_matches.winner: positional token -> winning team's customer id.
--
-- Was text 'team1' | 'team2' | 'draw' (not null). Now it holds the winning
-- team's customer id, or NULL for a draw (rain etc.) — consistent with
-- bookings.series_winner_id and letting a match point straight at who won.
--
-- The winner is a customer, so it FKs to customers(id). Because customers are
-- soft-deleted (deleted_at, never hard-deleted), the FK stays valid even after
-- a customer is "deleted" in the UI.
--
-- Idempotent enough for both states: on remote it converts existing token rows;
-- on a fresh local `db reset` booking_matches is empty so the updates are
-- no-ops.

-- 1. Allow NULL (draws) before we start writing ids/nulls.
alter table "public"."booking_matches" alter column "winner" drop not null;

-- 2. Convert existing token rows to customer ids (draw / anything else -> null).
update "public"."booking_matches" m
set winner = case
  when m.winner = 'team1' then b.customer_id
  when m.winner = 'team2' then b.customer_id_2
  else null
end
from "public"."bookings" b
where m.booking_id = b.id
  and m.winner in ('team1', 'team2', 'draw');

-- Belt-and-suspenders: null out any stray token that didn't join to a booking
-- (customer ids are UUIDs, so this never touches a real id).
update "public"."booking_matches"
set winner = null
where winner in ('team1', 'team2', 'draw');

-- 3. Point winner at customers(id).
alter table "public"."booking_matches"
  drop constraint if exists "booking_matches_winner_fkey";
alter table "public"."booking_matches"
  add constraint "booking_matches_winner_fkey"
  foreign key ("winner") references "public"."customers"("id");

-- If applied by hand in the SQL editor rather than `supabase db push`:
--   notify pgrst, 'reload schema';
