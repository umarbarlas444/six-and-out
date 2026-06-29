# Cricket Ground Booking App — Spec-Driven Development Plan

## 1. Product Overview

An offline-first Progressive Web App (PWA) for managing cricket ground bookings. A single operator uses the app to record and manage inquiries received via WhatsApp, track booking status through a defined lifecycle, and check ground availability by date and time range.

---

## 2. Core Principles

- **Offline-first**: The app is fully functional with no internet connection.
- **Local-authoritative**: SQLite (via `sql.js` + OPFS) is the source of truth on-device.
- **Sync-on-connect**: Changes are queued and pushed to the server when connectivity is available, plus on-demand via a manual sync button.
- **Single operator, no conflicts**: No merge-conflict resolution needed.
- **Installable**: Ships as a PWA, installable on desktop or Android via browser prompt.

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Vanilla JS + Web Components (or React) | Lightweight, no build tool required for MVP |
| Local DB | `sql.js` (SQLite compiled to WASM) + Origin Private File System (OPFS) | True SQLite in the browser, persists across sessions |
| Persistence adapter | `@sqlite.org/sqlite-wasm` with OPFS VFS | Official SQLite WASM build with file persistence |
| Offline shell | Service Worker + Cache API | Caches app shell and assets |
| Background sync | Background Sync API (with polling fallback) | Queues sync when offline, fires when back online |
| Server API | REST (JSON) — any backend (Node/PHP/Python) | Simple POST/PATCH per booking |
| Hosting | Any static host (Netlify, Vercel, or self-hosted nginx) | Only serves the app shell |

---

## 4. Data Model

### 4.1 `bookings` Table

```sql
CREATE TABLE bookings (
  id            TEXT PRIMARY KEY,          -- UUID, generated client-side
  customer_name TEXT NOT NULL,
  phone         TEXT,                      -- WhatsApp number
  date_start    TEXT NOT NULL,             -- ISO 8601 datetime: '2026-06-17T23:00:00'
  date_end      TEXT NOT NULL,             -- ISO 8601 datetime: '2026-06-18T01:00:00'
  status        TEXT NOT NULL DEFAULT 'inquiry',
  notes         TEXT,
  advance_paid  REAL DEFAULT 0,
  total_amount  REAL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT                       -- NULL = pending sync
);
```

### 4.2 `statuses` Table

Statuses are fully operator-defined. There is no fixed list. The operator can create, rename, recolour, reorder, and delete statuses at any time.

```sql
CREATE TABLE statuses (
  id               TEXT PRIMARY KEY,   -- UUID, generated client-side
  label            TEXT NOT NULL,      -- Display name, e.g. "Pending Confirmation"
  color            TEXT NOT NULL,      -- Hex color for the badge, e.g. '#F59E0B'
  availability     TEXT NOT NULL       -- 'hard_block' | 'soft_flag' | 'ignore'
                   DEFAULT 'soft_flag',
  is_default       INTEGER DEFAULT 0,  -- 1 = pre-selected on new booking form
  sort_order       INTEGER DEFAULT 0,  -- Controls display order in dropdowns
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  synced_at        TEXT                -- NULL = pending sync
);
```

**`availability` field behaviour:**

| Value | Effect on availability check |
|---|---|
| `hard_block` | Slot shown as unavailable (red banner) |
| `soft_flag` | Slot shows warning popup (amber banner) |
| `ignore` | Booking excluded from availability checks entirely |

The operator assigns `availability` per status when creating or editing it. This means, for example, a "Cancelled" status would be set to `ignore`, a "Confirmed" status to `hard_block`, and an "Inquiry" status to `soft_flag` — but these are the operator's choices, not system constraints.

**Rules:**
- Exactly one status should have `is_default = 1`. Enforced on save (setting a new default clears the previous one).
- Any status can be applied to any booking at any time — there is no enforced transition sequence.
- Statuses can be deleted only if no booking currently holds that status (enforce client-side with a count check before delete).

### 4.3 `sync_queue` Table

```sql
CREATE TABLE sync_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,             -- 'booking' | 'status'
  entity_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,             -- 'CREATE' | 'UPDATE' | 'DELETE'
  payload       TEXT NOT NULL,             -- JSON snapshot at time of change
  queued_at     TEXT NOT NULL,
  attempts      INTEGER DEFAULT 0,
  last_error    TEXT
);
```

### 4.4 `audit_log` Table

Every action taken in the application — creating a booking, changing a status, editing details, syncing — is written to this table. Display of logs is deferred to a later phase; the logging itself is wired from day one.

