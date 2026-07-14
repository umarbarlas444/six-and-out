---
date: 2026-01-01
type: decision
tags: [calendar, booking-form, dates]
---

# 5 AM business-day cutoff

The ground's operating day runs 5 AM–5 AM, not midnight–midnight. A booking
starting before 5 AM belongs to the *previous* calendar day's business day.

## Why

A "Thursday 1 AM" booking is really the tail end of Thursday night's business,
not the start of Friday's — that's how the operator thinks about their day,
and the UI needed to match that mental model rather than the naive calendar
interpretation.

## Notes/links

- `BUSINESS_DAY_START_HOUR` and the `actualToBusinessValue` /
  `businessValueToActualDate` helpers in `src/utils.js` convert between what's
  stored (real calendar datetime) and what the operator sees/picks.
- CalendarView extends time-grid views to 05:00–29:00 so post-midnight
  bookings render under the correct day, and shifts month-view events onto
  their business day.
- Always use these helpers rather than raw calendar-day math when touching
  date logic anywhere in the app — see [[2026-01-01-double-booking-validation]]
  for a related date-handling case.
