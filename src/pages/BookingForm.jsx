import { useState, useEffect } from 'react'
import { useApp } from '@/context/AppContext.jsx'
import { createBooking, updateBooking, deleteBooking, getBookingById } from '@/db.js'
import { actualToBusinessValue, businessValueToActualDate } from '@/utils.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import StatusBadge from '@/components/StatusBadge.jsx'
import { AlertCircle, ChevronDown, Trash2 } from 'lucide-react'

const HOURS12 = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
const MINUTES = ['00', '15', '30', '45']

function to12h(h24) {
  const h = parseInt(h24, 10)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? '12' : String(h % 12)
  return { h12, ampm }
}

function to24h(h12, ampm) {
  let h = parseInt(h12, 10)
  if (ampm === 'AM') return h === 12 ? '00' : String(h).padStart(2, '0')
  return h === 12 ? '12' : String(h + 12).padStart(2, '0')
}

function parseDateTime(value) {
  if (!value) return { date: '', h12: '8', minute: '00', ampm: 'AM' }
  const [d, t = '08:00'] = value.split('T')
  const [h24 = '08', m = '00'] = t.split(':')
  const { h12, ampm } = to12h(h24)
  const minute = MINUTES.includes(m.slice(0, 2)) ? m.slice(0, 2) : '00'
  return { date: d, h12, minute, ampm }
}

function DateTimePicker({ value, onChange }) {
  const init = parseDateTime(value)
  const [date, setDate] = useState(init.date)
  const [h12, setH12] = useState(init.h12)
  const [minute, setMinute] = useState(init.minute)
  const [ampm, setAmpm] = useState(init.ampm)

  useEffect(() => {
    const p = parseDateTime(value)
    setDate(p.date)
    setH12(p.h12)
    setMinute(p.minute)
    setAmpm(p.ampm)
  }, [value])

  const emit = (d, h, mm, ap) => {
    if (d) onChange(`${d}T${to24h(h, ap)}:${mm}`)
  }

  const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Input
        type="date"
        className="flex-1 min-w-[130px]"
        value={date}
        onChange={(e) => { setDate(e.target.value); emit(e.target.value, h12, minute, ampm) }}
      />
      <div className="flex items-center gap-1">
        <select
          className={selectCls}
          value={h12}
          onChange={(e) => { setH12(e.target.value); emit(date, e.target.value, minute, ampm) }}
        >
          {HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-muted-foreground text-sm font-medium">:</span>
        <select
          className={selectCls}
          value={minute}
          onChange={(e) => { setMinute(e.target.value); emit(date, h12, e.target.value, ampm) }}
        >
          {MINUTES.map((mm) => <option key={mm} value={mm}>{mm}</option>)}
        </select>
        <select
          className={selectCls}
          value={ampm}
          onChange={(e) => { setAmpm(e.target.value); emit(date, h12, minute, e.target.value) }}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  )
}

const empty = {
  customer_name: '', phone: '', date_start: '', hours: '',
  status: '', notes: '', advance_paid: '', total_amount: '',
}