```sql
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT NOT NULL,   -- 'booking' | 'status' | 'sync'
  entity_id     TEXT,            -- booking.id or status.id; NULL for sync-level events
  action        TEXT NOT NULL,   -- see Action Types below
  old_value     TEXT,            -- JSON snapshot before change (NULL for CREATE)
  new_value     TEXT,            -- JSON snapshot after change (NULL for DELETE)
  performed_at  TEXT NOT NULL    -- ISO 8601 timestamp
);
```

**Action types:**

| action | Trigger |
|---|---|
| `BOOKING_CREATED` | New booking saved |
| `BOOKING_UPDATED` | Any booking field edited |
| `BOOKING_STATUS_CHANGED` | Status field changed (old + new status recorded) |
| `BOOKING_DELETED` | Booking removed |
| `STATUS_CREATED` | New status definition added |
| `STATUS_UPDATED` | Status label/colour/availability edited |
| `STATUS_DELETED` | Status definition removed |
| `SYNC_SUCCESS` | Sync queue item pushed successfully |
| `SYNC_FAILED` | Sync attempt failed (error recorded in new_value) |
| `SYNC_MANUAL` | Operator clicked "Sync Now" |

`old_value` and `new_value` store full JSON snapshots of the entity at that moment, so the log is self-contained and does not rely on current DB state to be meaningful.

---

## 5. Booking Lifecycle

Status transitions are **unrestricted** — any status can be applied to any booking at any time. The operator decides the flow based on the conversation with the customer; the app does not enforce a sequence.

The operator configures statuses once (in Status Management, §6.6) and assigns them to bookings as the situation evolves. Typical usage might look like:

```
[WhatsApp inquiry received]
      │
      ▼
  [Any status the operator picks — e.g. "Inquiry"]
      │
      ▼ (operator changes status freely as conversation progresses)
  [Any other status — e.g. "Interested", "Confirmed", "Paid", "Cancelled"]
```

Every status change:
- Writes `updated_at` on the booking.
- Sets `synced_at = NULL`.
- Enqueues an `UPDATE` in `sync_queue`.
- Appends a `BOOKING_STATUS_CHANGED` entry to `audit_log` with the old and new status IDs and labels.

---

## 6. Feature Specifications

### 6.1 Dashboard / Home Screen

- Displays today's bookings in a table sorted ascending by `date_start`.
- Date navigation: `← Previous Day` | `[Date Picker]` | `Next Day →`
- Each row shows: Customer Name, Phone, Start Time, End Time, Status (badge), Notes, Actions.
- Table is filterable by all columns (client-side text search input per column or global search).
- Status badges use the colour defined on the status record (operator-configured).
- Quick-action buttons per row: Edit Status, Edit Details.
- Status filter dropdown in the table header is populated dynamically from the `statuses` table.
- Sync status indicator in the header (green = synced, amber = pending changes, red = sync error).
- Manual **Sync Now** button in the header.

### 6.2 Availability Search

**Entry point:** Prominent search bar or button on home screen.

**Inputs:**
- Start date + time (date-time picker)
- End date + time (date-time picker, must be after start)

**Behaviour:**

1. Query all bookings whose time range overlaps the searched range, joining to their status's `availability` value:
   - Overlap condition: `date_start < search_end AND date_end > search_start`
   - Exclude bookings whose status has `availability = 'ignore'`

2. **Hard conflict** (any overlapping booking whose status has `availability = 'hard_block'`):
   - Show red banner: "This slot is not available — a confirmed booking exists."
   - List the conflicting bookings.

3. **Soft conflict** (any overlapping booking whose status has `availability = 'soft_flag'`, and no hard conflicts):
   - Show amber popup/modal: "Other people are interested in this slot. Proceed with caution."
   - List the soft-conflicting bookings.

4. **No conflict:**
   - Show green banner: "Slot is available."

5. **Always:** Display all bookings for the calendar day(s) that the search spans in a table below the result, sorted ascending by start time.

6. Search result includes a **"Add Booking for this Slot"** button that pre-fills the add-booking form with the searched times.

### 6.3 Add Booking

Form fields:
- Customer Name (required)
- WhatsApp Phone Number
- Start Date & Time (required)
- End Date & Time (required; validated > start)
- Status (dropdown populated from `statuses` table, sorted by `sort_order`; pre-selects the status with `is_default = 1`)
- Advance Paid (amount, optional)
- Total Amount (optional)
- Notes (free text)

On submit:
- Generate UUID for `id`, set `created_at` and `updated_at` to now.
- Insert into local SQLite.
- Enqueue `CREATE` in `sync_queue` (`entity_type = 'booking'`).
- Write `BOOKING_CREATED` to `audit_log`.
- Trigger background sync attempt.

