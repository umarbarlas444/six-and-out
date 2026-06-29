import { useState } from 'react'
import { searchOverlap, getBookingsByDay } from '@/db.js'
import { toLocalDatetimeValue, formatTime, calcDuration } from '@/utils.js'
import StatusBadge from '@/components/StatusBadge.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { AlertCircle, CheckCircle2, AlertTriangle, Plus, Search } from 'lucide-react'

export default function SearchModal({ onClose, onAddBooking }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [result, setResult] = useState(null)
  const [dayBookings, setDayBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const check = async (e) => {
    e.preventDefault()
    setError('')
    if (!start || !end) return setError('Please enter both start and end times.')
    if (new Date(end) <= new Date(start)) return setError('End must be after start.')
    setLoading(true)
    try {
      const s = new Date(start).toISOString()
      const en = new Date(end).toISOString()
      const overlapping = await searchOverlap(s, en)
      const hard = overlapping.filter((b) => b.status_availability === 'hard_block')
      const soft = overlapping.filter((b) => b.status_availability === 'soft_flag')

      const days = [...new Set([start.slice(0, 10), end.slice(0, 10)])]
      const all = []
      for (const d of days) {
        for (const b of await getBookingsByDay(d)) {
          if (!all.find((x) => x.id === b.id)) all.push(b)
        }
      }
      all.sort((a, b) => a.date_start.localeCompare(b.date_start))

      setResult({ hard, soft, s, en })
      setDayBookings(all)
    } finally {
      setLoading(false)
    }
  }

  const prefill = result
    ? { date_start: toLocalDatetimeValue(result.s), date_end: toLocalDatetimeValue(result.en) }
    : {}

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check availability</DialogTitle>
          <DialogDescription>
            Search a time slot to check for conflicts before confirming a booking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={check} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="gap-2">
            <Search className="h-4 w-4" />
            {loading ? 'Checking…' : 'Check availability'}
          </Button>
        </form>

        {result && (
          <>
            <Separator />

            {result.hard.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Slot unavailable</p>
                </div>
                <p className="text-xs text-muted-foreground">A confirmed booking already exists in this time slot.</p>
                <ConflictList bookings={result.hard} />
              </div>
            )}

            {result.hard.length === 0 && result.soft.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Proceed with caution</p>
                </div>
                <p className="text-xs text-muted-foreground">There is interest in this slot but no confirmed booking.</p>
                <ConflictList bookings={result.soft} />
              </div>
            )}

            {result.hard.length === 0 && result.soft.length === 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Slot is available</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">No conflicting bookings found.</p>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => { onAddBooking(prefill); onClose() }}
            >
              <Plus className="h-4 w-4" /> Add booking for this slot
            </Button>

            {dayBookings.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">All bookings that day</p>
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead className="whitespace-nowrap">Start</TableHead>
                          <TableHead className="whitespace-nowrap">End</TableHead>
                          <TableHead className="whitespace-nowrap">Duration</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayBookings.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium text-sm">{b.customer_name}</TableCell>
                            <TableCell className="text-sm tabular-nums whitespace-nowrap">{formatTime(b.date_start)}</TableCell>
                            <TableCell className="text-sm tabular-nums whitespace-nowrap">{formatTime(b.date_end)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{calcDuration(b.date_start, b.date_end)}</TableCell>
                            <TableCell><StatusBadge label={b.status_label} color={b.status_color} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConflictList({ bookings }) {
  return (
    <ul className="space-y-1.5">
      {bookings.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{b.customer_name}</span>
          <span className="text-muted-foreground">{formatTime(b.date_start)} – {formatTime(b.date_end)}</span>
          <StatusBadge label={b.status_label} color={b.status_color} />
        </li>
      ))}
    </ul>
  )
}
