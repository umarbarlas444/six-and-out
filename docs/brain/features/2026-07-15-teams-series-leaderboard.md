---
date: 2026-07-15
type: feature
tags: [bookings, teams, series, leaderboard, edge-function]
---

# Teams, series & monthly leaderboard

A booking can now host a **series** between two teams (both are customer
records): Team 1 is the booker (existing `customer_id`), Team 2 is a second
customer chosen later on edit (`customer_id_2` + `customer_name_2`/`phone_2`
snapshot columns). Each match in the series is logged in the new
`booking_matches` table; `winner` holds the winning team's customer id (FK to
customers) or null for a draw — the booking form works in positional
`team1`/`team2`/`draw` tokens and maps to/from ids at the load/save boundary
(migration `20260715150000`). The
booking stores `series_winner_id` (the winning team's customer id, null for a
draw / no result — auto-derived from the matches). An earlier text
`series_result` column was replaced by this in `20260715140000`; three orphan
columns (`team_a_id`/`team_b_id`/`match_results`) and a stray hand-made `teams`
table were dropped in `20260715130000`.

A **Leaderboard** screen (`src/pages/Leaderboard.jsx`, nav wired in
`App.jsx`/`Header.jsx`) ranks teams for a business-month by **series won, then
matches won**. A match win = 2 points; a drawn match (e.g. rained off) scores
nothing and isn't a match win. The same ranking is exposed publicly as JSON by
the Supabase Edge Function `supabase/functions/leaderboard` for the Arena
landing page.

## Why

The operator runs competitive games and wanted to track who played, who won
each match, and a monthly "who's on top" board — plus a public feed of it for
the marketing site.

## Notes/links

- Aggregation is client-side (like `src/lib/stats.js`): `computeLeaderboard()`
  in `src/lib/leaderboard.js` is a **pure, import-free reducer**; the business-
  day (5 AM) month filtering happens before it in `db.js#getLeaderboardMonth`.
- The Edge Function **re-implements** the reducer + a `businessDayKey` pinned to
  `Asia/Karachi` (the app relies on the browser's local tz). Keep the two in
  sync — they must produce identical rankings.
- Match set is saved via `db.js#replaceBookingMatches` (delete-then-insert).
- Migration `20260715120000_teams_series.sql` is the FIRST migration NOT already
  applied to remote — it runs on `supabase db push`. It also adds explicit anon
  grants + wide-open RLS on `booking_matches` (new tables aren't auto-exposed).
- The Edge Function is deployed out-of-band (`supabase functions deploy
  leaderboard`); the SPA CI in `.github/workflows/deploy.yml` doesn't touch it.
