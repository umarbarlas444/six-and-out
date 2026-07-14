-- Enforce one active customer per phone number at the database level.
--
-- The app already normalizes phones and checks for an existing customer before
-- inserting (findCustomerByPhone), but that check races and can be bypassed by
-- a direct write. This partial unique index makes a duplicate active phone
-- impossible; createCustomer/updateCustomer in src/db.js map the resulting
-- 23505 to a friendly message. Deleted (soft) rows and NULL phones are exempt,
-- so a customer can be re-created after deletion and phoneless rows are allowed.
--
-- The unique index would FAIL to build if duplicates still exist, so this
-- migration first re-normalizes and merges any remaining dupes (same logic as
-- 20260713120000_customers Section 2) — making it safe to apply even on a DB
-- where that manual cleanup was never run. Idempotent / safe to re-run.

create or replace function pg_temp.normalize_pk_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') = '' then null
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^92\d{10}$'
      then '0' || right(regexp_replace(raw, '\D', '', 'g'), 10)
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^3\d{9}$'
      then '0' || regexp_replace(raw, '\D', '', 'g')
    else regexp_replace(coalesce(raw, ''), '\D', '', 'g')
  end
$$;

-- Normalize, then merge any customers that share a normalized phone: move
-- their bookings onto the keeper (most recently updated), soft-delete the rest.
update customers
set phone = pg_temp.normalize_pk_phone(phone)
where deleted_at is null
  and phone is not null
  and phone <> pg_temp.normalize_pk_phone(phone);

with grouped as (
  select id, phone,
         row_number() over (partition by phone order by updated_at desc) as rn
  from customers
  where deleted_at is null and phone is not null
),
keepers as (
  select phone, id as keeper_id from grouped where rn = 1
)
update bookings b
set customer_id = k.keeper_id
from grouped d
join keepers k using (phone)
where b.customer_id = d.id and d.rn > 1;

with grouped as (
  select id, phone,
         row_number() over (partition by phone order by updated_at desc) as rn
  from customers
  where deleted_at is null and phone is not null
)
update customers c
set deleted_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
from grouped g
where c.id = g.id and g.rn > 1;

-- One active customer per phone. Partial so soft-deleted rows and phoneless
-- customers don't collide.
create unique index if not exists customers_phone_active_key
  on public.customers (phone)
  where deleted_at is null and phone is not null;
