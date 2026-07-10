export function generateId() {
  return crypto.randomUUID()
}

export function nowIso() {
  return new Date().toISOString()
}

export function toLocalDatetimeValue(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The business day runs from this hour until the same hour the next calendar
// day. A booking that starts before this cutoff (e.g. 1 AM) belongs to the
// PREVIOUS calendar day's business day.
export const BUSINESS_DAY_START_HOUR = 5

// storage (actual calendar datetime) -> the business day the user thinks in.
// Only the calendar date is shifted; the clock time is unchanged.
// e.g. actual Fri 1 AM -> business value "Thu …T01:00"
export function actualToBusinessValue(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (d.getHours() < BUSINESS_DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return toLocalDatetimeValue(d)
}

// business day the user picked -> actual calendar datetime for storage.
// Inverse of actualToBusinessValue. e.g. picked Thu 1 AM -> actual Fri 1 AM.
export function businessValueToActualDate(localValue) {
  const d = new Date(localValue)
  if (d.getHours() < BUSINESS_DAY_START_HOUR) d.setDate(d.getDate() + 1)
  return d
}

export function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateInput(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Bounds of the business day containing dateStr ('YYYY-MM-DD'): 5 AM local on
// that date until 5 AM the next calendar day.
export function getBusinessDayBounds(dateStr) {
  const start = new Date(dateStr)
  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

// 'YYYY-MM-DD' of the business day a datetime belongs to — a time before the
// 5 AM cutoff counts as the previous calendar day.
export function businessDayKey(isoString) {
  const d = new Date(isoString)
  if (d.getHours() < BUSINESS_DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return formatDateInput(d)
}

// The business day "today" falls in, as 'YYYY-MM-DD'.
export function todayBusinessDay() {
  return businessDayKey(new Date().toISOString())
}

export function getDayBounds(dateStr) {
  const start = new Date(dateStr)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dateStr)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function calcDuration(startIso, endIso) {
  const diff = new Date(endIso) - new Date(startIso)
  if (diff <= 0) return '—'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Returns true if [aStart, aEnd) overlaps [bStart, bEnd)
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return formatDateInput(d)
}
