import { useState } from 'react'
import { useApp } from '@/context/AppContext.jsx'
import { createStatus, updateStatus, deleteStatus, reorderStatuses } from '@/db.js'
import StatusBadge from '@/components/StatusBadge.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const AVAIL = [
  { value: 'hard_block', label: 'Hard block', description: 'Marks the slot as fully unavailable' },
  { value: 'soft_flag',  label: 'Soft flag',  description: 'Shows a caution warning to the operator' },
  { value: 'ignore',     label: 'Ignore',     description: 'Excluded from all availability checks' },
]

const BLANK = { label: '', color: '#3B82F6', availability: 'soft_flag', is_default: false }

export default function StatusMgmt() {
  const { statuses, refreshStatuses } = useApp()
  const [dialog, setDialog] = useState(null)   // null | 'new' | statusObj
  const [form, setForm] = useState(BLANK)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const openNew  = () => { setForm({ ...BLANK }); setDialog('new'); setFormError('') }
  const openEdit = (s) => { setForm({ label: s.label, color: s.color, availability: s.availability, is_default: !!s.is_default }); setDialog(s); setFormError('') }
  const closeDialog = () => { setDialog(null); setFormError('') }

  const f = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.label.trim()) return setFormError('Label is required.')
    setSaving(true); setFormError('')
    try {
      if (dialog === 'new') {
        await createStatus({ ...form, label: form.label.trim(), sort_order: statuses.length })
      } else {
        await updateStatus(dialog.id, { ...form, label: form.label.trim() }, dialog)
      }
      await refreshStatuses()
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
      await deleteStatus(deleteTarget.id, deleteTarget)
      await refreshStatuses()
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
      setDeleteTarget(null)
    }
  }

  const move = async (i, dir) => {
    const arr = [...statuses]
    const t = i + dir
    if (t < 0 || t >= arr.length) return
    ;[arr[i], arr[t]] = [arr[t], arr[i]]
    await reorderStatuses(arr.map((s) => s.id))
    await refreshStatuses()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Booking statuses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define the statuses used to track bookings and control slot availability.
          </p>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add status
        </Button>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {deleteError}
        </div>
      )}

      <div className="rounded-lg border">
        {statuses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm text-muted-foreground">No statuses yet.</p>
            <Button variant="outline" size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Add your first status
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {statuses.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                {/* Reorder buttons */}
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, 1)} disabled={i === statuses.length - 1}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <StatusBadge label={s.label} color={s.color} />

                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {AVAIL.find((a) => a.value === s.availability)?.label}
                </span>

                {s.is_default && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Default
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'new' ? 'Add status' : 'Edit status'}</DialogTitle>
            <DialogDescription>
              {dialog === 'new'
                ? 'Create a new status with a label, colour, and availability behaviour.'
                : 'Changes apply immediately to all bookings using this status.'}
            </DialogDescription>
          </DialogHeader>

          <form id="status-form" onSubmit={save} className="space-y-5">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="s-label">Label <span className="text-destructive">*</span></Label>
              <Input id="s-label" value={form.label} onChange={f('label')} placeholder="e.g. VIP Hold" autoFocus />
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={f('color')}
                  className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
                />
                <Input value={form.color} onChange={f('color')} placeholder="#3B82F6" className="font-mono" />
                <StatusBadge label={form.label || 'Preview'} color={form.color} />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Availability</Label>
              <div className="space-y-2">
                {AVAIL.map((a) => (
                  <label
                    key={a.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent',
                      form.availability === a.value && 'border-primary bg-primary/5'
                    )}
                  >
                    <input
                      type="radio"
                      name="avail"
                      value={a.value}
                      checked={form.availability === a.value}
                      onChange={f('availability')}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={f('is_default')}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">Default status</p>
                <p className="text-xs text-muted-foreground">Pre-selected when creating new bookings</p>
              </div>
            </label>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="submit" form="status-form" disabled={saving}>
              {saving ? 'Saving…' : 'Save status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete status?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the <strong>{deleteTarget?.label}</strong> status.
              This cannot be undone and will fail if any bookings are still using it.
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
    </div>
  )
}
