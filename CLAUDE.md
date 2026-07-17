# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server (port 5173)
- `npm run build` — production build to `dist/`
- `npm run lint` — Oxlint (`.oxlintrc.json`: `react/rules-of-hooks` error, `react/only-export-components` warn)
- `npm run preview` — preview a production build

There is no test suite configured in `package.json`. Deploy is automatic via `.github/workflows/deploy.yml` on push to `main`: it builds with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` secrets and FTP-pushes `dist/` to Hostinger.

## Architecture

Six & Out is a React 19 + Vite SPA for a single-operator cricket ground booking business. It uses **Supabase (Postgres) as the sole data store accessed directly from the client** — there is no local database, no offline queue, and no custom backend, despite [docs/v1_spec.md](docs/v1_spec.md) describing an earlier offline-first design (local SQLite via `sql.js`/OPFS, a `sync_queue` table, a `service-worker.js`). That plan was abandoned; **`src/sync.js` and `src/audit.js` are dead code left over from it** — nothing imports them, and `src/db.js`'s `initDb()` is now a no-op comment (`// data lives in Supabase`). Don't "fix" or wire these back up without checking with the user first; treat `docs/v1_spec.md` as historical context, not the current design.

### Data flow

- `src/supabase.js` creates the single Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (env vars, not committed).
- `src/db.js` is the only data-access layer — every Supabase query for bookings, statuses, and inventory goes through it. Reads join bookings to their status row (`withStatuses`) to decorate each booking with `status_label`, `status_color`, `status_availability` client-side, since Postgres FKs aren't denormalized.
- Soft deletes: bookings are never hard-deleted; `deleteBooking` sets `deleted_at`, and every read filters `.is('deleted_at', null)`.
- Statuses are fully operator-defined rows (label, color, `availability`: `hard_block` | `soft_flag` | `ignore`), not a hardcoded enum — availability search and badge rendering both read this at query time, so editing a status's `availability` retroactively changes conflict behavior for every booking already on that status.
- `src/context/AppContext.jsx` loads statuses once at startup and exposes `dbReady`/`dbError`/`statuses` app-wide; `src/context/ThemeContext.jsx` handles light/dark.

### Business-day model

The ground's operating day runs 5 AM–5 AM, not midnight–midnight (`BUSINESS_DAY_START_HOUR` in [src/utils.js](src/utils.js)). A booking starting before 5 AM belongs to the *previous* calendar day's business day. `actualToBusinessValue`/`businessValueToActualDate` convert between what's stored (real calendar datetime) and what the operator sees/picks in forms; `businessDayKey`/`todayBusinessDay` are used anywhere bookings are grouped or navigated by day (dashboard, calendar, stats). Always use these helpers rather than raw calendar-day math when touching date logic — the naive interpretation is wrong here by design.

### Revenue/stats semantics

`src/lib/stats.js` defines "Completed" purely by **status label string match** ("completed", case-insensitive) — statuses carry no other financial semantics. A Completed booking's full `total_amount` counts as revenue and it's considered fully settled regardless of `advance_paid`; every other booking counts only `advance_paid` as revenue and anything unpaid as outstanding. `getBookingsWithBalance` in `db.js` mirrors this logic client-side because PostgREST can't filter on a comparison between two columns.

### App shell

`src/App.jsx` is a hand-rolled shell (no router) with a `screen` string state (`dashboard` | `calendar` | `settings`) and a `modal` state (`add` | `edit` | `search`) driving `BookingForm`/`SearchModal` as overlays. `src/components/ui/*` are shadcn-generated primitives (`components.json`, style `radix-luma`) — regenerate/extend via shadcn rather than hand-editing generated primitives where possible.

### Path alias

`@/*` → `src/*` (configured in both `vite.config.js` and `jsconfig.json`). Use it instead of relative `../../` imports.

### Feature/decision brain

[docs/brain/](docs/brain/) is an Obsidian vault logging *why* features were built and decisions were made, complementing this file's *what/how*. Check it for context on non-obvious history; add a note there when shipping a notable feature or making a decision worth remembering.


## Playwrite MCP
- Never use playright for testing.