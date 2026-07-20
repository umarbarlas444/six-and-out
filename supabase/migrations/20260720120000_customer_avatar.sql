-- Optional captain photo on a customer record.
--
-- Customers are text-only today, so the Customers screen has no visual handle
-- on a row. This adds a nullable avatar_url holding the PUBLIC URL of an object
-- in the `customer-images` storage bucket (created in the companion migration
-- 20260720120100_customer_images_bucket). Nullable by design: the photo is
-- optional everywhere, and customers created inline from the booking form never
-- set it — those rows fall back to an initials avatar in the UI.

alter table "public"."customers"
  add column if not exists "avatar_url" text;

-- The customer_directory view enumerates its columns explicitly, so a new base
-- table column is invisible to the Customers screen until the view is
-- re-declared. Everything below is unchanged from
-- 20260714150000_customer_directory_view except the added c.avatar_url.
--
-- Dropped rather than `create or replace`d: replace can only APPEND columns to
-- an existing view, and avatar_url sits mid-list next to the other customer
-- fields, so replace fails with "cannot change name of view column". Nothing
-- else in the database depends on this view — only the client reads it — so a
-- drop is safe. Any future column added mid-list needs the same treatment.
drop view if exists public.customer_directory;

create view public.customer_directory
with (security_invoker = true) as
select
  c.id,
  c.name,
  lower(c.name) as name_ci,   -- case-insensitive sort key for the Customers screen
  c.phone,
  c.alt_phone,
  c.notes,
  c.avatar_url,
  c.created_at,
  c.updated_at,
  coalesce(agg.booking_count, 0) as booking_count,
  coalesce(agg.revenue, 0)       as revenue,
  coalesce(agg.outstanding, 0)   as outstanding,
  agg.last_booking_at
from public.customers c
left join lateral (
  select
    count(*) as booking_count,
    sum(case when lower(trim(s.label)) = 'completed'
             then bk.total_amount
             else bk.advance_paid end) as revenue,
    sum(case when lower(trim(s.label)) = 'completed' then 0
             when bk.total_amount > bk.advance_paid then bk.total_amount - bk.advance_paid
             else 0 end) as outstanding,
    max(bk.date_start) as last_booking_at
  from public.bookings bk
  left join public.statuses s on s.id = bk.status
  where bk.customer_id = c.id
    and bk.deleted_at is null
) agg on true
where c.deleted_at is null;

grant select on public.customer_directory to anon, authenticated;

-- If applied by hand in the SQL editor rather than `supabase db push`, nudge
-- PostgREST to pick up the new column immediately:
--   notify pgrst, 'reload schema';
