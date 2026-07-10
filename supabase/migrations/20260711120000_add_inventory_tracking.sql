-- Inventory tracking for consumables handed out to teams (balls & tapes).
--
-- Two parts:
--   1. Per-booking counters recording how many balls/tapes a booking used.
--   2. A single-row `inventory` table holding current stock, set once from
--      the Settings page.
--
-- Idempotent (IF NOT EXISTS) so it reconciles cleanly with databases where the
-- objects were already created by hand.

-- 1. Per-booking equipment counters.
alter table public.bookings
  add column if not exists balls_new integer not null default 0,
  add column if not exists balls_old integer not null default 0,
  add column if not exists tapes     integer not null default 0;

-- 2. Current stock of consumables. A single row (id = 'main') holds the counts;
--    the primary key enforces "set once" — a second insert is rejected. Future
--    stock adjustments will be layered on in a later migration.
create table if not exists public.inventory (
  id         text primary key,
  balls_new  integer not null default 0,
  balls_old  integer not null default 0,
  tapes      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