### 6.4 Edit Booking / Status Update

- Full edit form (same fields as Add Booking).
- **Quick status change**: Inline status dropdown on each table row — changing it saves immediately without opening the full form. Any status from the `statuses` table can be selected; no restrictions on which statuses can follow which.
- On any save:
  - Update `updated_at`, set `synced_at = NULL`.
  - Enqueue `UPDATE` in `sync_queue`.
  - Write `BOOKING_UPDATED` to `audit_log` (or `BOOKING_STATUS_CHANGED` if only the status field changed, capturing old and new status label + id).

### 6.5 Status Management

A dedicated settings screen where the operator manages the status list.

**Actions:**
- **Add status**: Label (text), colour (colour picker), availability type (`hard_block` / `soft_flag` / `ignore`), mark as default.
- **Edit status**: Same fields. Changes propagate immediately to all badges/dropdowns since status is referenced by ID.
- **Delete status**: Blocked with an error if any booking currently holds this status. Otherwise deletes and enqueues `DELETE` sync.
- **Reorder statuses**: Drag-and-drop or up/down arrows; controls order in all dropdowns.

**Seeded defaults (on first install):** The app seeds a starter set of statuses so the operator has something to work with immediately. These are fully editable.

| Label | Colour | Availability |
|---|---|---|
| Inquiry | Grey `#6B7280` | `soft_flag` |
| Interested | Blue `#3B82F6` | `soft_flag` |
| Pending Confirmation | Amber `#F59E0B` | `soft_flag` |
| Confirmed | Green `#10B981` | `hard_block` |
| Paid | Emerald `#059669` | `hard_block` |
| Cancelled | Red `#EF4444` | `ignore` |

All status changes (create/edit/delete) are written to `audit_log` and synced to the server.

### 6.6 Audit Log *(display deferred)*

All actions are written to `audit_log` in real time. The schema is defined in §4.4. UI to browse, filter, and export the log is out of scope for now and will be specced separately. The logging code itself is wired from Phase 1.

### 6.7 Sync Engine

**Automatic sync:**
- On app load: attempt sync.
- On `online` event (browser fires when network restores): attempt sync.
- Service Worker Background Sync API: register a sync tag `'booking-sync'` whenever items enter the queue; the browser fires this even after the tab is closed.

**Manual sync:**
- "Sync Now" button in header triggers same sync function.

**Sync algorithm:**
```
1. Read all rows from sync_queue ordered by queued_at ASC
2. For each row:
   a. POST /api/bookings (CREATE) or PATCH /api/bookings/:id (UPDATE)
   b. On 2xx response:
      - Delete row from sync_queue
      - Set bookings.synced_at = NOW() for that booking_id
   c. On network error or 5xx:
      - Increment attempts, record last_error, retry later
   d. On 4xx (client error):
      - Log error, increment attempts, pause (manual intervention needed)
3. Update sync status indicator
```

**Conflict note:** Since only one operator uses the system, no server-to-client pull is needed in v1. Server is append/update only.

### 6.8 Offline Shell & PWA

- Service Worker caches all app assets (HTML, JS, CSS, WASM) on install.
- App loads fully from cache when offline.
- `manifest.json` with app name, icons, `display: standalone`, `start_url`.
- Users prompted to install via browser's native install prompt (beforeinstallprompt).

---

## 7. Server API Contract

Authentication via a static API key in the `Authorization` header on all endpoints.

### Bookings

**POST `/api/bookings`** — Create a booking.
Request body: full booking object. Response: `201`, or `409` if ID exists (treat as success — idempotent).

**PATCH `/api/bookings/:id`** — Update a booking.
Request body: partial fields. Response: `200`, or `404` (upsert as recovery).

### Statuses

**POST `/api/statuses`** — Create a status definition.
Request body: full status object. Response: `201`, or `409` if ID exists.

**PATCH `/api/statuses/:id`** — Update a status.
Request body: partial fields. Response: `200`.

**DELETE `/api/statuses/:id`** — Delete a status.
Response: `204`.

### Audit Log *(optional, v2)*

**POST `/api/audit`** — Bulk-insert audit log entries.
Useful for future reporting or cross-device visibility. Not required in v1.

### GET `/api/bookings` + **GET `/api/statuses`** *(optional, v2)*
Full pull for re-sync or new device setup.

---

## 8. UI Design Spec

### Status Badge Colours

Colours are **operator-defined per status** — no hardcoded palette in the app. The badge component reads `status.color` from the DB and renders it dynamically. The colour picker in Status Management (§6.5) lets the operator choose any hex colour. Seeded defaults are listed in §6.5.

