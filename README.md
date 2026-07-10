# Six & Out — Cricket Ground Booking

A booking-management app for a cricket arena, built with **Next.js (App Router)**, **React 19**, **Tailwind v4**, shadcn/ui, and **Supabase** (Postgres) as the backend.

> Migrated from a Vite SPA to Next.js (Phase 0 of the multi-tenant SaaS plan in
> `.claude/convert_to_saas_plan.md`). The app is currently a single-arena,
> client-rendered app; auth and multi-tenancy are added in later phases.

## Requirements

- **Node.js 20+** — Tailwind v4's native engine (`@tailwindcss/oxide`) requires
  Node ≥ 20. On Node 18 `npm install` silently skips the native binary and the
  dev server fails to compile CSS (`Cannot find native binding`). CI already
  uses Node 20.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with oxlint |

## Environment variables

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your supabase anon key>
```

These are read in `src/supabase.js`. (Previously `VITE_SUPABASE_*` under Vite.)

## Structure

```
app/                 Next.js App Router (layout, page, manifest, global CSS)
  layout.tsx         Root layout + theme-flash script
  page.tsx           Renders the client SPA shell (ssr: false)
  globals.css        Tailwind v4 + theme tokens + FullCalendar overrides
src/
  App.jsx            Client app shell (screen + modal state)
  supabase.js        Browser Supabase client
  db.js              Supabase data access (bookings, statuses)
  utils.js           Date/business-day helpers
  context/           App + Theme context providers
  components/        Header, CalendarView (FullCalendar), StatusBadge, ui/ (shadcn)
  pages/             Home, BookingForm, StatusMgmt, SearchModal
```

The app is rendered client-side only (`next/dynamic`, `ssr: false`) because it
relies on browser-only libraries (FullCalendar, `localStorage`) and talks to
Supabase directly from the client. Server components and server-side data
fetching are introduced in the auth/multi-tenancy phases.
