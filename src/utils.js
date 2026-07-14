export function generateId() {
  return crypto.randomUUID()
}

// PK phone numbers get typed in wildly different shapes (+92, 0092, missing
// the leading 0, spaces/dashes). Normalizing to the local "0XXXXXXXXXX" form
// is what lets the same number dedupe to one customer regardless of how it
// was typed — mirrors pg_temp.normalize_pk_phone() in the customers
// migration (supabase/migrations/20260713120000_customers.sql).
export function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (/^92\d{10}$/.test(digits)) return '0' + digits.slice(2)   // +92XXXXXXXXXX -> 0XXXXXXXXXX
  if (/^3\d{9}$/.test(digits)) return '0' + digits              // 3XXXXXXXXX (missing 0) -> 03XXXXXXXXX
  return digits
}

// Build a wa.me deep link that opens this number's WhatsApp chat. PK numbers
// are stored/normalized as local "0XXXXXXXXXX"; wa.me needs the international
// form — country code, no leading 0 (e.g. 923124617395). Returns '' when
// there's no usable number.
export function whatsappUrl(raw) {
  const local = normalizePhone(raw)
  if (!local) return ''
  const intl = /^0\d{10}$/.test(local) ? '92' + local.slice(1) : local
  return `https://wa.me/${intl}`
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
