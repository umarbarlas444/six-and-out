-- Row-level security policies for the `inventory` table.
--
-- Supabase enables RLS on new tables by default, which blocks every operation
-- until a policy grants it — hence "new row violates row-level security policy"
-- when the app (using the anon key) tries to set stock.
--
-- The app has no auth: it talks to Supabase with the anon key from the browser,
-- like it does for bookings/statuses. So we allow the anon (and authenticated)
-- role to read and insert. We deliberately grant NO update/delete policy, which
-- makes the single stock row immutable at the database level too — reinforcing
-- the "set once" rule until stock adjustments are designed later.

alter table public.inventory enable row level security;

grant select, insert on public.inventory to anon, authenticated;

-- Drop-then-create keeps this migration idempotent (Postgres has no
-- "create policy if not exists").
drop policy if exists "inventory_select" on public.inventory;
create policy "inventory_select"
  on public.inventory for select
  using (true);

drop policy if exists "inventory_insert" on public.inventory;
create policy "inventory_insert"
  on public.inventory for insert
  with check (true);
