// Imported by db.js — must not import from db.js (circular dep)
// db.js passes `run` and `exec` via a shared module-level ref

let _run = null

export function setAuditRunner(runFn) {
  _run = runFn
}

export async function logAudit(entityType, entityId, action, oldValue, newValue) {
  if (!_run) return // DB not ready yet (should not happen in normal flow)
  await _run(
    `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      entityType,
      entityId ?? null,
      action,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
    ]
  )
}
