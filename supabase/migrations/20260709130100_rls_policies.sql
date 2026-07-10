-- Phase 3 — RLS policies (per table, per operation; all scoped TO authenticated
-- so the anon key gets no access at all).

-- ── organizations ─────────────────────────────────────────────────────────────
-- No INSERT policy: orgs are created via the create_organization_with_owner()
-- SECURITY DEFINER function (Phase 4), which bypasses RLS.

create policy "orgs_select_members"
  on public.organizations for select to authenticated
  using (id in (select private.user_org_ids()));

create policy "orgs_update_owner_admin"
  on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']))
  with check (private.has_org_role(id, array['owner', 'admin']));

create policy "orgs_delete_owner"
  on public.organizations for delete to authenticated
  using (private.has_org_role(id, array['owner']));

-- ── profiles ──────────────────────────────────────────────────────────────────
-- No INSERT/DELETE policy: profiles are created by the on_auth_user_created
-- trigger and removed via the auth.users cascade.

create policy "profiles_select_self_and_coworkers"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.org_coworker_ids())
  );

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── organization_members ──────────────────────────────────────────────────────

create policy "members_select_own_orgs"
  on public.organization_members for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy "members_insert_owner_admin"
  on public.organization_members for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin']));

-- Owner/admin can update OTHER members' rows only. Excluding your own row
-- (user_id <> auth.uid()) is what prevents self role-escalation.
create policy "members_update_owner_admin_others"
  on public.organization_members for update to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and user_id <> (select auth.uid())
  )
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
  );

create policy "members_delete_owner_admin_others"
  on public.organization_members for delete to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and user_id <> (select auth.uid())
  );

-- ── bookings (tenant-scoped) ──────────────────────────────────────────────────
-- Any active member (incl. staff) can read/create/update bookings. Cancelling a
-- booking is a soft delete (deleted_at) done via UPDATE. Hard DELETE is owner/admin.

create policy "bookings_select_members"
  on public.bookings for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy "bookings_insert_members"
  on public.bookings for insert to authenticated
  with check (organization_id in (select private.user_org_ids()));

create policy "bookings_update_members"
  on public.bookings for update to authenticated
  using (organization_id in (select private.user_org_ids()))
  with check (organization_id in (select private.user_org_ids()));

create policy "bookings_delete_owner_admin"
  on public.bookings for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

-- ── statuses (config/settings) ────────────────────────────────────────────────
-- All members can read; only owner/admin can mutate (staff cannot change config).

create policy "statuses_select_members"
  on public.statuses for select to authenticated
  using (organization_id in (select private.user_org_ids()));

create policy "statuses_insert_owner_admin"
  on public.statuses for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin']));

create policy "statuses_update_owner_admin"
  on public.statuses for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));

create policy "statuses_delete_owner_admin"
  on public.statuses for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));
