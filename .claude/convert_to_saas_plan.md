# Implementation Plan: Multi-Tenant SaaS Auth for Cricket Arena Booking Platform

## Instructions for the AI executing this plan

- Work through the phases **in order**. Do not start a phase until the previous one is complete and verified.
- After each phase, stop and summarize what was changed (files, migrations, env vars) before moving on.
- Never disable RLS to "make something work." If a query fails under RLS, fix the policy or the query.
- All database changes must be written as Supabase migration files (SQL), not applied ad-hoc through the dashboard.
- Ask me before making destructive changes to existing tables or data.

## Context

- **Current state:** A React SPA booking platform for a single cricket arena, using Supabase (Postgres) as the backend. Bookings, courts/slots, and customers exist but there is no authentication and no concept of tenants.
- **Goal:** First migrate the application to Next.js (App Router), then convert it into a multi-tenant SaaS where:
  1. Arena owners **sign up** and get their own isolated workspace (organization).
  2. Each organization manages **its own bookings, courts, pricing, and customers**.
  3. An org **admin can invite staff users** who handle bookings with limited permissions.
- **Target stack:** Next.js (App Router), TypeScript, Supabase (Auth + Postgres + RLS), Tailwind.

---

## Phase 0 — Migrate the existing React SPA to Next.js

Do this **before any auth or multi-tenancy work**. The goal is feature parity, not a rewrite: the app should look and behave exactly as it does today, just running on Next.js.

1. **Audit the current app first.** Produce a short inventory before writing code: routes (and the router library in use), state management, data-fetching patterns (direct `supabase-js` calls vs. hooks vs. React Query), env variable usage, styling approach, build tooling (CRA/Vite), and any browser-only libraries (calendar widgets, charts, drag-and-drop). Flag anything that will break under SSR (`window`, `document`, `localStorage` access at module scope).
2. **Scaffold a fresh Next.js project** (App Router, TypeScript, Tailwind, ESLint) in the same repo (e.g. as the new root or a `/next` directory during transition) rather than mutating the old build setup in place. Copy over Tailwind config, global styles, fonts, and static assets.
3. **Map SPA routes to the App Router.** Each React Router route becomes a `page.tsx`; shared layout/nav becomes `layout.tsx`. Preserve URL structure so existing links keep working; add `redirects()` in `next.config` for any paths that must change.
4. **Port components incrementally, client-first.** Mark ported interactive components `"use client"` initially so everything works, then selectively convert pages to server components where it helps (public pages, data-heavy lists). Do not try to make everything a server component in this phase.
5. **Handle SSR breakage:** wrap browser-only libraries with `next/dynamic` (`ssr: false`) where needed, move `window`/`localStorage` access into effects, and replace `import.meta.env.VITE_*` / `REACT_APP_*` env vars with `NEXT_PUBLIC_*` equivalents.
6. **Keep Supabase access client-side for now** using a single browser client module. Do not restructure data fetching into server components/actions yet — that happens naturally in Phases 2–6.
7. **Replace the old build/deploy pipeline:** update scripts, `.gitignore`, hosting config (e.g. Vercel), and remove CRA/Vite artifacts once parity is confirmed.
8. **Verify parity** with a manual test pass of every route and booking flow (create, edit, cancel, calendar views) before deleting the old app code.

**Acceptance criteria:** every existing page and booking flow works identically on Next.js; production build passes with no SSR errors; old build tooling removed; env vars migrated.

## Phase 1 — Multi-tenancy data model

Create the foundational tables via a migration:

1. **`organizations`** — the tenant. Columns: `id uuid pk`, `name`, `slug` (unique, for URLs), `created_at`, plus arena-level settings (timezone, currency, contact info) as columns or a `settings jsonb`.
2. **`profiles`** — one row per auth user. Columns: `id uuid pk references auth.users(id) on delete cascade`, `full_name`, `phone`, `avatar_url`, `created_at`. Create a `on auth.users insert` trigger (security definer function) that auto-inserts a profile row.
3. **`organization_members`** — join table. Columns: `organization_id`, `user_id`, `role` (enum: `owner`, `admin`, `staff`), `status` (`active`, `invited`, `disabled`), `created_at`. Unique on `(organization_id, user_id)`.
4. **Add `organization_id uuid not null references organizations(id)`** to every tenant-scoped table: bookings, courts/pitches, slots, customers, pricing rules, etc. Add indexes on `organization_id` for each.

Role semantics:
- `owner` — the signup user; full control including billing and deleting the org.
- `admin` — everything except deleting the org / transferring ownership; can invite/remove staff.
- `staff` — create/edit/cancel bookings and view customers; cannot change org settings, pricing, or members.

**Acceptance criteria:** migration applies cleanly on a fresh database; TypeScript types regenerated via `supabase gen types`.

## Phase 2 — Supabase Auth integration in Next.js