### Layout

- **Header bar:** App name, Sync status indicator (icon + text), Sync Now button, Settings (⚙) link to Status Management.
- **Main area (Home):** Date navigator → Bookings table.
- **Search modal/drawer:** Opens from a floating "Search Availability" button.
- **Add/Edit form:** Modal or side drawer.
- **Status Management screen:** Accessible from Settings; list of statuses with add/edit/delete/reorder.
- **Mobile-friendly:** Single-column layout on narrow screens; table scrollable horizontally.

### Table Columns (bookings)

| Column | Filterable | Sortable |
|---|---|---|
| # | — | — |
| Customer Name | ✓ | ✓ |
| Phone | ✓ | — |
| Start Time | — | ✓ (default) |
| End Time | — | ✓ |
| Duration | — | — |
| Status | ✓ (dropdown) | ✓ |
| Advance Paid | — | — |
| Notes | ✓ | — |
| Actions | — | — |

---

## 9. Phased Build Plan

### Phase 0 — Project Scaffold (Day 1)

**Goal:** Runnable app shell, installable as PWA.

- [ ] Create project directory structure (no build tool; plain HTML/JS/CSS or Vite)
- [ ] `index.html` with app shell
- [ ] `manifest.json` (name, icons, standalone mode)
- [ ] `service-worker.js` with cache-first strategy for app shell
- [ ] Register service worker in `app.js`
- [ ] Verify install prompt works in Chrome

**Deliverable:** Blank screen that installs as a PWA and works offline.

---

### Phase 1 — Local Database (Day 1–2)

**Goal:** SQLite running in-browser with persistent OPFS storage.

- [ ] Load `@sqlite.org/sqlite-wasm` via CDN or bundle
- [ ] Initialize DB in OPFS VFS on first load
- [ ] Run schema migrations (`bookings`, `statuses`, `sync_queue`, `audit_log` tables)
- [ ] Seed default statuses on first install
- [ ] Write `db.js` module: `createBooking()`, `updateBooking()`, `getBookingsByDay()`, `searchBookings()`, `getQueue()`, `resolveQueue()`, `createStatus()`, `updateStatus()`, `deleteStatus()`, `getStatuses()`
- [ ] Write `audit.js` module: `log(entityType, entityId, action, oldValue, newValue)` — called by every write operation
- [ ] Write unit tests for overlap query logic and availability join (plain JS, no framework)

**Deliverable:** DB module with passing tests for availability overlap calculation.

---

### Phase 2 — Core UI (Day 2–4)

**Goal:** Operator can view, add, edit, and cancel bookings.

- [ ] Home screen with date navigator
- [ ] Bookings table (all columns, ascending time sort)
- [ ] Column filter row (text inputs + dynamic status dropdown from DB)
- [ ] Add Booking form (modal) — status dropdown populated from `statuses` table
- [ ] Edit Booking / quick inline status change (any → any, no restrictions)
- [ ] Status badge component — reads colour dynamically from status record
- [ ] Status Management screen (add/edit/delete/reorder statuses, colour picker, availability selector)
- [ ] Wire all booking + status actions to `db.js` and `audit.js`

**Deliverable:** Fully working local app — no sync yet.

---

### Phase 3 — Availability Search (Day 4–5)

**Goal:** Operator can check slot availability before confirming a booking.

- [ ] Search modal with date-time range pickers
- [ ] Overlap query against local DB
- [ ] Hard conflict banner (red)
- [ ] Soft conflict popup (amber) with list of conflicting bookings
- [ ] Available banner (green)
- [ ] Day-view table below results
- [ ] "Add Booking for this Slot" pre-fill shortcut

**Deliverable:** Availability check works fully offline.

---

### Phase 4 — Sync Engine (Day 5–7)

**Goal:** Changes sync to server automatically and on demand.

- [ ] Write `sync.js`: read queue → POST/PATCH → mark resolved
- [ ] Sync on `online` event and on app load
- [ ] Register Background Sync tag in service worker
- [ ] Sync status indicator in header (synced / pending / error)
- [ ] Manual "Sync Now" button
- [ ] Retry logic with attempt counter and error logging
- [ ] Test with server offline (queue builds) then online (flush)

**Deliverable:** Changes reliably reach server, queue drains correctly.

---

### Phase 5 — Server Implementation (Day 7–9)

**Goal:** Minimal server that accepts bookings and persists them.

