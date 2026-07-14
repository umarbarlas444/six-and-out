# Supabase migrations

Until now the schema was built by hand-running SQL in the Supabase dashboard, so
there was no migration history in the repo. These files establish one.

## Baseline (`20260709120*`) — already live, do not expect a push to run them

The four `20260709120000`–`20260709120300` files are a **reconstructed baseline**
of the schema that was already applied to the remote database before migrations
existed. Their version ids deliberately match the four entries already in the
remote `supabase_migrations` history table, so:

- `supabase migration list` shows them as synced (local == remote), and
- `supabase db push` treats them as already applied and skips them.

They are split by feature for readability, not because they ran in exactly this
shape historically:

| File | Contents |
|------|----------|
| `..120000_core_booking_schema` | `bookings`, `statuses`, `inventory` — the core single-operator domain |
| `..120100_multitenant_scaffolding` | `organizations`, `organization_members`, `profiles`, enums, `handle_new_user()` — **unused** auth/tenant layer that exists in the live DB |
| `..120200_org_links` | `organization_id` columns/FKs/indexes on `bookings` & `statuses` |
| `..120300_ball_tape_inventory` | per-booking `balls_new` / `balls_old` / `tapes` |

Only a local `supabase db reset` ever executes these.

## Forward migrations — real, apply with `supabase db push`

- `20260713120000_customers` — the customers table + `bookings.customer_id` FK +
  a one-time backfill. Section 2 is self-correcting/idempotent: it re-normalizes
  stored phones, merges customers that share a normalized phone (fixing
  duplicates an earlier version created for numbers missing a leading 0, e.g.
  "3124617395" vs "03124617395"), then inserts/links from bookings. Supersedes
  the manual `docs/sql/2026-07-13-customers.sql`. **Already applied to the
  remote**, so `db push` won't re-run it — to fix existing live data, run the
  file's Section 2 (create-function through the final link `update`) once in the
  SQL editor; a fresh `db reset` gets it right from this file directly.
- `20260714140000_customer_fk_on_delete` — changes `bookings_customer_id_fkey`
  to `ON DELETE SET NULL` so hard-deleting a customer nulls the link on their
  bookings rather than being blocked (NO ACTION) or cascade-deleting the
  bookings. Genuinely pending, so `supabase db push` applies it to remote.
- `20260714150000_customer_directory_view` — a `security_invoker` view
  (`customer_directory`) that decorates each live customer with their booking
  count + revenue/outstanding (same "Completed" rule as `src/lib/stats.js`) plus
  a `name_ci` case-insensitive sort key. Backs the Customers screen's
  server-side search/sort/pagination (`getCustomersPage` in `src/db.js`).
  Genuinely pending → `db push` applies it; if run by hand,
  `notify pgrst, 'reload schema';` so PostgREST sees the view.
- `20260714160000_customers_phone_unique` — partial unique index
  `customers_phone_active_key` on `customers(phone) where deleted_at is null and
  phone is not null`, so a phone can't be reused by two active customers
  (createCustomer/updateCustomer surface 23505 as a friendly message). Re-runs
  the normalize+merge dedupe first so the index can't fail on existing dupes.

## Known intentional drift: RLS

The live DB has **RLS enabled with wide-open policies** (`allow all` on
`bookings`/`statuses`, `inventory_select`/`inventory_insert` on `inventory`).
By operator decision these migrations **omit RLS entirely**. Consequence: a local
`supabase db reset` produces a schema with RLS *disabled*, differing from
production. If RLS is ever tightened, add it as a new forward migration.
