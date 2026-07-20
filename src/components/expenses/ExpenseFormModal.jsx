import { useState } from 'react'
import { createExpense, updateExpense } from '@/db.js'
import { actualToBusinessValue, businessValueToActualDate, todayBusinessDay } from '@/utils.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'

// Default a new expense to noon on the current business day rather than `now`.
// Noon can never be read back as the previous business day by businessDayKey,
// so the date the operator sees is always the date they get.
function defaultSpentAt() {
  return `${todayBusinessDay()}T12:00`
}

export default function ExpenseFormModal({ expense, categories, onClose, onSaved }) {
  const isEdit = !!expense
  const defaultCategory = categories.find((c) => c.is_default) || categories[0]

  const [form, setForm] = useState(() => ({
    category_id: expense?.category_id || defaultCategory?.id || '',
    amount: expense ? String(expense.amount) : '',
    // Stored value is a real calendar datetime; the picker shows the business
    // day it belongs to, matching how BookingForm handles date_start.
    spent_at: expense ? actualToBusinessValue(expense.spent_at) : defaultSpentAt(),
    notes: expense?.notes || '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const f = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.category_id) return setError('Category is required.')
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      return setError('Amount must be a number greater than zero.')
    }
    if (!form.spent_at) return setError('Date is required.')

    setSaving(true); setError('')
    try {
      const payload = {
        category_id: form.category_id,
        amount,
        spent_at: businessValueToActualDate(form.spent_at).toISOString(),
        notes: form.notes.trim() || null,
      }
      if (isEdit) await updateExpense(expense.id, payload)
      else await createExpense(payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            Recorded against the business day (5 AM – 5 AM) containing the date you pick.
          </DialogDescription>
        </DialogHeader>

        <form id="expense-form" onSubmit={save} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Category <span className="text-destructive">*</span></Label>
            <Select
              value={form.category_id}
              onValueChange={(v) => setForm((prev) => ({ ...prev, category_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-amount">Amount (PKR) <span className="text-destructive">*</span></Label>
            <Input
              id="e-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.amount}
              onChange={f('amount')}
              placeholder="e.g. 45000"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-date">Date &amp; time <span className="text-destructive">*</span></Label>
            <input
              id="e-date"
              type="datetime-local"
              value={form.spent_at}
              onChange={f('spent_at')}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-notes">Notes</Label>
            <Input
              id="e-notes"
              value={form.notes}
              onChange={f('notes')}
              placeholder="e.g. K-Electric bill, June"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="expense-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save expense' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
