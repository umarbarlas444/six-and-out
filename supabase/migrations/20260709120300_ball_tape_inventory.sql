-- Baseline (already live): per-booking ball & tape consumption.
--
-- Added for the dashboard / ball-tape management feature — each booking records
-- how many new balls, old balls, and tapes it used.

alter table "public"."bookings"
  add column if not exists "balls_new" integer not null default 0;

alter table "public"."bookings"
  add column if not exists "balls_old" integer not null default 0;

alter table "public"."bookings"
  add column if not exists "tapes" integer not null default 0;
