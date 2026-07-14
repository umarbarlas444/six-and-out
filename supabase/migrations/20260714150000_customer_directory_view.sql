-- Aggregated read model for the Customers screen.
--
-- Each row is one live customer plus their booking count and money stats, so
-- the screen can paginate / sort / filter SERVER-SIDE (PostgREST range + order
-- + count) instead of pulling every customer to the client and slowing down as
-- the customer list grows.
--
-- Revenue mirrors src/lib/stats.js exactly: a booking whose status label is
-- "completed" (case-insensitive) counts its full total_amount and owes
-- nothing; every other booking counts only advance_paid as revenue and its
-- unpaid remainder (total_amount - advance_paid, when positive) as outstanding.
-- Only non-deleted bookings are counted.
--
-- security_invoker so the view runs with the caller's (anon) privileges plus
-- the existing table grants (see 20260714120000_anon_table_grants), rather than
-- as a security-definer view owned by postgres.

create or replace view public.customer_directory
with (security_invoker = true) as
select
  c.id,
  c.name,
  lower(c.name) as name_ci,   -- case-insensitive sort key for the Customers screen
  c.phone,
  c.alt_phone,
  c.notes,
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
-- PostgREST to pick up the new view immediately:
--   notify pgrst, 'reload schema';
