-- Phase 1 — Backward-compatibility default for organization_id
-- Older versions of the app insert bookings/statuses WITHOUT organization_id.
-- Since the column is NOT NULL, those inserts would fail. Default the column to
-- the "Six & Out" org so legacy clients keep working during the transition.
--
-- ⚠️ Transitional shim: this routes any write that omits organization_id into the
-- Six & Out org. Once every client sends organization_id explicitly (post-auth,
-- Phases 2–6) this default should be DROPPED, otherwise a future tenant's client
-- that forgets to set organization_id would silently write into Six & Out.
-- RLS (Phase 3) will further constrain who can write what, but the default itself
-- must still be removed at that point.

alter table public.bookings
  alter column organization_id set default '67f06812-af31-42bd-88f5-cd3c03bfbbdf';

alter table public.statuses
  alter column organization_id set default '67f06812-af31-42bd-88f5-cd3c03bfbbdf';