- [ ] Choose runtime (Node/Express recommended for speed)
- [ ] `POST /api/bookings`, `PATCH /api/bookings/:id` — idempotent upsert
- [ ] `POST /api/statuses`, `PATCH /api/statuses/:id`, `DELETE /api/statuses/:id`
- [ ] Server-side DB (PostgreSQL or SQLite file)
- [ ] Static API key auth via `Authorization` header
- [ ] Deploy to server / VPS
- [ ] End-to-end sync test (bookings + statuses)

**Deliverable:** Full round-trip: app → local DB → sync queue → server DB.

---

### Phase 6 — Polish & Edge Cases (Day 9–10)

- [ ] Cross-midnight booking display (e.g. 11 PM–1 AM spans two calendar days; show on both days)
- [ ] Handle duplicate sync attempts (idempotent server + client dedup)
- [ ] Sync error display and dismiss
- [ ] Empty states (no bookings for a day, no search results)
- [ ] Keyboard navigation (form → submit on Enter)
- [ ] Basic print view of daily bookings
- [ ] App icon and splash screen assets

---

## 10. File Structure

```
/
├── index.html
├── manifest.json
├── service-worker.js
├── src/
│   ├── app.js              # Entry point, routing, event wiring
│   ├── db.js               # All SQLite operations (bookings + statuses)
│   ├── audit.js            # Audit log writer — called by every write path
│   ├── sync.js             # Sync engine (bookings + statuses)
│   ├── ui/
│   │   ├── home.js         # Date navigator + table
│   │   ├── search.js       # Availability search modal
│   │   ├── booking-form.js # Add/Edit booking form
│   │   ├── status-mgmt.js  # Status Management screen
│   │   └── components.js   # Shared: badges (dynamic colour), modals, pickers
│   └── utils.js            # UUID gen, date formatting, overlap logic
├── styles/
│   └── main.css
├── assets/
│   └── icons/              # PWA icons (192x192, 512x512)
└── server/                 # Optional: Node.js backend
    ├── index.js
    ├── routes/
    │   ├── bookings.js
    │   └── statuses.js
    └── db.js
```

---

## 11. Key Technical Decisions & Risks

| Decision | Rationale |
|---|---|
| `sql.js` + OPFS over IndexedDB | Real SQL for overlap + availability join queries; much simpler than IndexedDB for relational logic |
| UUID generated client-side | Enables offline creation with no server round-trip |
| Statuses as a DB table, not an enum | Operator can add/rename/delete/recolour statuses without a code change |
| `availability` field on status (not on booking) | Decouples conflict logic from individual booking records; changing a status's type retroactively affects all bookings with that status |
| `audit_log` written synchronously on every mutation | Log is always consistent with local state; no async race conditions |
| No client pull in v1 | Single operator = no need to reconcile server changes back to client |
| Background Sync API | Syncs even when tab is closed; falls back to polling on unsupported browsers |
| No framework for MVP | Faster to ship; can migrate to React/Vue later if complexity grows |

**Risks:**
- OPFS is supported in all modern browsers but not in older iOS Safari (pre-16.4). Test on target devices early.
- Background Sync API is not supported in Safari (as of 2026). Polling fallback (every 30s when online) covers this.
- SQLite WASM initial load is ~1–2 MB; cache aggressively in service worker.

---

## 12. Acceptance Criteria

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Open app with no internet | App loads fully, bookings table shown |
| 2 | Add booking offline | Saved locally, queued for sync |
| 3 | Restore internet connection | Queue drains automatically, server updated |
| 4 | Click Sync Now | Immediate sync attempt, status indicator updates |
| 5 | Search Jun 17 11 PM – Jun 18 1 AM with a confirmed booking in that slot | Red "not available" banner shown |
| 6 | Search same slot with only an "interested" booking | Amber warning popup shown |
| 7 | Search slot with no overlapping bookings | Green "available" banner shown |
| 8 | Navigate to any day | Table shows bookings in ascending time order |
| 9 | Filter table by customer name | Table narrows to matching rows |
| 10 | Change booking from any status to any other status | Status badge updates with new colour, synced to server, audit log entry written |
| 11 | Add a new status "VIP Hold" with hard_block | Immediately available in all dropdowns; bookings with this status block availability |
| 12 | Delete a status that has bookings assigned | Blocked with error message listing affected bookings |
| 13 | Delete a status with no bookings | Removed from all dropdowns, synced to server |
| 14 | Change a status's availability from soft_flag to hard_block | All existing bookings with that status now hard-block availability retroactively |
| 15 | Any action in the app | Corresponding entry appears in audit_log with correct old/new values |
| 16 | Install app from browser | Installs as standalone PWA, works offline from home screen |
