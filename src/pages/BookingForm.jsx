import { useState, useEffect } from 'react'
import { useApp } from '@/context/AppContext.jsx'
import { createBooking, updateBooking, getBookingById } from '@/db.js'
import { toLocalDatetimeValue } from '@/utils.js'
import StatusBadge from '@/components/StatusBadge.jsx'
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'

const empty = {
  customer_name: '', phone: '', date_start: '', date_end: '',
  status: '', notes: '', advance_paid: '', total_amount: '',
}

export default function BookingForm({ bookingId, prefill, onClose, onSaved }) {
  const { statuses, refreshPending } = useApp()
  const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(bookingId)

  useEffect(() => {
    if (bookingId) {
      getBookingById(bookingId).then((b) => b && setForm({
        customer_name: b.customer_name,
        phone: b.phone ?? '',
        date_start: toLocalDatetimeValue(b.date_start),
        date_end: toLocalDatetimeValue(b.date_end),
        status: b.status,
        notes: b.notes ?? '',
        advance_paid: b.advance_paid ?? '',
        total_amount: b.total_amount ?? '',
      }))
    } else {
      setForm({ ...empty, status: defaultStatus?.id ?? '', ...prefill })
    }
  }, [bookingId]) // eslint-disable-line

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const selectedStatus = statuses.find((s) => s.id === form.status)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.customer_name.trim()) return setError('Customer name is required.')
    if (!form.date_start) return setError('Start date & time is required.')
    if (!form.date_end) return setError('End date & time is required.')
    if (new Date(form.date_end) <= new Date(form.date_start))
      return setError('End time must be after start time.')

    setSaving(true)
    try {
      const data = {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        date_start: new Date(form.date_start).toISOString(),
        date_end: new Date(form.date_end).toISOString(),
        status: form.status,
        notes: form.notes.trim(),
        advance_paid: parseFloat(form.advance_paid) || 0,
        total_amount: parseFloat(form.total_amount) || 0,
      }
      if (isEdit) {
        await updateBooking(bookingId, data, await getBookingById(bookingId))
      } else {
        await createBooking(data)
      }
      await refreshPending()
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
            <div className="flex items-center gap-3">
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick a status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                        {s.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStatus && (
                <StatusBadge label={selectedStatus.label} color={selectedStatus.color} />
              )}
            </div>
          </div>

          <Separator />

          {/* Times */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date_start">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date_start"
                type="datetime-local"
                value={form.date_start}
                onChange={field('date_start')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date_end">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date_end"
                type="datetime-local"
                value={form.date_end}
                onChange={field('date_end')}
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="booking-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
