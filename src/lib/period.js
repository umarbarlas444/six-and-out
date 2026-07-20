import { addDays, formatDate, formatDateInput, todayBusinessDay } from '@/utils.js'

// Shared by the Dashboard and Expenses screens. Previously duplicated in both;
// keep it here so the two money screens can never disagree about what a period
// means — divergent week-start or month-bound logic produces revenue and expense
// figures that don't reconcile.
//
// Every range is expressed as inclusive BUSINESS days ('YYYY-MM-DD'), not
// calendar days — see BUSINESS_DAY_START_HOUR in utils.js. Callers turn them
// into timestamps with getBusinessDayBounds().
export const PERIOD_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  last_week: 'Last week',
  month: 'This month',
  last_month: 'Last month',
  year: 'This year',
  last_year: 'Last year',
  custom: 'Custom range',
}

// Local midday Date for a business-day key — midday avoids DST/UTC edges
// shifting the calendar date underneath us.
const dayToDate = (day) => new Date(day + 'T12:00:00')

// Monday-based start of the week containing `day`.
function weekStart(day) {
  const dow = (dayToDate(day).getDay() + 6) % 7
  return addDays(day, -dow)
}

export function getPeriodRange(period, customFrom, customTo) {
  const today = todayBusinessDay()
  const d = dayToDate(today)
  const y = d.getFullYear()
  const m = d.getMonth()

  switch (period) {
    case 'today':
      return { startDay: today, endDay: today }

    case 'yesterday': {
      const prev = addDays(today, -1)
      return { startDay: prev, endDay: prev }
    }

    case 'week': {
      const startDay = weekStart(today)
      return { startDay, endDay: addDays(startDay, 6) }
    }

    case 'last_week': {
      const startDay = addDays(weekStart(today), -7)
      return { startDay, endDay: addDays(startDay, 6) }
    }

    case 'month':
      return {
        startDay: formatDateInput(new Date(y, m, 1)),
        endDay: formatDateInput(new Date(y, m + 1, 0)),
      }

    case 'last_month':
      // Day 0 of month m is the last day of month m-1; JS normalizes m = -1 to
      // December of the previous year, so January needs no special case.
      return {
        startDay: formatDateInput(new Date(y, m - 1, 1)),
        endDay: formatDateInput(new Date(y, m, 0)),
      }

    case 'year':
      return {
        startDay: formatDateInput(new Date(y, 0, 1)),
        endDay: formatDateInput(new Date(y, 11, 31)),
      }

    case 'last_year':
      return {
        startDay: formatDateInput(new Date(y - 1, 0, 1)),
        endDay: formatDateInput(new Date(y - 1, 11, 31)),
      }

    default:
      // Custom — tolerate a reversed selection rather than returning an empty range.
      return customFrom <= customTo
        ? { startDay: customFrom, endDay: customTo }
        : { startDay: customTo, endDay: customFrom }
  }
}

// Human label for the resolved range: presets use their own name, custom spells
// out the dates it resolved to.
export function periodLabel(period, startDay, endDay) {
  return period === 'custom'
    ? `${formatDate(startDay + 'T12:00:00')} – ${formatDate(endDay + 'T12:00:00')}`
    : PERIOD_LABELS[period]
}

// Inclusive length of a business-day range, in days.
export function periodDayCount(startDay, endDay) {
  return Math.round((dayToDate(endDay) - dayToDate(startDay)) / 86400000) + 1
}
