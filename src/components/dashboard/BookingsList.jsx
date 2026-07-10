import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import StatusBadge from '@/components/StatusBadge.jsx'
import { formatTime, calcDuration, businessDayKey } from '@/utils.js'
import { isCompleted } from '@/lib/stats.js'
import { Pencil, Plus, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

// The business day the booking belongs to, shown short ("10 Jul").
function shortBusinessDate(isoString) {
  return new Date(businessDayKey(isoString) + 'T12:00:00')
    .toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
}

export default function BookingsList({
  title, description, bookings, statuses, onEdit, onStatusChange,
  onAdd, showDate = false, compact = false, className, emptyMessage = 'No bookings.',
}) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {onAdd && (
          <CardAction>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="max-h-96 divide-y overflow-y-auto">
            {bookings.map((b) => {
              const total = Number(b.total_amount) || 0
              const due = isCompleted(b) ? 0 : total - (Number(b.advance_paid) || 0)
              return (
                <div key={b.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className={cn('shrink-0', showDate ? 'w-24' : 'w-20')}>
                    {showDate && (
                      <p className="text-xs text-muted-foreground">{shortBusinessDate(b.date_start)}</p>
                    )}
                    <p className="text-sm font-medium tabular-nums whitespace-nowrap">{formatTime(b.date_start)}</p>
                    <p className="text-xs text-muted-foreground">{calcDuration(b.date_start, b.date_end)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.customer_name}</p>
                    {b.phone && (
                      <a
                        href={`https://wa.me/${b.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {b.phone}
                      </a>
                    )}
                  </div>
                  {!compact && total > 0 && (
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-sm font-medium tabular-nums">PKR {total.toLocaleString()}</p>
                      {due > 0 && (
                        <p className="text-xs tabular-nums text-amber-600 dark:text-amber-400">
                          {due.toLocaleString()} due
                        </p>
                      )}
                    </div>
                  )}
                  <Select value={b.status} onValueChange={(v) => onStatusChange(b.id, v)}>
                    <SelectTrigger className="h-auto w-auto border-none bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:hidden">
                      <StatusBadge label={b.status_label} color={b.status_color} />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                            {s.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onEdit(b.id)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit booking</span>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
