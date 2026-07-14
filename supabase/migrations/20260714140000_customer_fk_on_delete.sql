-- Set ON DELETE SET NULL on bookings.customer_id -> customers.id.
--
-- Customers are normally SOFT-deleted (deleteCustomer sets deleted_at; the row
-- stays), so this FK's on-delete rule only ever fires on a genuine hard DELETE
-- of a customer row — e.g. a manual cleanup in the SQL editor. When that
-- happens we want the booking to SURVIVE with its snapshot customer_name/phone
-- intact and simply lose the link, never to cascade-delete booking history.
-- ON DELETE SET NULL does exactly that.
--
-- The original FK (created inline in 20260713120000_customers) used the default
-- NO ACTION, which would instead BLOCK deleting a customer that still has
-- bookings. This is a real forward migration: `supabase db push` applies it to
-- the remote, and a local `db reset` runs it right after the customers
-- migration (which creates the constraint as NO ACTION) to land the same state.
--
-- Idempotent: drop whatever constraint exists and re-add it with the rule.

alter table "public"."bookings"
  drop constraint if exists "bookings_customer_id_fkey";

alter table "public"."bookings"
  add constraint "bookings_customer_id_fkey"
  foreign key ("customer_id") references "public"."customers"("id") on delete set null;
