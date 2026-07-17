import { supabase } from './supabase.js'
import { generateId, nowIso, getDayBounds, normalizePhone, businessDayKey, getBusinessDayBounds, addDays, formatDateInput } from './utils.js'
import { isCompleted } from './lib/stats.js'
import { computeLeaderboard } from './lib/leaderboard.js'

export async function initDb() {
  // No-op — data lives in Supabase
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function withStatuses(bookingQuery) {
  const [{ data: bookings, error: bErr }, { data: statuses, error: sErr }] = await Promise.all([
    bookingQuery,
    supabase.from('statuses').select('*'),
  ])
  if (bErr) throw new Error(bErr.message)
  if (sErr) throw new Error(sErr.message)

  const sm = Object.fromEntries((statuses ?? []).map(s => [s.id, s]))
  return (bookings ?? []).map(b => {
    const s = sm[b.status] ?? {}
    return {
      ...b,
      status_label: s.label ?? '',
      status_color: s.color || '#6B7280',
      status_availability: s.availability ?? 'soft_flag',
    }
  })
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export async function getBookingsByDay(dateStr) {
  const { start, end } = getDayBounds(dateStr)
  return withStatuses(
    supabase.from('bookings').select('*').is('deleted_at', null).lt('date_start', end).gt('date_end', start).order('date_start')
  )
}

export async function getBookingsInRange(startIso, endIso) {
  return withStatuses(
    supabase.from('bookings').select('*').is('deleted_at', null).lt('date_start', endIso).gt('date_end', startIso).order('date_start')
  )
}

export async function getBookingById(id) {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).is('deleted_at', null).single()
  if (error) return null
  return data
}

export async function createBooking(data) {
  const id = generateId()
  const now = nowIso()
  const { error } = await supabase.from('bookings').insert({ ...data, id, created_at: now, updated_at: now })
  if (error) throw new Error(error.message)
  return id
}

export async function updateBooking(id, data) {
  const { error } = await supabase
    .from('bookings')
    .update({ ...data, updated_at: nowIso() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteBooking(id) {
  const { error } = await supabase
    .from('bookings')
    .update({ deleted_at: nowIso() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function searchOverlap(searchStart, searchEnd) {
  const results = await withStatuses(
    supabase.from('bookings').select('*').is('deleted_at', null).lt('date_start', searchEnd).gt('date_end', searchStart).order('date_start')
  )
  return results.filter(b => b.status_availability !== 'ignore')
}

// Bookings that still have money owed (advance < total). Completed bookings
// are settled in full and never owe anything. PostgREST can't compare two
// columns in a filter, so fetch priced bookings and filter client-side.
export async function getBookingsWithBalance() {
  const results = await withStatuses(
    supabase.from('bookings').select('*').is('deleted_at', null).gt('total_amount', 0).order('date_start', { ascending: false })
  )
  return results.filter(b =>
    !isCompleted(b) && (Number(b.advance_paid) || 0) < (Number(b.total_amount) || 0)
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────
// A single row (id 'main') holds the current stock of consumables. It is set
// once from the settings page; stock adjustments will be added later.

export async function getInventory() {
  const { data, error } = await supabase.from('inventory').select('*').eq('id', 'main').maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function setInventory({ balls_new, balls_old, tapes }) {
  const now = nowIso()
  // Plain insert: the primary key rejects a second row, enforcing set-once.
  const { error } = await supabase
    .from('inventory')
    .insert({ id: 'main', balls_new, balls_old, tapes, created_at: now, updated_at: now })
  if (error) throw new Error(error.message)
}

// ── Statuses ──────────────────────────────────────────────────────────────────

export async function getStatuses() {
  const { data, error } = await supabase.from('statuses').select('*').order('sort_order')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getStatusById(id) {
  const { data, error } = await supabase.from('statuses').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function createStatus(data) {
  const id = generateId()
  const now = nowIso()
  if (data.is_default) {
    await supabase.from('statuses').update({ is_default: 0 }).neq('id', 'none')
  }
  const { error } = await supabase.from('statuses').insert({
    ...data,
    id,
    is_default: data.is_default ? 1 : 0,
    created_at: now,
    updated_at: now,
  })
  if (error) throw new Error(error.message)
  return id
}

export async function updateStatus(id, data) {
  if (data.is_default) {
    await supabase.from('statuses').update({ is_default: 0 }).neq('id', id)
  }
  const { error } = await supabase
    .from('statuses')
    .update({ ...data, is_default: data.is_default ? 1 : 0, updated_at: nowIso() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteStatus(id) {
  const { count, error: cErr } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', id)
  if (cErr) throw new Error(cErr.message)
  if (count > 0) throw new Error(`Cannot delete: ${count} booking(s) use this status.`)
  const { error } = await supabase.from('statuses').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function reorderStatuses(orderedIds) {
  await Promise.all(
    orderedIds.map((id, i) => supabase.from('statuses').update({ sort_order: i }).eq('id', id))
  )
}

// ── Customers ─────────────────────────────────────────────────────────────────
// Bookings snapshot customer_name/phone at save time and optionally link to a
// customer row via customer_id — see CLAUDE.md for the FK + snapshot rationale.

// Neutralize characters that are structural in a PostgREST `.or()` filter
// (`,()`) or act as ilike wildcards (`% _ *`) or escapes (`\`), so a search
// term is matched literally instead of breaking the query or turning into a
// wildcard. Collapses the resulting whitespace.
function sanitizeSearchTerm(s) {
  return (s || '').replace(/[,()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Turn a customer write error into a friendly message. The partial unique
// index on customers(phone) (20260714160000_customers_phone_unique) raises
// 23505 when a second active customer reuses a phone number.
function customerWriteError(error) {
  if (error.code === '23505') return new Error('A customer with this phone number already exists.')
  return new Error(error.message)
}

// Columns of the customer_directory view that the UI is allowed to sort by.
// Whitelisted so a bad sortBy can't reach PostgREST's order clause. `name`
// maps to the view's case-insensitive `name_ci` so sorting isn't at the mercy
// of the column collation.
const CUSTOMER_SORT_COLUMNS = {
  name: 'name_ci',
  booking_count: 'booking_count',
  revenue: 'revenue',
  outstanding: 'outstanding',
  last_booking_at: 'last_booking_at',
  created_at: 'created_at',
}

// One page of the customer_directory view (customers decorated with booking
// count + revenue/outstanding), searched/sorted/paginated server-side so the
// screen stays fast as the customer list grows. Returns { rows, total } where
// total is the full match count (for pagination), not just this page.
export async function getCustomersPage({
  search = '', sortBy = 'name', sortDir = 'asc', page = 0, pageSize = 20,
} = {}) {
  const column = CUSTOMER_SORT_COLUMNS[sortBy] ?? CUSTOMER_SORT_COLUMNS.name
  const ascending = sortDir === 'asc'
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('customer_directory').select('*', { count: 'exact' })

  const q = sanitizeSearchTerm(search)
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,alt_phone.ilike.%${q}%`)

  // Secondary order on id keeps paging stable when the sort column ties
  // (e.g. many customers with 0 bookings).
  query = query
    .order(column, { ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getCustomerById(id) {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).is('deleted_at', null).single()
  if (error) return null
  return data
}

// Autocomplete for the booking form's name/phone fields: matches on name,
// phone, or alt_phone so either input can drive the same suggestion list.
// Only a *phone-shaped* query (digits + phone punctuation, no letters) is
// normalized, so stray formatting (spaces/dashes/+92) still matches the
// normalized digits stored in the phone column; a name query — including one
// that contains digits like "Ground 5" — is searched literally.
export async function searchCustomers(query, limit = 8) {
  const raw = (query || '').trim()
  const phoneish = /\d/.test(raw) && !/[a-z]/i.test(raw)
  const q = phoneish ? (normalizePhone(raw) || sanitizeSearchTerm(raw)) : sanitizeSearchTerm(raw)
  if (!q) return []
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,alt_phone.ilike.%${q}%`)
    .order('name')
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

// Phone is the dedupe key: an exact match here means "same customer"
// regardless of name spelling. Normalizing first means "+92 312…",
// "0092 312…", and "312…" (missing leading 0) all match the same stored row.
export async function findCustomerByPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', normalized)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Storing phone in its normalized form (rather than however it was typed) is
// what keeps findCustomerByPhone's exact match and the Customers-screen
// duplicate-phone check working — see normalizePhone in utils.js.
export async function createCustomer(data) {
  const id = generateId()
  const now = nowIso()
  const phone = data.phone ? normalizePhone(data.phone) : data.phone
  const { error } = await supabase.from('customers').insert({ ...data, phone, id, created_at: now, updated_at: now })
  if (error) throw customerWriteError(error)
  return id
}

export async function updateCustomer(id, data) {
  const patch = { ...data, updated_at: nowIso() }
  if (patch.phone) patch.phone = normalizePhone(patch.phone)
  const { error } = await supabase.from('customers').update(patch).eq('id', id)
  if (error) throw customerWriteError(error)
}

// Soft delete only — bookings keep their customer_id and snapshot fields, so
// history stays intact and every customer read filters deleted_at.
export async function deleteCustomer(id) {
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: nowIso() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getBookingsByCustomer(customerId) {
  return withStatuses(
    supabase.from('bookings').select('*').is('deleted_at', null).eq('customer_id', customerId).order('date_start', { ascending: false })
  )
}

// ── Series matches ──────────────────────────────────────────────────────────
// A booking hosts a series of matches (booking_matches rows). Team 2 and the
// series_winner_id live on the booking itself; the per-match winners live here.

export async function getMatchesByBooking(bookingId) {
  const { data, error } = await supabase
    .from('booking_matches')
    .select('*')
    .eq('booking_id', bookingId)
    .order('match_number')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getMatchesForBookings(bookingIds) {
  if (!bookingIds || bookingIds.length === 0) return []
  const { data, error } = await supabase
    .from('booking_matches')
    .select('*')
    .in('booking_id', bookingIds)
    .order('match_number')
  if (error) throw new Error(error.message)
  return data ?? []
}

// Replace a booking's whole match set. The list is small and fully edited in
// the form, so delete-then-insert is the simplest way to keep stored rows in
// sync with what the operator sees. `matches` is [{ winner }] in play order.
export async function replaceBookingMatches(bookingId, matches) {
  const { error: delErr } = await supabase.from('booking_matches').delete().eq('booking_id', bookingId)
  if (delErr) throw new Error(delErr.message)
  if (!matches || matches.length === 0) return
  const now = nowIso()
  const rows = matches.map((m, i) => ({
    id: generateId(),
    booking_id: bookingId,
    match_number: i + 1,
    winner: m.winner,
    created_at: now,
    updated_at: now,
  }))
  const { error } = await supabase.from('booking_matches').insert(rows)
  if (error) throw new Error(error.message)
}

// ── Leaderboard ─────────────────────────────────────────────────────────────
// Ranked teams + month totals for one business-month ('YYYY-MM'). Mirrors
// stats.js: the business-day (5 AM) month logic runs client-side, then the pure
// reducer in lib/leaderboard.js does the aggregation. Returns
// { teams, stats: { teams, series, matches, draws } } — stats are constant-size
// month summaries (they don't grow with the team count) for the summary card.

// The calendar range to fetch for a business-month, padded a day each side so a
// pre-5 AM booking that business-day-shifts into (or out of) the month is still
// caught. Callers must still filter precisely with businessDayKey.
function monthFetchRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const firstDay = `${monthKey}-01`
  const lastDay = formatDateInput(new Date(y, m, 0)) // day 0 of next month = last day of this one
  return {
    rangeStart: getBusinessDayBounds(addDays(firstDay, -1)).start,
    rangeEnd: getBusinessDayBounds(addDays(lastDay, 1)).end,
  }
}

export async function getLeaderboardMonth(monthKey) {
  const { rangeStart, rangeEnd } = monthFetchRange(monthKey)

  const bookings = await getBookingsInRange(rangeStart, rangeEnd)
  const inMonth = bookings.filter(b => businessDayKey(b.date_start).slice(0, 7) === monthKey)

  const matches = await getMatchesForBookings(inMonth.map(b => b.id))
  const matchesByBooking = {}
  for (const mm of matches) (matchesByBooking[mm.booking_id] ??= []).push(mm)

  const teams = computeLeaderboard(inMonth, matchesByBooking)
  const stats = {
    teams: teams.length,                                     // ranked (linked) teams
    series: Object.keys(matchesByBooking).length,            // bookings that had ≥1 match
    matches: matches.length,
    draws: matches.filter(mm => mm.winner == null).length,   // null winner = draw
  }
  return { teams, stats }
}

// ── Team detail ─────────────────────────────────────────────────────────────
// One team's series (a series = a booking that had ≥1 match), newest first, for
// the leaderboard's team modal.
//
// A team sits in EITHER booking slot, so this filters customer_id OR
// customer_id_2 — getBookingsByCustomer is not reusable here (it only checks
// customer_id and would miss every series the team played as Team 2).
//
// monthKey null = all time, paginated server-side. monthKey set = that business
// month; the 5 AM business-day rule is local-tz JS, so it can't be pushed into a
// server range — fetch the padded month and filter/slice client-side (one month
// of bookings is cheap).

// Turn one booking + its matches into a series row from `myId`'s point of view.
function toSeriesRow(b, matches, myId) {
  const iAmTeam1 = b.customer_id === myId
  const oppId = iAmTeam1 ? b.customer_id_2 : b.customer_id
  const oppName = (iAmTeam1 ? b.customer_name_2 : b.customer_name) || 'Unknown'

  let won = 0, lost = 0, drawn = 0
  for (const m of matches) {
    if (m.winner == null) drawn++
    else if (m.winner === myId) won++
    else if (m.winner === oppId) lost++
  }
  // Mirrors seriesOutcome() in lib/leaderboard.js: wins decide it, drawn matches
  // don't. 0–0 (all drawn) reads as a draw here rather than "no result".
  const result = won > lost ? 'won' : won < lost ? 'lost' : 'draw'

  return { bookingId: b.id, date: b.date_start, opponentName: oppName, result, won, lost, drawn }
}

export async function getTeamSeries(customerId, { monthKey = null, page = 0, pageSize = 10 } = {}) {
  const orFilter = `customer_id.eq.${customerId},customer_id_2.eq.${customerId}`

  let bookings = []
  let total = 0

  if (monthKey) {
    const { rangeStart, rangeEnd } = monthFetchRange(monthKey)
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .is('deleted_at', null)
      .or(orFilter)
      .lt('date_start', rangeEnd)
      .gt('date_end', rangeStart)
      .order('date_start', { ascending: false })
    if (error) throw new Error(error.message)
    const inMonth = (data ?? []).filter(b => businessDayKey(b.date_start).slice(0, 7) === monthKey)
    total = inMonth.length
    bookings = inMonth.slice(page * pageSize, page * pageSize + pageSize)
  } else {
    const from = page * pageSize
    const { data, error, count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .or(orFilter)
      .order('date_start', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    bookings = data ?? []
    total = count ?? 0
  }

  const matches = await getMatchesForBookings(bookings.map(b => b.id))
  const byBooking = {}
  for (const m of matches) (byBooking[m.booking_id] ??= []).push(m)

  // A booking with no matches isn't a series — drop it from the list. (It can
  // still be counted in `total` for the all-time path, where we can't know a
  // booking's match count before fetching; accepted: the pager may show a page
  // with fewer than pageSize rows.)
  const rows = bookings
    .filter(b => (byBooking[b.id] ?? []).length > 0)
    .map(b => toSeriesRow(b, byBooking[b.id], customerId))

  return { rows, total }
}
