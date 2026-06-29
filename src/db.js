import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { generateId, nowIso, getDayBounds } from './utils.js'
import { logAudit, setAuditRunner } from './audit.js'

let db = null

const DEFAULT_STATUSES = [
  { label: 'Inquiry', color: '#6B7280', availability: 'soft_flag', is_default: 1, sort_order: 0 },
  { label: 'Interested', color: '#3B82F6', availability: 'soft_flag', is_default: 0, sort_order: 1 },
  { label: 'Pending Confirmation', color: '#F59E0B', availability: 'soft_flag', is_default: 0, sort_order: 2 },
  { label: 'Confirmed', color: '#10B981', availability: 'hard_block', is_default: 0, sort_order: 3 },
  { label: 'Paid', color: '#059669', availability: 'hard_block', is_default: 0, sort_order: 4 },
  { label: 'Cancelled', color: '#EF4444', availability: 'ignore', is_default: 0, sort_order: 5 },
]

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS bookings (
    id            TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone         TEXT,
    date_start    TEXT NOT NULL,
    date_end      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'inquiry',
    notes         TEXT,
    advance_paid  REAL DEFAULT 0,
    total_amount  REAL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    synced_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS statuses (
    id            TEXT PRIMARY KEY,
    label         TEXT NOT NULL,
    color         TEXT NOT NULL,
    availability  TEXT NOT NULL DEFAULT 'soft_flag',
    is_default    INTEGER DEFAULT 0,
    sort_order    INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    synced_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    operation     TEXT NOT NULL,
    payload       TEXT NOT NULL,
    queued_at     TEXT NOT NULL,
    attempts      INTEGER DEFAULT 0,
    last_error    TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT,
    action        TEXT NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    performed_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

function exec(sql, bind = []) {
  return Promise.resolve(
    db.exec({ sql, bind: bind.length ? bind : undefined, returnValue: 'resultRows', rowMode: 'object' })
  )
}

function run(sql, bind = []) {
  if (bind.length) {
    db.exec({ sql, bind })
  } else {
    db.exec(sql)
  }
  return Promise.resolve()
}

export async function initDb() {
  const sqlite3 = await sqlite3InitModule({
    locateFile: (file) => `/sqlite3/${file}`,
    print: () => {},
    printErr: () => {},
  })

  db = new sqlite3.oo1.JsStorageDb('local')

  db.exec(SCHEMA)
  setAuditRunner(run)

  // Seed default statuses on first install
  const meta = await exec(`SELECT value FROM meta WHERE key = 'seeded'`)
  if (meta.length === 0) {
    for (const s of DEFAULT_STATUSES) {
      const id = generateId()
      const now = nowIso()
      await run(
        `INSERT INTO statuses (id, label, color, availability, is_default, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, s.label, s.color, s.availability, s.is_default, s.sort_order, now, now]
      )
    }
    await run(`INSERT INTO meta (key, value) VALUES ('seeded', '1')`)
  }

}

// ── Bookings ────────────────────────────────────────────────────────────────

export async function getBookingsByDay(dateStr) {
  const { start, end } = getDayBounds(dateStr)
  return exec(
    `SELECT b.*, s.label as status_label, s.color as status_color, s.availability as status_availability
     FROM bookings b
     LEFT JOIN statuses s ON b.status = s.id
     WHERE b.date_start < ? AND b.date_end > ?
     ORDER BY b.date_start ASC`,
    [end, start]
  )
}

export async function getBookingsInRange(startIso, endIso) {
  return exec(
    `SELECT b.*, s.label as status_label, s.color as status_color, s.availability as status_availability
     FROM bookings b
     LEFT JOIN statuses s ON b.status = s.id
     WHERE b.date_start < ? AND b.date_end > ?
     ORDER BY b.date_start ASC`,
    [endIso, startIso]
  )
}

export async function getBookingById(id) {
  const rows = await exec(`SELECT * FROM bookings WHERE id = ?`, [id])
  return rows[0] ?? null
}

export async function createBooking(data) {
  const id = generateId()
  const now = nowIso()
  await run(
    `INSERT INTO bookings (id, customer_name, phone, date_start, date_end, status, notes, advance_paid, total_amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.customer_name, data.phone ?? '', data.date_start, data.date_end,
     data.status, data.notes ?? '', data.advance_paid ?? 0, data.total_amount ?? 0, now, now]
  )
  await enqueueSync('booking', id, 'CREATE', { ...data, id, created_at: now, updated_at: now })
  await logAudit('booking', id, 'BOOKING_CREATED', null, { ...data, id })
  return id
}

export async function updateBooking(id, data, oldData) {
  const now = nowIso()
  const isStatusOnly = Object.keys(data).length === 1 && 'status' in data

  await run(
    `UPDATE bookings SET
      customer_name = COALESCE(?, customer_name),
      phone         = COALESCE(?, phone),
      date_start    = COALESCE(?, date_start),
      date_end      = COALESCE(?, date_end),
      status        = COALESCE(?, status),
      notes         = COALESCE(?, notes),
      advance_paid  = COALESCE(?, advance_paid),
      total_amount  = COALESCE(?, total_amount),
      updated_at    = ?,
      synced_at     = NULL
     WHERE id = ?`,
    [data.customer_name ?? null, data.phone ?? null, data.date_start ?? null,
     data.date_end ?? null, data.status ?? null, data.notes ?? null,
     data.advance_paid ?? null, data.total_amount ?? null, now, id]
  )
  await enqueueSync('booking', id, 'UPDATE', data)

  const action = isStatusOnly ? 'BOOKING_STATUS_CHANGED' : 'BOOKING_UPDATED'
  await logAudit('booking', id, action, oldData, { ...oldData, ...data, updated_at: now })
}

export async function deleteBooking(id, oldData) {
  await run(`DELETE FROM bookings WHERE id = ?`, [id])
  await enqueueSync('booking', id, 'DELETE', { id })
  await logAudit('booking', id, 'BOOKING_DELETED', oldData, null)
}

// Overlap search for availability check
export async function searchOverlap(searchStart, searchEnd) {
  return exec(
    `SELECT b.*, s.label as status_label, s.color as status_color, s.availability as status_availability
     FROM bookings b
     LEFT JOIN statuses s ON b.status = s.id
     WHERE b.date_start < ? AND b.date_end > ?
       AND s.availability != 'ignore'
     ORDER BY b.date_start ASC`,
    [searchEnd, searchStart]
  )
}

// ── Statuses ─────────────────────────────────────────────────────────────────

export async function getStatuses() {
  return exec(`SELECT * FROM statuses ORDER BY sort_order ASC, label ASC`)
}

export async function createStatus(data) {
  const id = generateId()
  const now = nowIso()

  if (data.is_default) {
    await run(`UPDATE statuses SET is_default = 0`)
  }

  await run(
    `INSERT INTO statuses (id, label, color, availability, is_default, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.label, data.color, data.availability, data.is_default ? 1 : 0,
     data.sort_order ?? 0, now, now]
  )
  await enqueueSync('status', id, 'CREATE', { ...data, id })
  await logAudit('status', id, 'STATUS_CREATED', null, { ...data, id })
  return id
}

export async function updateStatus(id, data, oldData) {
  const now = nowIso()

  if (data.is_default) {
    await run(`UPDATE statuses SET is_default = 0 WHERE id != ?`, [id])
  }

  await run(
    `UPDATE statuses SET
      label        = COALESCE(?, label),
      color        = COALESCE(?, color),
      availability = COALESCE(?, availability),
      is_default   = COALESCE(?, is_default),
      sort_order   = COALESCE(?, sort_order),
      updated_at   = ?,
      synced_at    = NULL
     WHERE id = ?`,
    [data.label ?? null, data.color ?? null, data.availability ?? null,
     data.is_default != null ? (data.is_default ? 1 : 0) : null,
     data.sort_order ?? null, now, id]
  )
  await enqueueSync('status', id, 'UPDATE', data)
  await logAudit('status', id, 'STATUS_UPDATED', oldData, { ...oldData, ...data })
}

export async function deleteStatus(id, oldData) {
  const count = await exec(`SELECT COUNT(*) as c FROM bookings WHERE status = ?`, [id])
  if (count[0]?.c > 0) {
    throw new Error(`Cannot delete: ${count[0].c} booking(s) use this status.`)
  }
  await run(`DELETE FROM statuses WHERE id = ?`, [id])
  await enqueueSync('status', id, 'DELETE', { id })
  await logAudit('status', id, 'STATUS_DELETED', oldData, null)
}

export async function reorderStatuses(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await run(`UPDATE statuses SET sort_order = ? WHERE id = ?`, [i, orderedIds[i]])
  }
}

// ── Sync Queue ────────────────────────────────────────────────────────────────

export async function enqueueSync(entityType, entityId, operation, payload) {
  await run(
    `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, queued_at)
     VALUES (?, ?, ?, ?, ?)`,
    [entityType, entityId, operation, JSON.stringify(payload), nowIso()]
  )
}

export async function upsertBookingFromServer(data) {
  await run(
    `INSERT OR REPLACE INTO bookings
       (id, customer_name, phone, date_start, date_end, status, notes,
        advance_paid, total_amount, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.customer_name, data.phone ?? '', data.date_start, data.date_end,
     data.status, data.notes ?? '', data.advance_paid ?? 0, data.total_amount ?? 0,
     data.created_at, data.updated_at, data.synced_at ?? nowIso()]
  )
}

export async function upsertStatusFromServer(data) {
  await run(
    `INSERT OR REPLACE INTO statuses
       (id, label, color, availability, is_default, sort_order, created_at, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.label, data.color, data.availability, data.is_default ?? 0,
     data.sort_order ?? 0, data.created_at, data.updated_at, data.synced_at ?? nowIso()]
  )
}

export async function getSyncQueue() {
  return exec(`SELECT * FROM sync_queue ORDER BY queued_at ASC`)
}

export async function resolveSyncItem(id, entityId, entityType) {
  await run(`DELETE FROM sync_queue WHERE id = ?`, [id])
  const table = entityType === 'booking' ? 'bookings' : 'statuses'
  await run(`UPDATE ${table} SET synced_at = ? WHERE id = ?`, [nowIso(), entityId])
  await logAudit(entityType, entityId, 'SYNC_SUCCESS', null, null)
}

export async function failSyncItem(id, error) {
  await run(
    `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
    [error, id]
  )
  await logAudit('sync', null, 'SYNC_FAILED', null, JSON.stringify({ error }))
}

export async function getPendingCount() {
  const rows = await exec(`SELECT COUNT(*) as c FROM sync_queue`)
  return rows[0]?.c ?? 0
}
