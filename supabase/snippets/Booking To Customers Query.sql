create or replace function pg_temp.normalize_pk_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') = '' then null
    -- 12 digits starting with the PK country code (92 + 10-digit mobile
    -- number) -> collapse to the 11-digit local "0XXXXXXXXXX" form.
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^92\d{10}$'
      then '0' || right(regexp_replace(raw, '\D', '', 'g'), 10)
    -- 10 digits starting with the mobile prefix 3, missing the leading 0
    -- (e.g. "3124617395") -> prepend it.
    when regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^3\d{9}$'
      then '0' || regexp_replace(raw, '\D', '', 'g')
    else regexp_replace(coalesce(raw, ''), '\D', '', 'g')
  end
$$;

-- 2a. Re-normalize any phone a prior run stored un-normalized
-- ("3124617395" -> "03124617395"). updated_at is left untouched so it still
-- reflects the customer's last real edit, not this cleanup.
update customers
set phone = pg_temp.normalize_pk_phone(phone)
where deleted_at is null
  and phone is not null
  and phone <> pg_temp.normalize_pk_phone(phone);

-- 2b. Merge customers that now share a normalized phone: move their bookings
-- onto the keeper (most recently updated row per phone), then soft-delete the
-- losers. No-op on a fresh DB.
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

-- 2c. Insert customers for bookings not yet represented, keyed by normalized
-- phone. Bookings with NO phone are intentionally skipped: a phoneless,
-- name-keyed customer just duplicates the same person's phoned record, so we
-- never create one from a booking (those bookings simply stay unlinked).
with src as (
  select *, 'p:' || pg_temp.normalize_pk_phone(phone) as ckey
  from bookings
  where deleted_at is null
    and pg_temp.normalize_pk_phone(phone) is not null
),
ranked as (
  select distinct on (ckey) ckey, customer_name, phone
  from src
  order by ckey, created_at desc
),
existing as (
  select 'p:' || pg_temp.normalize_pk_phone(phone) as ckey
  from customers
  where deleted_at is null
    and pg_temp.normalize_pk_phone(phone) is not null
)
insert into customers (id, name, phone, created_at, updated_at)
select gen_random_uuid()::text,
       trim(r.customer_name),
       pg_temp.normalize_pk_phone(r.phone),
       to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
from ranked r
where r.ckey not in (select ckey from existing);

-- 2d. Link any still-unlinked bookings to their customer by normalized phone.
-- Phoneless bookings have no dedupe key and stay unlinked (customer_id null).
update bookings b
set customer_id = c.id
from customers c
where b.customer_id is null
  and b.deleted_at is null
  and c.deleted_at is null
  and pg_temp.normalize_pk_phone(b.phone) is not null
  and pg_temp.normalize_pk_phone(c.phone) is not null
  and pg_temp.normalize_pk_phone(b.phone) = pg_temp.normalize_pk_phone(c.phone);

-- Verify: no customer should share a normalized phone (bookings without a
-- phone will legitimately still have customer_id null).
-- select phone, count(*) from customers where deleted_at is null and phone is not null group by phone having count(*) > 1;
