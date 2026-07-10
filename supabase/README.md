# Supabase migrations

SQL migrations for the multi-tenant SaaS conversion. **These are written for
review and are not yet applied to the live database.**

## Files

| Migration | Phase | What it does |
|---|---|---|
| `20260709120000_multitenancy_core.sql` | 1 | `org_role`/`member_status` enums; `organizations`, `profiles`, `organization_members` tables; auto-create-profile trigger on `auth.users`. |
| `20260709120100_tenant_scoping.sql` | 1 | Adds `organization_id` (+ index) to `bookings` and `statuses` (nullable, to allow the backfill below). |
| `20260709120200_seed_default_org_and_backfill.sql` | 1 | Seeds the **"Six & Out"** org, assigns all existing bookings/statuses to it, then sets `organization_id` `NOT NULL`. |
| `20260709120300_default_org_on_tenant_tables.sql` | 1 | Defaults `organization_id` to the Six & Out org so legacy app versions that omit it keep working. **Transitional — drop once all clients send it (Phase 3+).** |

## Important notes

- **`organization_id` ends up `NOT NULL`.** It is added nullable in `120100` only
  so `120200` can backfill existing rows first; the constraint is applied in the
  same pair. Fixed org id: `67f06812-af31-42bd-88f5-cd3c03bfbbdf` (slug `six-and-out`).
- **Owner membership is not created yet.** No auth user exists until Phase 2, so
  the default org has no `organization_members` row. Phase 4/6 links the real
  owner account to it.
- **No RLS yet.** Row Level Security for every table is added in Phase 3. Do not
  point production traffic at these tables with the anon key until then.

## Applying (once approved)

Using the Supabase CLI (requires the project to be linked):

```bash
supabase link --project-ref gvmokneokwvrdxnftmag
supabase db push          # applies pending migrations in supabase/migrations/
```

Or paste each file into the Supabase Studio SQL editor in filename order.

After applying, regenerate TypeScript types:

```bash
supabase gen types typescript --linked > src/database.types.ts
```
