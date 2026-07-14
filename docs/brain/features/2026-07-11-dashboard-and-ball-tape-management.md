---
date: 2026-07-11
type: feature
tags: [dashboard, stats, inventory]
---

# Dashboard and ball tape management

Added a real dashboard (`src/pages/Dashboard.jsx`) with stat cards, charts,
a bookings list, and a payments-due view, plus a `Settings` page and
inventory management for ball tape (tracked via `CounterInput`).

## Why

The app previously had a single flat `Home.jsx` page (350 lines, removed in
this change) with no aggregate view of revenue, outstanding payments, or
day-to-day operational stats — the operator needed a real dashboard to see
the business at a glance instead of scrolling raw bookings.

## Notes/links

- Revenue/stats logic lives in `src/lib/stats.js` — "Completed" status is
  determined by label string match, see `CLAUDE.md` for the exact semantics.
- New components: `dashboard/BookingsList.jsx`, `dashboard/Charts.jsx`,
  `dashboard/PaymentsDue.jsx`, `dashboard/StatCard.jsx`, `CounterInput.jsx`.
- `App.jsx` shell gained the `dashboard`/`calendar`/`settings` screen states
  as part of this change.
