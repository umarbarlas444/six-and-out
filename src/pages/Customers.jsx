import { useState, useEffect, useRef } from 'react'
import {
  getCustomersPage, createCustomer, updateCustomer, deleteCustomer,
  findCustomerByPhone, getBookingsByCustomer,
} from '@/db.js'
import { computeStats } from '@/lib/stats.js'
import {
  validateImageFile, uploadCustomerImage, deleteCustomerImage, formatBytes, MAX_UPLOAD_BYTES,
} from '@/lib/customerImage.js'
import { formatDate, formatTime } from '@/utils.js'
import StatusBadge from '@/components/StatusBadge.jsx'
import Avatar from '@/components/Avatar.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Pencil, Trash2, Search, AlertCircle, User, X, ImagePlus,
  ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight,
} from 'lucide-react'

const BLANK = { name: '', phone: '', alt_phone: '', notes: '', avatar_url: '' }
const PAGE_SIZE = 20

const pkr = (n) => `PKR ${(Number(n) || 0).toLocaleString()}`

// A sortable column header. Clicking cycles asc/desc; the active column shows
// a direction arrow, the rest a neutral icon.
function SortHeader({ label, col, sort, onSort, align = 'left' }) {
  const active = sort.by === col
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`whitespace-nowrap px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : 'text-muted-foreground'} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </th>
  )
}

export default function Customers({ onEditBooking, refreshKey }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState({ by: 'name', dir: 'asc' })
  const [page, setPage] = useState(0)
  const [reloadTick, setReloadTick] = useState(0)

  const [dialog, setDialog] = useState(null) // null | 'new' | customerObj
  const [form, setForm] = useState(BLANK)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Captain photo, staged locally until the customer is saved. `imageFile` is a
  // freshly picked File, `imagePreview` its object URL, and `imageCleared` marks
  // "remove the existing photo" so it can be told apart from "left untouched".
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageCleared, setImageCleared] = useState(false)
  const fileInputRef = useRef(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [selected, setSelected] = useState(null) // customer whose history is shown
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Debounce the search box; any new query resets to the first page.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Fetch the current page whenever the query, sort, page, or an external/
  // internal refresh changes.
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    getCustomersPage({ search: debouncedSearch, sortBy: sort.by, sortDir: sort.dir, page, pageSize: PAGE_SIZE })
      .then((res) => { if (active) { setRows(res.rows); setTotal(res.total) } })
      .catch((err) => { if (active) { setRows([]); setTotal(0); setLoadError(err.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, sort.by, sort.dir, page, refreshKey, reloadTick])

  // If a delete/search shrinks the result set below the current page, jump
  // straight to the last valid page (rather than stepping one at a time) so we
  // don't linger on / re-fetch an out-of-range page.
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
    if (!loading && page > lastPage) setPage(lastPage)
  }, [loading, total, page])

  const reload = () => setReloadTick((t) => t + 1)

  const toggleSort = (col) => {
    setPage(0)
    setSort((s) => (s.by === col
      ? { by: col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: col, dir: col === 'name' ? 'asc' : 'desc' }))
  }

  // Drop any staged photo and release its object URL.
  const resetImageState = () => {
    setImageFile(null)
    setImagePreview((url) => { if (url) URL.revokeObjectURL(url); return '' })
    setImageCleared(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openNew = () => { setForm({ ...BLANK }); resetImageState(); setDialog('new'); setFormError('') }
  const openEdit = (c) => {
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      alt_phone: c.alt_phone ?? '',
      notes: c.notes ?? '',
      avatar_url: c.avatar_url ?? '',
    })
    resetImageState()
    setDialog(c)
    setFormError('')
  }
  const closeDialog = () => { setDialog(null); setFormError(''); resetImageState() }

  // Revoke the last preview URL if the component unmounts mid-edit.
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }, [imagePreview])

  const pickImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      setFormError(err.message)
      e.target.value = ''
      return
    }
    setFormError('')
    setImageFile(file)
    setImagePreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file) })
    setImageCleared(false)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview((url) => { if (url) URL.revokeObjectURL(url); return '' })
    setImageCleared(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // What the dialog should show right now: a just-picked file wins, then the
  // saved photo unless it's been cleared.
  const shownAvatar = imagePreview || (imageCleared ? '' : form.avatar_url)

  const f = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setFormError('Name is required.')
    setSaving(true); setFormError('')
    try {
      const phone = form.phone.trim()
      if (phone) {
        const existing = await findCustomerByPhone(phone)
        if (existing && existing.id !== (dialog === 'new' ? null : dialog.id)) {
          setFormError(`A customer with this phone already exists: ${existing.name}`)
          setSaving(false)
          return
        }
      }
      const data = {
        name: form.name.trim(),
        phone,
        alt_phone: form.alt_phone.trim(),
        notes: form.notes.trim(),
      }
      const previousAvatar = dialog === 'new' ? '' : (dialog.avatar_url ?? '')

      if (dialog === 'new') {
        // Create first so the uploaded object can be keyed to a real customer
        // id, then patch the URL back on. A failed upload leaves a perfectly
        // valid customer behind — the photo was optional to begin with — so
        // report it without rolling the record back.
        const id = await createCustomer(data)
        if (imageFile) {
          try {
            const url = await uploadCustomerImage(id, imageFile)
            await updateCustomer(id, { avatar_url: url })
          } catch (err) {
            reload()
            setFormError(`Customer saved, but the photo failed: ${err.message}`)
            resetImageState()
            return
          }
        }
      } else {
        if (imageFile) {
          data.avatar_url = await uploadCustomerImage(dialog.id, imageFile)
        } else if (imageCleared) {
          data.avatar_url = null
        }
        await updateCustomer(dialog.id, data)
        // Only once the row points somewhere else is the old object garbage.
        if ('avatar_url' in data && previousAvatar && previousAvatar !== data.avatar_url) {
          await deleteCustomerImage(previousAvatar)
        }
      }
      reload()
      closeDialog()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setDeleteError('')
    try {
      await deleteCustomer(deleteTarget.id)
      if (selected?.id === deleteTarget.id) setSelected(null)
      reload()
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
      setDeleteTarget(null)
    }
  }

  const openHistory = (c) => {
    setSelected(c)
    setLoadingHistory(true)
    getBookingsByCustomer(c.id).then(setHistory).finally(() => setLoadingHistory(false))
  }

  const stats = selected ? computeStats(history) : null
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} customer{total !== 1 ? 's' : ''} · saved customers can be picked from the booking form's autocomplete.
          </p>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add customer
        </Button>
      </div>

      {(deleteError || loadError) && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {deleteError || loadError}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/40 text-xs">
              <tr>
                <SortHeader label="Name" col="name" sort={sort} onSort={toggleSort} />
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">Contact</th>
                <SortHeader label="Bookings" col="booking_count" sort={sort} onSort={toggleSort} align="right" />
                <SortHeader label="Revenue" col="revenue" sort={sort} onSort={toggleSort} align="right" />
                <SortHeader label="Outstanding" col="outstanding" sort={sort} onSort={toggleSort} align="right" />
                <SortHeader label="Last booking" col="last_booking_at" sort={sort} onSort={toggleSort} align="right" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">Loading…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={7} className="py-14 text-center text-sm text-muted-foreground">Couldn’t load customers — see the message above.</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <User className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {debouncedSearch ? 'No customers match your search.' : 'No customers yet.'}
                      </p>
                      {!debouncedSearch && (
                        <Button variant="outline" size="sm" onClick={openNew}>
                          <Plus className="mr-1.5 h-4 w-4" /> Add your first customer
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} src={c.avatar_url} className="h-8 w-8 text-xs" />
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => openHistory(c)}
                        >
                          {c.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.phone || <span className="italic">No phone</span>}
                      {c.alt_phone && <div className="text-xs">{c.alt_phone}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(c.booking_count) || 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pkr(c.revenue)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${Number(c.outstanding) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {pkr(c.outstanding)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                      {c.last_booking_at ? formatDate(c.last_booking_at) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
            <span className="tabular-nums">{rangeStart}–{rangeEnd} of {total}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">Page {page + 1} of {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'new' ? 'Add customer' : 'Edit customer'}</DialogTitle>
            <DialogDescription>
              {dialog === 'new'
                ? 'Save a customer to reuse in future bookings.'
                : 'Renaming a customer does not change the name recorded on their past bookings.'}
            </DialogDescription>
          </DialogHeader>

          <form id="customer-form" onSubmit={save} className="space-y-5">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Captain photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <div className="flex items-center gap-4">
                <Avatar name={form.name} src={shownAvatar} className="h-20 w-20 text-xl" />
                <div className="space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={pickImage}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="mr-1.5 h-4 w-4" />
                      {shownAvatar ? 'Change photo' : 'Upload photo'}
                    </Button>
                    {shownAvatar && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearImage}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or WebP, up to {formatBytes(MAX_UPLOAD_BYTES)}. Without one, their
                    initials are shown.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name <span className="text-destructive">*</span></Label>
              <Input id="c-name" value={form.name} onChange={f('name')} placeholder="e.g. Ahmed Ali" autoFocus />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">WhatsApp number</Label>
                <Input id="c-phone" value={form.phone} onChange={f('phone')} placeholder="0300 0000000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-alt-phone">Alternate contact</Label>
                <Input id="c-alt-phone" value={form.alt_phone} onChange={f('alt_phone')} placeholder="Optional" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea
                id="c-notes"
                rows={3}
                placeholder="e.g. prefers evening slots"
                value={form.notes}
                onChange={f('notes')}
              />
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="submit" form="customer-form" disabled={saving}>
              {saving ? (imageFile ? 'Uploading…' : 'Saving…') : 'Save customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <strong>{deleteTarget?.name}</strong>. Their bookings are kept and
              still show the name and phone recorded at booking time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Booking history */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              {[selected?.phone, selected?.alt_phone].filter(Boolean).join(' · ') || 'No phone on file'}
            </DialogDescription>
          </DialogHeader>

          {loadingHistory ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {stats && (
                <div className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{stats.count}</p>
                    <p className="text-xs text-muted-foreground">Bookings</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{pkr(stats.revenue)}</p>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                  </div>
                  <div>
                    <p className={`text-lg font-semibold tabular-nums ${stats.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                      {pkr(stats.outstanding)}
                    </p>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10">
                    <User className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No bookings yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {history.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
                          onClick={() => { setSelected(null); onEditBooking?.(b.id) }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{formatDate(b.date_start)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(b.date_start)} – {formatTime(b.date_end)}
                            </p>
                          </div>
                          <StatusBadge label={b.status_label} color={b.status_color} />
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-medium tabular-nums">
                              {pkr(b.total_amount)}
                            </p>
                            {(Number(b.advance_paid) || 0) < (Number(b.total_amount) || 0) && (
                              <p className="text-xs text-amber-600 dark:text-amber-400">
                                {(Number(b.advance_paid) || 0).toLocaleString()} paid
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
