import { getSyncQueue, resolveSyncItem, failSyncItem, upsertBookingFromServer, upsertStatusFromServer, getBookingById, getStatusById } from './db.js'
import { logAudit } from './audit.js'
import { supabase } from './supabase.js'

async function pushItem(item) {
  const payload = JSON.parse(item.payload)
  const table = item.entity_type === 'booking' ? 'bookings' : 'statuses'

  if (item.operation === 'CREATE' || item.operation === 'UPDATE') {
    // Fetch the current local record to fill any missing fields in the queued payload
    const local = item.entity_type === 'booking'
      ? await getBookingById(item.entity_id)
      : await getStatusById(item.entity_id)

    const now = new Date().toISOString()
    const body = { ...local, ...payload, id: item.entity_id }

    // Guarantee required fields are never null
    if (!body.created_at) body.created_at = now
    if (!body.updated_at) body.updated_at = now
    if (body.is_default !== undefined) body.is_default = body.is_default ? 1 : 0
    if (body.sort_order !== undefined) body.sort_order = Number(body.sort_order) || 0

    const { error } = await supabase.from(table).upsert(body, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    return true
  }

  if (item.operation === 'DELETE') {
    const { error } = await supabase.from(table).delete().eq('id', item.entity_id)
    if (error) throw new Error(error.message)
    return true
  }
}

export async function runSync(onStatusChange) {
  if (!navigator.onLine) {
    onStatusChange?.('offline')
    return { synced: 0, failed: 0 }
  }

  const queue = await getSyncQueue()
  if (queue.length === 0) {
    onStatusChange?.('synced')
    return { synced: 0, failed: 0 }
  }

  onStatusChange?.('syncing')
  let synced = 0, failed = 0

  for (const item of queue) {
    if (!item.entity_id) {
      // Corrupt entry — drop it, it can never be pushed
      await resolveSyncItem(item.id, item.entity_id, item.entity_type)
      continue
    }
    try {
      await pushItem(item)
      await resolveSyncItem(item.id, item.entity_id, item.entity_type)
      synced++
    } catch (err) {
      await failSyncItem(item.id, err.message)
      failed++
    }
  }

  await logAudit('sync', null, 'SYNC_MANUAL', null, JSON.stringify({ synced, failed }))
  onStatusChange?.(failed > 0 ? 'error' : 'synced')
  return { synced, failed }
}

export async function pullFromServer() {
  if (!navigator.onLine) return

  const now = new Date()
  const rangeStart = new Date(now)
  rangeStart.setMonth(rangeStart.getMonth() - 1)
  const rangeEnd = new Date(now)
  rangeEnd.setMonth(rangeEnd.getMonth() + 2)

  const [{ data: serverStatuses }, { data: serverBookings }] = await Promise.all([
    supabase.from('statuses').select('*'),
    supabase.from('bookings').select('*')
      .lt('date_start', rangeEnd.toISOString())
      .gt('date_end', rangeStart.toISOString()),
  ])

  // Skip records that have unsent local changes
  const queue = await getSyncQueue()
  const pendingIds = new Set(queue.map((q) => q.entity_id))

  for (const s of (serverStatuses ?? [])) {
    if (!pendingIds.has(s.id)) await upsertStatusFromServer(s)
  }
  for (const b of (serverBookings ?? [])) {
    if (!pendingIds.has(b.id)) await upsertBookingFromServer(b)
  }
}

export function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.sync.register('booking-sync').catch(() => {})
    })
  }
}
