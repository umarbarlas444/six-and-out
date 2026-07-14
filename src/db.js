import { supabase } from './supabase.js'
import { generateId, nowIso, getDayBounds, normalizePhone } from './utils.js'
import { isCompleted } from './lib/stats.js'

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
