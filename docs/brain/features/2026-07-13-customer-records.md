---
date: 2026-07-13
type: feature
tags: [customers, bookings, autocomplete]
---

# Customer records

Added a first-class `customers` table (name, phone, alt_phone, notes,
soft-delete) plus a nullable `bookings.customer_id` FK, a dedicated
"Customers" screen, and name/phone autocomplete in `BookingForm` so a repeat
customer can be picked instead of retyped.

## Why

Customer data previously lived only as two denormalized columns
(`customer_name`, `phone`) on `bookings`, with no way to see a customer's
booking history, store notes, or avoid re-typing details for repeat
customers.

## Design decisions

- **FK + snapshot, not a strict FK migration**: `bookings.customer_name`/
  `phone` stay as-is (a point-in-time snapshot); `customer_id` is nullable and
  additive. Renaming a customer later never rewrites booking history, and
  walk-ins without a saved customer still work unchanged.
- **Phone is the sole dedupe key.** Autocomplete on both the name and phone
  fields in `BookingForm` (`CustomerSuggestInput`, matches via
  `searchCustomers` against name/phone/alt_phone) queries the same table
  either way. On save, an unlinked booking is matched by exact **normalized**
  phone (`findCustomerByPhone` in `src/db.js`), silently creating a customer
  if none matches. A booking with **no phone creates no customer** and stays
  unlinked — a phoneless, name-keyed customer just duplicated the same
  person's phoned record, so the earlier name-fallback (`findCustomerByName`)
  was removed. Never blocks the booking save (wrapped in try/catch).
- **Phone normalization.** All phones are stored/compared in the local
  `0XXXXXXXXXX` form via `normalizePhone` in `src/utils.js` (mirrored by
  `pg_temp.normalize_pk_phone` in the customers migration), so `+92 3XX…`,
  `0092 3XX…`, and a bare `3XX…` missing its leading 0 all resolve to one
  customer instead of duplicating. A **partial unique index**
  (`customers_phone_active_key`, `20260714160000_customers_phone_unique`)
  enforces one active customer per phone at the DB level as a backstop to the
  app's pre-insert check; the 23505 is mapped to a friendly message in
  `createCustomer`/`updateCustomer`. `searchCustomers` only normalizes a query
  that is phone-shaped (digits, no letters), so a name containing digits like
  "Ground 5" is still searched literally.
- **Deleting a customer is a soft delete that leaves `bookings.customer_id`
  pointing at the (now-hidden) row.** Every customer read filters
  `deleted_at`, so the deleted customer never resurfaces in autocomplete or
  lists; nulling the FK on every linked booking would cost a bulk update for
  no display benefit since the snapshot columns already carry what's shown.
  A genuine *hard* DELETE of a customer row (only ever manual, in SQL) is
  governed by `bookings_customer_id_fkey`, set to **ON DELETE SET NULL**
  (`20260714140000_customer_fk_on_delete`) so the booking survives with its
  snapshot and just loses the link — never cascades.
- Schema + backfill/dedupe now live in real migrations under
  `supabase/migrations/` (`20260713120000_customers` +
  `20260714140000_customer_fk_on_delete`); the old hand-run
  `docs/sql/2026-07-13-customers.sql` is superseded. The customers migration's
  Section 2 is idempotent/self-correcting (re-normalize → merge dupes →
  insert → link).

## Notes/links

- `src/pages/Customers.jsx`: a **server-side** paginated/sortable/searchable
  table (name, contact, booking count, revenue, outstanding, last booking) +
  add/edit/delete and a per-customer booking-history dialog whose totals reuse
  `computeStats` from `src/lib/stats.js`. It reads the `customer_directory`
  view via `getCustomersPage` (PostgREST `range`/`order`/`count`), so the page
  doesn't slow down as customers grow — the client never holds the whole list.
- **`customer_directory` view** (`20260714150000_customer_directory_view`) is
  the aggregate read model: each live customer + booking_count / revenue /
  outstanding / last_booking_at. Revenue math is duplicated here in SQL from
  `src/lib/stats.js` (Completed-label → full total, else advance) — if that
  rule changes, update BOTH. `security_invoker` so it uses the anon table
  grants rather than being a security-definer view.
- `src/db.js` "Customers" section: `getCustomersPage`, `getCustomerById`,
  `searchCustomers`, `findCustomerByPhone`, `createCustomer`, `updateCustomer`,
  `deleteCustomer`, `getBookingsByCustomer`. (The name-only `findCustomerByName`
  and the unpaginated `getCustomers` were removed once phoneless customers
  stopped being created and the screen moved to server-side paging.)
- Nav: `Customers` added to `Header.jsx`'s `NAV_ITEMS` and to the screen
  switch in `App.jsx`, between Calendar and Settings.
