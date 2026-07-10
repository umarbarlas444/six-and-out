import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/utils.js'
import { BadgeCheck } from 'lucide-react'

const MAX_ROWS = 8

export default function PaymentsDue({ bookings, onEdit }) {
  const totalDue = bookings.reduce(
    (s, b) => s + (Number(b.total_amount) || 0) - (Number(b.advance_paid) || 0), 0
  )
  const shown = bookings.slice(0, MAX_ROWS)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Payments to collect</CardTitle>
        <CardDescription>
          {bookings.length === 0
            ? 'All settled'
            : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''} · PKR ${totalDue.toLocaleString()} outstanding`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <BadgeCheck className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No outstanding payments.</p>
          </div>
        ) : (
          <div className="divide-y">
            {shown.map((b) => {
              const total = Number(b.total_amount) || 0
              const paid = Number(b.advance_paid) || 0
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onEdit(b.id)}
                  className="flex w-full items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(b.date_start)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-amber-600 dark:text-amber-400">
                      PKR {(total - paid).toLocaleString()}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {paid.toLocaleString()} / {total.toLocaleString()}
                    </p>
                  </div>
                </button>
              )
            })}
            {bookings.length > MAX_ROWS && (
              <p className="pt-2.5 text-xs text-muted-foreground">
                +{bookings.length - MAX_ROWS} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
