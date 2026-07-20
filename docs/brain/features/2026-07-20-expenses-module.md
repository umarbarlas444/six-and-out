# Expenses module

**Date:** 2026-07-20
**Touches:** `src/pages/Expenses.jsx`, `src/pages/ExpenseCategoryMgmt.jsx`, `src/lib/expenseStats.js`, `src/components/expenses/*`, `src/db.js`, `src/App.jsx`, `src/components/Header.jsx`, `src/pages/Settings.jsx`, `supabase/migrations/20260720130000_expenses.sql`

## Why

The app tracked money **in** and never money **out**, so it could show revenue but
never profit. The Expenses screen records spending and pairs it against booking
revenue to answer one question the dashboard couldn't: what's actually left.

Deliberately a separate screen. The dashboard is the day-to-day operating view —
who's booked, who owes — and folding profit into it would change a screen the
operator reads constantly. `Dashboard.jsx` is untouched by this feature.

## Decisions

**Income is bookings only, reusing `computeStats().revenue` verbatim.** Not a
second, purer "cash basis" number defined locally. Two screens both saying
"Revenue" and disagreeing is a reporting bug generator; the Expenses page shows
the same figure the dashboard shows, minus expenses. Consequence to remember:
`bookingRevenue` is a hybrid — a Completed booking counts its full total even if
the advance was short, everything else counts only `advance_paid` — so Net is
"realized revenue minus spending", not accrual profit. Outstanding is shown as a
fourth card specifically so Net is never read in isolation.

**Categories are operator-defined rows, not a hardcoded enum.** Clone of the
`statuses` pattern: `expense_categories` with label/colour/`is_default`/
`sort_order`, CRUD in Settings, hard delete behind a reference-count guard.
Free text was the alternative and it silently fragments reporting the first time
"Electricty" gets typed — which makes the breakdown chart untrustworthy, and the
breakdown is the main reason to categorise at all. Seeded with Rent, Electricity,
Salaries, Maintenance, Equipment, Other; all editable.

**`spent_at` is a full datetime bucketed by the 5 AM business day, not a plain
date.** A plain `DATE` column was the first instinct — rent has no time of day —
but purchases made at the ground at 1 AM during a late session genuinely belong to
that night's business day, and a date column files them under the next morning.
The form converts through `actualToBusinessValue` / `businessValueToActualDate`
exactly like `BookingForm` does, so the operator picks the business day directly
rather than inheriting a raw `now` that could land on the wrong side of the
cutoff. New expenses default to **noon** on the current business day: noon can
never be read back as the previous day by `businessDayKey`.

**No recurring expenses, and no "copy last month" either.** Rent and salaries are
monthly and predictable, so auto-generation is tempting. There is no server and
no scheduler — generation would have to run client-side on page load, meaning the
financial record would depend on someone having opened the app, and could
double-generate. A copy-previous-period button was scoped and then cut as well.
Every expense is entered by hand. **Known consequence: a forgotten month silently
overstates Net.** If that bites, a copy button is the cheap fix, not a scheduler.

**Period logic is shared, not duplicated.** It started as a copy inside
`Expenses.jsx` specifically to avoid touching `Dashboard.jsx`. That constraint was
lifted the same day — the dashboard needed the expanded preset list too — so it
was extracted to `src/lib/period.js` (`PERIOD_LABELS`, `getPeriodRange`,
`periodLabel`, `periodDayCount`) with the UI in
`src/components/DateRangeFilter.jsx`. Both screens now import both. This matters
beyond tidiness: divergent week-start or month-bound logic between the income
screen and the expenses screen produces figures that don't reconcile.

**Nine presets, business-day aligned:** today, yesterday, this/last week,
this/last month, this/last year, custom. Weeks are Monday-based (unchanged from
the original dashboard behaviour). `last_month` relies on JS normalizing month
`-1` to the previous December, so January needs no special case.

**Custom range uses a calendar popover** (`react-day-picker` v10 via shadcn's
`calendar`), replacing the two bare `<input type="date">` fields. Costs ~22KB
gzipped, taking the bundle from 384KB to 407KB gz — it was already over Vite's
500KB raw warning threshold.

**The picker counts day clicks itself instead of using react-day-picker's range
mode `onSelect`.** This took three attempts to get right, so the reasoning is
worth keeping: RDP v10's range state machine reports `{from: day, to: day}` on
the **first** click, not `{from: day, to: undefined}` as v8 did. Any "do I have
both ends yet?" check against its output is therefore indistinguishable from a
genuine two-click range, and the popover commits and closes after a single click
— which is exactly the bug that shipped twice. The component now tracks a
`pendingFrom` date and commits on the second `onDayClick`, accepting the two
dates in either order. `selected` is derived from that local state purely for
highlighting. Version-proof, and independent of RDP's selection semantics.
Closing the popover mid-selection discards the pending date rather than
half-applying it.

**Charts are a local copy too.** `components/expenses/ExpenseCharts.jsx`
duplicates the dashboard's chart styling rather than importing from
`components/dashboard/Charts.jsx`, whose components are shaped around booking
counts. Same reasoning, same debt.

## Gotchas

- **Expenses soft-delete; categories hard-delete.** Matches bookings and statuses
  respectively. `deleteExpenseCategory` only counts *live* expenses in its guard —
  a soft-deleted expense shouldn't keep a category undeletable forever, but it
  does mean deleting a category can orphan the `category_id` on soft-deleted rows.
  `withCategories` renders those as "Uncategorised" if they're ever restored.
- **The category filter narrows the cards, the list and the donut together**, so
  Net always matches the rows on screen. Filtering to Rent shows Net as
  income-minus-rent, which is *not* true profit. The Expenses card relabels itself
  to the category name when filtered; that label is the only cue.
- `dailyExpenseSeries` zero-fills every business day in the range, mirroring
  `dailySeries`. The zero-fill is load-bearing: without it the trend chart would
  skip days with no spending and compress its axis out of alignment with income.
- Timestamps are stored as **`text`** ISO strings, not `timestamptz` — matching
  every other table in this schema (`booking_matches.created_at text not null`).
- RLS mirrors the `booking_matches` precedent: enabled, with wide-open `anon`
  policies. **Expense data is more sensitive than bookings** — salaries, rent,
  margin — and the anon key ships in the client bundle, so anyone with the
  deployed URL can read or write it. This doesn't make the existing exposure
  worse, but it raises the stakes of it. Real auth is unbuilt and would need to
  cover every table, not just this one.
- Nav is now six items. `Header.jsx`'s desktop bar is getting tight; a seventh
  will need the overflow menu on smaller widths.
- **Settings is now section-based** (`SECTIONS` in `Settings.jsx`): a sidebar on
  desktop, a scrollable chip row on mobile, with Booking Statuses selected by
  default. Adding a settings area means adding one entry to that array — but the
  section component must render its own heading, since the sidebar label is not a
  heading. `StatusMgmt` lost its `mx-auto max-w-2xl` wrapper and its `h1` dropped
  to `h2` so all three sections match; width is now owned by the Settings shell.
- Both money screens default to **this week**, deliberately the same default, so
  switching between them compares like with like. There's no router, so period
  and category selections reset when you navigate away and back.
- `is_default` is an **integer** column (0/1). `{row.is_default && <Badge/>}`
  renders a literal `0` on screen, because React treats the number 0 as valid
  content — unlike `false`/`null`. Both `StatusMgmt` and `ExpenseCategoryMgmt`
  coerce with `!!`. This stayed hidden in `StatusMgmt` for a long time only
  because legacy status rows hold `NULL` rather than `0`. Any future integer flag
  needs the same treatment.
