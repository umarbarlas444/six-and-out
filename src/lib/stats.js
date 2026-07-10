import { BUSINESS_DAY_START_HOUR, businessDayKey, addDays } from '@/utils.js'

// A Completed booking is settled in full: its total counts as revenue and it
// owes nothing, regardless of what advance_paid says. Matched by status label —
// statuses carry no financial semantics, so renaming that status changes what
// counts as revenue.
export function isCompleted(b) {
  return (b.status_label || '').trim().toLowerCase() === 'completed'
}

// A booking's realized revenue: a Completed booking counts its full total;
// any other booking counts only the advance actually collected so far.
export function bookingRevenue(b) {
  return isCompleted(b) ? Number(b.total_amount) || 0 : Number(b.advance_paid) || 0
}

// Aggregate KPIs over a set of bookings.
export function computeStats(bookings) {
  let hours = 0
  let revenue = 0
  let fromAdvances = 0
  let outstanding = 0
  for (const b of bookings) {
    hours += (new Date(b.date_end) - new Date(b.date_start)) / 3600000
    const total = Number(b.total_amount) || 0
    const paid = Number(b.advance_paid) || 0
    revenue += bookingRevenue(b)
    if (!isCompleted(b)) {
      fromAdvances += paid
      if (total > paid) outstanding += total - paid
    }
  }
  return { count: bookings.length, hours, revenue, fromAdvances, outstanding }
}

// Bookings -> [{ day: 'YYYY-MM-DD', count, revenue }] covering every business
// day from startDay to endDay inclusive, zero-filled for empty days.
export function dailySeries(bookings, startDay, endDay) {
  const byDay = {}
  for (const b of bookings) {
    const k = businessDayKey(b.date_start)
    const entry = (byDay[k] ??= { count: 0, revenue: 0 })
    entry.count += 1
    entry.revenue += bookingRevenue(b)
  }
  const out = []
  for (let d = startDay; d <= endDay; d = addDays(d, 1)) {
    out.push({ day: d, count: byDay[d]?.count ?? 0, revenue: byDay[d]?.revenue ?? 0 })
  }
  return out
}

function formatHourLabel(h) {
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}${h < 12 ? 'AM' : 'PM'}`
}

// How many bookings touch each hour of the day, ordered from the business-day
// start (5 AM → 4 AM) so the chart reads like the ground's actual day.
export function hourHistogram(bookings) {
  const counts = new Array(24).fill(0)
  for (const b of bookings) {
    const end = new Date(b.date_end)
    for (let t = new Date(b.date_start); t < end; t.setHours(t.getHours() + 1)) {
      counts[t.getHours()] += 1
    }
  }
  return Array.from({ length: 24 }, (_, i) => {
    const h = (BUSINESS_DAY_START_HOUR + i) % 24
    return { hour: h, label: formatHourLabel(h), count: counts[h] }
  })
}

// Bookings grouped by status -> [{ label, color, count }], largest first.
export function statusBreakdown(bookings) {
  const m = new Map()
  for (const b of bookings) {
    const cur = m.get(b.status) ?? {
      label: b.status_label || 'Unknown',
      color: b.status_color || '#6B7280',
      count: 0,
    }
    cur.count += 1
    m.set(b.status, cur)
  }
  return [...m.values()].sort((a, b) => b.count - a.count)
}
