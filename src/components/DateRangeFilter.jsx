import { useState } from 'react'
import { PERIOD_LABELS, getPeriodRange } from '@/lib/period.js'
import { formatDateInput } from '@/utils.js'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
const fmtRangeDate = (day) => new Date(day + 'T12:00:00').toLocaleDateString('en-GB')

// Date -> 'DD/MM/YYYY', for the in-progress selection readout.
const fmtDate = (d) => d.toLocaleDateString('en-GB')

// react-day-picker works in Date objects; everything else in this app works in
// 'YYYY-MM-DD' business-day keys. Convert at this boundary only, at local midday
// so no timezone offset can shift the calendar date.
const dayToDate = (day) => (day ? new Date(day + 'T12:00:00') : undefined)

// Period preset selector + custom range picker, shared by the Dashboard and
// Expenses screens so both offer identical periods.
export default function DateRangeFilter({
  period, onPeriodChange,
  customFrom, customTo, onCustomChange,
}) {
  const [open, setOpen] = useState(false)
  // The pending start date, held locally so a half-picked range never reaches
  // the page and triggers a refetch for a range the operator never asked for.
  const [pendingFrom, setPendingFrom] = useState(null)
  const { startDay, endDay } = getPeriodRange(period, customFrom, customTo)

  // Open on a clean slate; discard any half-finished selection on close.
  const handleOpenChange = (next) => {
    setPendingFrom(null)
    setOpen(next)
  }

  // Selection is driven off raw day clicks rather than react-day-picker's range
  // state machine. That machine reports `{from: day, to: day}` on the FIRST
  // click (v10), so a "has both ends" check on its output is indistinguishable
  // from a genuine two-click range and commits after one click. Counting clicks
  // ourselves is version-proof.
  const handleDayClick = (day) => {
    if (!pendingFrom) {
      setPendingFrom(day)
      return
    }
    // Second click completes the range; accept the two dates in either order.
    const [from, to] = pendingFrom <= day ? [pendingFrom, day] : [day, pendingFrom]
    onCustomChange(formatDateInput(from), formatDateInput(to))
    setPendingFrom(null)
    setOpen(false)
  }

  const awaitingEnd = !!pendingFrom

  return (
    <>
      <Select value={period} onValueChange={onPeriodChange}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERIOD_LABELS).map(([k, label]) => (
            <SelectItem key={k} value={k}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {period === 'custom' ? (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 font-normal tabular-nums">
              <CalendarIcon className="h-4 w-4" />
              {fmtRangeDate(startDay)}
              {endDay !== startDay ? ` – ${fmtRangeDate(endDay)}` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="flex items-center justify-between gap-4 border-b px-3 py-2">
              <span className="text-xs font-medium">
                {awaitingEnd ? 'Select end date' : 'Select start date'}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {pendingFrom ? fmtDate(pendingFrom) : '—'}
                {' → '}
                {'—'}
              </span>
            </div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={dayToDate(customFrom)}
              // Highlight the pending start only; the range fills in on commit.
              selected={pendingFrom ? { from: pendingFrom, to: undefined } : undefined}
              onDayClick={handleDayClick}
              autoFocus
              className="p-3"
            />
          </PopoverContent>
        </Popover>
      ) : (
        <span className="text-sm tabular-nums text-muted-foreground">
          {fmtRangeDate(startDay)}
          {endDay !== startDay ? ` – ${fmtRangeDate(endDay)}` : ''}
        </span>
      )}
    </>
  )
}
