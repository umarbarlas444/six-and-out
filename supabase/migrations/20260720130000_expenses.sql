-- Expenses module: operator-defined expense categories + expense rows.
--
-- Purpose: the app tracked money IN (bookings) but never money OUT, so there was
-- no way to see profit. The Expenses screen pairs booking revenue (unchanged,
-- straight from src/lib/stats.js computeStats) against these rows to show
-- "revenue after expenses" for a selected period.
--
-- Design decisions (see docs/brain/features/expenses-module.md):
--   - Categories are operator-defined rows, NOT a hardcoded enum — same pattern
--     as `statuses`, so the breakdown chart can be trusted (no free-text typos
--     fragmenting "Electricity" vs "Electricty").
--   - `spent_at` is a full datetime (text ISO, matching every other timestamp in
--     this schema) and is bucketed by the 5 AM business day via businessDayKey,
--     so a 1 AM purchase at the ground lands on that night's business day rather
--     than the next morning. The form converts through
--     actualToBusinessValue/businessValueToActualDate so the operator picks the
--     business day directly.
--   - Expenses soft-delete (`deleted_at`) like bookings; categories hard-delete
--     behind a reference-count guard like statuses.
--   - No recurring/auto-generated expenses: this app is client-only with no
--     scheduler, so rows that generate themselves on page-open would depend on
--     someone opening the app. Every expense is entered by hand.
--
-- RLS note: mirrors the `booking_matches` precedent (20260715120000) — RLS on
-- with wide-open anon policies, single-operator app. This does not make the
-- exposure worse than it already is, but expense data (salaries, rent, margin)
-- is more sensitive than bookings; adding real auth is tracked separately.

-- 1. Operator-defined expense categories.
create table if not exists "public"."expense_categories" (
  "id"         text primary key,           -- client-generated via generateId()
  "label"      text not null,
  "color"      text not null default '#6B7280',
  "is_default" integer not null default 0, -- 0/1, at most one row set — preselected in the form
  "sort_order" integer not null default 0,
  "created_at" text not null,
  "updated_at" text not null
);

-- 2. Expense rows.
create table if not exists "public"."expenses" (
  "id"          text primary key,          -- client-generated via generateId()
  "category_id" text not null references "public"."expense_categories"("id"),
  "amount"      numeric not null check ("amount" > 0),
  "spent_at"    text not null,             -- ISO datetime; bucketed by businessDayKey()
  "notes"       text,
  "created_at"  text not null,
  "updated_at"  text not null,
  "deleted_at"  text                       -- soft delete; reads filter `.is('deleted_at', null)`
);

-- Range queries filter on spent_at between business-day bounds, then order by it.
create index if not exists "idx_expenses_spent_at"
  on "public"."expenses" ("spent_at");

create index if not exists "idx_expenses_category"
  on "public"."expenses" ("category_id");

-- 3. Seed the starting categories. Fixed ids + `on conflict do nothing` so this
-- is idempotent and a re-run (or a db reset) won't duplicate them. The operator
-- can rename, recolour, reorder or delete any of these from Settings.
insert into "public"."expense_categories"
  ("id", "label", "color", "is_default", "sort_order", "created_at", "updated_at")
values
  ('expcat-rent',        'Rent',        '#F97316', 0, 0, now()::text, now()::text),
  ('expcat-electricity', 'Electricity', '#EAB308', 0, 1, now()::text, now()::text),
  ('expcat-salaries',    'Salaries',    '#3B82F6', 0, 2, now()::text, now()::text),
  ('expcat-maintenance', 'Maintenance', '#8B5CF6', 0, 3, now()::text, now()::text),
  ('expcat-equipment',   'Equipment',   '#10B981', 0, 4, now()::text, now()::text),
  ('expcat-other',       'Other',       '#6B7280', 1, 5, now()::text, now()::text)
on conflict ("id") do nothing;

-- 4. Grants + wide-open RLS so the anon key can read/write (matches how the
-- other app tables behave on prod). New tables are NOT auto-exposed under the
-- current Supabase default, so these grants are required, not optional.
grant select, insert, update, delete
  on table "public"."expense_categories", "public"."expenses"
  to anon, authenticated;

alter table "public"."expense_categories" enable row level security;
alter table "public"."expenses" enable row level security;

drop policy if exists "expense_categories_all" on "public"."expense_categories";
create policy "expense_categories_all"
  on "public"."expense_categories"
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "expenses_all" on "public"."expenses";
create policy "expenses_all"
  on "public"."expenses"
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- If applied by hand in the SQL editor rather than `supabase db push`, nudge
-- PostgREST to pick up the new tables immediately:
--   notify pgrst, 'reload schema';
