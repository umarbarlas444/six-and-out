import { useState, useEffect } from 'react'
import {
  getExpenseCategories, createExpenseCategory, updateExpenseCategory,
  deleteExpenseCategory, reorderExpenseCategories,
} from '@/db.js'
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
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, AlertCircle, Loader2 } from 'lucide-react'

const BLANK = { label: '', color: '#6B7280', is_default: false }

function CategoryChip({ label, color }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: color, color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// Categories aren't needed outside this screen and the Expenses page, so unlike
// statuses they're loaded locally rather than held in AppContext.
export default function ExpenseCategoryMgmt() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(null)   // null | 'new' | categoryObj
  const [form, setForm] = useState(BLANK)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const refresh = async () => {
    setCategories(await getExpenseCategories())
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const openNew = () => { setForm({ ...BLANK }); setDialog('new'); setFormError('') }
  const openEdit = (c) => {
    setForm({ label: c.label, color: c.color, is_default: !!c.is_default })
    setDialog(c)
    setFormError('')
  }
  const closeDialog = () => { setDialog(null); setFormError('') }

  const f = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.label.trim()) return setFormError('Label is required.')
    setSaving(true); setFormError('')
    try {
      if (dialog === 'new') {
        await createExpenseCategory({ ...form, label: form.label.trim(), sort_order: categories.length })
      } else {
        await updateExpenseCategory(dialog.id, { ...form, label: form.label.trim() })
      }
      await refresh()
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
      await deleteExpenseCategory(deleteTarget.id)
      await refresh()
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
      setDeleteTarget(null)
    }
  }

  const move = async (i, dir) => {
    const arr = [...categories]
    const t = i + dir
    if (t < 0 || t >= arr.length) return
    ;[arr[i], arr[t]] = [arr[t], arr[i]]
    await reorderExpenseCategories(arr.map((c) => c.id))
    await refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Expense categories</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The categories available when recording an expense.
          </p>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {deleteError}
        </div>
      )}

      <div className="rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm text-muted-foreground">No categories yet.</p>
            <Button variant="outline" size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Add your first category
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {categories.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(i, 1)} disabled={i === categories.length - 1}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                <CategoryChip label={c.label} color={c.color} />

                {/* Coerce to boolean: is_default is an integer column, and a raw
                    0 is valid React content that renders as a literal "0". */}
                {!!c.is_default && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Default
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1">
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
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'new' ? 'Add category' : 'Edit category'}</DialogTitle>
            <DialogDescription>
              {dialog === 'new'
                ? 'Create a new expense category with a label and colour.'
                : 'Changes apply immediately to all expenses in this category.'}
            </DialogDescription>
          </DialogHeader>

          <form id="expense-category-form" onSubmit={save} className="space-y-5">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ec-label">Label <span className="text-destructive">*</span></Label>
              <Input id="ec-label" value={form.label} onChange={f('label')} placeholder="e.g. Water bill" autoFocus />
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
                <Input value={form.color} onChange={f('color')} placeholder="#6B7280" className="font-mono" />
                <CategoryChip label={form.label || 'Preview'} color={form.color} />
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
                <p className="text-sm font-medium">Default category</p>
                <p className="text-xs text-muted-foreground">Pre-selected when recording a new expense</p>
              </div>
            </label>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="submit" form="expense-category-form" disabled={saving}>
              {saving ? 'Saving…' : 'Save category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the <strong>{deleteTarget?.label}</strong> category.
              This cannot be undone and will fail if any expenses are still using it.
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
