import { businessDayKey, addDays } from '@/utils.js'

// Aggregate a set of expenses. `total` is the only money figure — expenses have
// no partial-payment concept the way bookings do (see bookingRevenue in
// stats.js), so there's nothing to net off.
export function computeExpenseStats(expenses) {
  let total = 0
  for (const e of expenses) total += Number(e.amount) || 0
  return { count: expenses.length, total }
}

// Expenses -> [{ label, color, amount }] grouped by category, largest first.
// Shape mirrors statusBreakdown() in stats.js so the donut reads the same.
export function categoryBreakdown(expenses) {
  const by = {}
  for (const e of expenses) {
    const key = e.category_id || 'none'
    if (!by[key]) {
      by[key] = { label: e.category_label || 'Uncategorised', color: e.category_color || '#6B7280', amount: 0 }
    }
    by[key].amount += Number(e.amount) || 0
  }
  return Object.values(by).sort((a, b) => b.amount - a.amount)
}

// Bookings' dailySeries() zero-fills every business day in the range; this does
// the same for expenses so the two series share an x-axis exactly. Keep the
// zero-fill: without it the trend chart would skip days with no spending and
// silently compress the axis against the income line.
export function dailyExpenseSeries(expenses, startDay, endDay) {
  const byDay = {}
  for (const e of expenses) {
    const day = businessDayKey(e.spent_at)
    byDay[day] = (byDay[day] || 0) + (Number(e.amount) || 0)
  }
  const out = []
  for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
    out.push({ day, expenses: byDay[day] || 0 })
  }
  return out
}

// Merge the zero-filled income series from dailySeries() with the expense
// series into one dataset for the dual-line chart. Both cover the identical
// day range, so this is a positional zip keyed by day.
export function mergeIncomeExpenseSeries(incomeSeries, expenseSeries) {
  const expByDay = Object.fromEntries(expenseSeries.map(d => [d.day, d.expenses]))
  return incomeSeries.map(d => ({
    day: d.day,
    income: d.revenue,
    expenses: expByDay[d.day] || 0,
  }))
}
