import { useState, useEffect } from 'react'
import StatusMgmt from './StatusMgmt.jsx'
import ExpenseCategoryMgmt from './ExpenseCategoryMgmt.jsx'
import { getInventory, setInventory } from '@/db.js'
import { formatDate } from '@/utils.js'
import CounterInput from '@/components/CounterInput.jsx'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertCircle, Loader2, Lock, Tags, Receipt, Boxes } from 'lucide-react'

const ITEMS = [
  { key: 'balls_new', label: 'New balls' },
  { key: 'balls_old', label: 'Old balls' },
  { key: 'tapes', label: 'Tapes' },
]

function InventorySection() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventory, setInv] = useState(null)
  const [form, setForm] = useState({ balls_new: '', balls_old: '', tapes: '' })
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getInventory()
      .then(setInv)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await setInventory({
        balls_new: parseInt(form.balls_new, 10) || 0,
        balls_old: parseInt(form.balls_old, 10) || 0,
        tapes: parseInt(form.tapes, 10) || 0,
      })
      setInv(await getInventory())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Inventory stock</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Current stock of balls and tapes handed out to teams.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-8 text-sm text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : inventory ? (
        <div className="rounded-lg border">
          <div className="grid grid-cols-3 divide-x">
            {ITEMS.map(({ key, label }) => (
              <div key={key} className="px-4 py-5 text-center">
                <p className="text-2xl font-semibold tabular-nums">{inventory[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Set on {formatDate(inventory.created_at)} — stock levels are locked. Adjustments will be added in a later update.
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ITEMS.map(({ key, label }) => (
              <CounterInput
                key={key}
                id={`inv_${key}`}
                label={label}
                value={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            These starting counts can only be set once — they are locked afterwards.
          </p>
          <Button onClick={() => setConfirming(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Set initial stock'}
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set initial stock?</AlertDialogTitle>
            <AlertDialogDescription>
              This records {parseInt(form.balls_new, 10) || 0} new balls, {parseInt(form.balls_old, 10) || 0} old
              balls and {parseInt(form.tapes, 10) || 0} tapes as your current stock. These numbers are locked once
              set and cannot be changed from the app yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={save}>Set stock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Settings sections, in sidebar order. The first is selected by default.
const SECTIONS = [
  { key: 'statuses', label: 'Booking Statuses', Icon: Tags, Component: StatusMgmt },
  { key: 'expense-categories', label: 'Expense Categories', Icon: Receipt, Component: ExpenseCategoryMgmt },
  { key: 'inventory', label: 'Inventory Stock', Icon: Boxes, Component: InventorySection },
]

export default function Settings() {
  const [section, setSection] = useState(SECTIONS[0].key)
  const active = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0]
  const ActiveSection = active.Component

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row">
      {/* Section nav — a sidebar on desktop, a scrollable row of chips on mobile */}
      <nav
        aria-label="Settings sections"
        className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-56 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {SECTIONS.map(({ key, label, Icon }) => (
          <Button
            key={key}
            variant={section === key ? 'secondary' : 'ghost'}
            size="sm"
            aria-current={section === key ? 'page' : undefined}
            className="shrink-0 justify-start gap-2 sm:w-full"
            onClick={() => setSection(key)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Button>
        ))}
      </nav>

      {/* min-w-0 so a wide child (tables, charts) can't push the sidebar around */}
      <div className="min-w-0 flex-1">
        <ActiveSection />
      </div>
    </div>
  )
}