1. Install `@supabase/ssr` and replace the single browser client from Phase 0 with the three standard clients: browser client, server client (cookies-based), and middleware client.
2. Add Next.js **middleware** that refreshes the session and protects all routes under `/dashboard` (redirect to `/login` if unauthenticated).
3. Build auth pages: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` (route handler for code exchange).
4. Enable **email/password** with email confirmation in Supabase Auth settings. Add Google OAuth as a second provider (leave a TODO for me to add the Google credentials in the dashboard).
5. Store no roles in JWT for now — resolve role via `organization_members` on the server (simpler and always fresh). Optimize later with a custom claim if needed.

**Acceptance criteria:** a user can sign up, confirm email, log in, log out; hitting `/dashboard` while logged out redirects to `/login`.

## Phase 3 — Row Level Security

1. Enable RLS on **every** table, including `organizations`, `profiles`, `organization_members`, and all tenant-scoped tables.
2. Create helper functions (security definer, `stable`):
   - `private.user_org_ids()` → set of org ids the current `auth.uid()` is an **active** member of.
   - `private.has_org_role(org_id uuid, roles text[])` → boolean.
3. Policies (per table, per operation — no `FOR ALL` shortcuts on sensitive tables):
   - Tenant-scoped tables: `select/insert/update/delete` allowed only when `organization_id in (select private.user_org_ids())`; restrict `delete` and settings/pricing mutations to `owner`/`admin`.
   - `organization_members`: members can read their own org's members; only `owner`/`admin` can insert/update/delete rows; nobody can escalate their own role (check via `with check`).
   - `profiles`: users can read profiles of people in their orgs; can update only their own.
4. Ensure the **anon key is never used for privileged operations**. Anything requiring the service role key must live in server-only code (route handlers / server actions), never in client components.

**Acceptance criteria:** write a SQL test script (or use `supabase test db`) proving: user A cannot read/modify org B's bookings; staff cannot change pricing; a member cannot promote themselves.

## Phase 4 — Signup & onboarding flow

1. After first login with no org membership, redirect to `/onboarding`.
2. Onboarding wizard: create organization (name, slug, timezone, currency) → add first court(s) → set basic operating hours/pricing → land on dashboard.
3. Org creation must be a **server action / route handler** using a security-definer Postgres function `create_organization_with_owner(name, slug)` that inserts the org and the `owner` membership atomically.
4. Add an org switcher in the app shell for users who belong to multiple orgs (rare, but keep the data model honest). Persist the active org in a cookie; all queries scope to the active org.

**Acceptance criteria:** a brand-new user can go from signup to a working dashboard with one court, entirely self-serve.

## Phase 5 — Team management (admin invites staff)

1. Build `/dashboard/settings/team`: list members with role and status; invite form (email + role); actions to change role, disable, or remove members (owner/admin only).
2. Invitation flow:
   - Create an `invitations` table: `id`, `organization_id`, `email`, `role`, `token` (hashed), `invited_by`, `expires_at`, `accepted_at`.
   - Server action sends the invite using `supabase.auth.admin.inviteUserByEmail()` (service role, server-only) with a redirect to `/invite/accept?token=...`; if the user already exists, email them a plain accept link instead.
   - Accept page: authenticated user with a valid, unexpired token gets an `organization_members` row with the invited role; mark invitation accepted.
3. Enforce role rules server-side (not just UI): staff cannot access team settings, org settings, or pricing pages; use a shared `requireRole()` helper in server components/actions.

**Acceptance criteria:** admin invites a staff email; staff accepts, logs in, can create/cancel bookings, but gets a 403/redirect on settings and pricing routes — verified both in UI and by direct request.

## Phase 6 — Retrofit existing features to be tenant-aware

1. Update every existing query (bookings CRUD, calendar views, customer lists, reports) to filter by the active `organization_id` — even though RLS enforces it, explicit filtering keeps queries indexed and intent clear.
2. Update booking creation, availability checks, and any public booking pages to resolve the org from the URL slug (e.g. `/{org-slug}/book`) so each arena gets a public booking page scoped to its own courts and slots.
3. Migrate existing production data: create the first organization for my current arena, backfill `organization_id` on all existing rows, and create my owner membership. Write this as a one-off migration script and show it to me before running.

**Acceptance criteria:** existing bookings and courts all appear under the first org; the public booking page works per-slug; no query in the codebase runs unscoped.

## Phase 7 — Hardening & polish

1. Rate-limit auth endpoints and invitation sending.
2. Add audit fields (`created_by`, `updated_by`) to bookings and settings tables.
3. Confirm email templates (confirm signup, invite, reset password) are branded and point to the correct production URL.
4. Security pass: verify no service-role usage in client bundles, all server actions validate input (zod), RLS test suite passes, and session handling follows `@supabase/ssr` current best practices.

## Out of scope for now (note as future phases)

- Subscription billing (Stripe) and plan limits (courts per plan, staff seats).
- Custom domains per org.
- JWT custom claims for role caching.

---

## Deliverables checklist

- [ ] React SPA fully migrated to Next.js App Router with feature parity (Phase 0)
- [ ] SQL migrations for all schema changes and RLS policies
- [ ] Regenerated Supabase TypeScript types
- [ ] Auth pages + middleware + onboarding wizard
- [ ] Team management UI + invitation flow
- [ ] RLS test script proving tenant isolation and role enforcement
- [ ] Data backfill script for the existing arena
- [ ] Short README section documenting roles, env vars, and how invites work
