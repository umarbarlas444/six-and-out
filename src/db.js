import { supabase } from './supabase.js'
import { generateId, nowIso, getDayBounds } from './utils.js'

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
