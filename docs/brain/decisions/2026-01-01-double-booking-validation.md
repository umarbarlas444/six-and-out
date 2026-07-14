---
date: 2026-01-01
type: decision
tags: [booking-form, validation]
---

# Double-booking validation

`BookingForm` validates that a new or edited booking doesn't overlap an
existing one on the same slot before it can be saved.

## Why

Without this, the single-operator ground could accidentally be booked twice
for an overlapping time — a real risk once bookings are entered directly by
the operator with no second set of eyes checking for conflicts.

## Notes/links

- Built on top of the business-day model — see
  [[2026-01-01-5am-business-day-cutoff]] — so overlap checks compare bookings
  in business-day terms, not naive calendar time.
- Lives in `src/pages/BookingForm.jsx`.