export default function BookingForm({ bookingId, prefill, onClose, onSaved }) {
  const { statuses } = useApp()
  const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(bookingId)

  useEffect(() => {
    if (bookingId) {
      getBookingById(bookingId).then((b) => {
        if (!b) return
        const hours = b.date_start && b.date_end
          ? (new Date(b.date_end) - new Date(b.date_start)) / 3600000
          : ''
        setForm({
          customer_name: b.customer_name,
          phone: b.phone ?? '',
          // Show the business day the user thinks in, not the raw calendar date.
          date_start: actualToBusinessValue(b.date_start),
          hours: hours !== '' ? String(hours) : '',
          status: b.status,
          notes: b.notes ?? '',
          advance_paid: b.advance_paid ?? '',
          total_amount: b.total_amount ?? '',
        })
      })
    } else {
      // Prefills carry actual calendar datetimes (e.g. from a past-midnight
      // calendar slot); present them as the corresponding business day.
      const pf = { ...prefill }
      if (pf.date_start) pf.date_start = actualToBusinessValue(pf.date_start)
      setForm({ ...empty, status: defaultStatus?.id ?? '', ...pf })
    }
  }, [bookingId]) // eslint-disable-line

  const [statusOpen, setStatusOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const selectedStatus = statuses.find((s) => s.id === form.status)

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleDelete = async () => {
    await deleteBooking(bookingId)
    onSaved?.()
    onClose()
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.customer_name.trim()) return setError('Customer name is required.')
    if (!form.date_start) return setError('Start date & time is required.')
    const hours = parseFloat(form.hours)
    if (!form.hours || isNaN(hours) || hours <= 0) return setError('Duration must be a positive number of hours.')

    // The picker holds a business day; convert to the actual calendar datetime
    // (a start before 5 AM lands on the next calendar day) before storing.
    const dateStart = businessValueToActualDate(form.date_start)
    const dateEnd = new Date(dateStart.getTime() + hours * 3600000)

    setSaving(true)
    try {
      const data = {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        date_start: dateStart.toISOString(),
        date_end: dateEnd.toISOString(),
        status: form.status,
        notes: form.notes.trim(),
        advance_paid: parseFloat(form.advance_paid) || 0,
        total_amount: parseFloat(form.total_amount) || 0,
      }
      if (isEdit) {
        await updateBooking(bookingId, data)
      } else {
        await createBooking(data)
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit booking' : 'New booking'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the details for this booking.' : 'Add a new booking to the schedule.'}
          </DialogDescription>
        </DialogHeader>

        <form id="booking-form" onSubmit={submit} className="space-y-5 py-2">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Customer */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">
                Customer name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer_name"
                placeholder="e.g. Ahmed Ali"
                value={form.customer_name}
                onChange={field('customer_name')}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">WhatsApp number</Label>
              <Input
                id="phone"
                placeholder="+92 300 0000000"
                value={form.phone}
                onChange={field('phone')}
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal h-10"
                >
                  {selectedStatus
                    ? <StatusBadge label={selectedStatus.label} color={selectedStatus.color} />
                    : <span className="text-muted-foreground text-sm">Pick a status</span>}
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-1"
                style={{ width: 'var(--radix-popover-trigger-width)' }}
                align="start"
              >
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full flex items-center px-2 py-1.5 rounded hover:bg-accent text-left"
                    onClick={() => {
                      setForm((f) => ({ ...f, status: s.id }))
                      setStatusOpen(false)
                    }}
                  >
                    <StatusBadge label={s.label} color={s.color} />
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <Separator />

          {/* Times */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date_start">
                Start <span className="text-destructive">*</span>
              </Label>
              <DateTimePicker
                value={form.date_start}
                onChange={(v) => setForm((f) => ({ ...f, date_start: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hours">
                Duration (hours) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hours"
                type="number"
                min="0.5"
                step="0.5"
                placeholder="e.g. 2 or 1.5"
                value={form.hours}
                onChange={field('hours')}
              />
            </div>
          </div>

          <Separator />

          {/* Financials */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="advance_paid">Advance paid (PKR)</Label>
              <Input
                id="advance_paid"
                type="number"
                min="0"
                placeholder="0"
                value={form.advance_paid}
                onChange={field('advance_paid')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total_amount">Total amount (PKR)</Label>
              <Input
                id="total_amount"
                type="number"
                min="0"
                placeholder="0"
                value={form.total_amount}
                onChange={field('total_amount')}
              />
            </div>
          </div>

          {(() => {
            const total = parseFloat(form.total_amount) || 0
            const advance = parseFloat(form.advance_paid) || 0
            const due = total - advance
            if (total === 0) return null
            return (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm text-muted-foreground">Amount due</span>
                <span className={`text-sm font-semibold ${due > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  PKR {due.toLocaleString()}
                </span>
              </div>
            )
          })()}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes…"
              rows={3}
              className="resize-none"
              value={form.notes}
              onChange={field('notes')}
            />
          </div>
        </form>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="booking-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add booking'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the booking for <strong>{form.customer_name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
