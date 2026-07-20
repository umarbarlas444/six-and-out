import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate, formatTime } from '@/utils.js'
import { Pencil, Trash2, Plus } from 'lucide-react'

const fmtPKR = (n) => `PKR ${Math.round(n).toLocaleString()}`

// No pagination: the list is already bounded by the selected date range, and a
// month of expenses is a handful of rows (unlike the unbounded Customers list).
export default function ExpenseList({ expenses, description, onAdd, onEdit, onDelete }) {
  return (
    <Card size="sm" className="lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">No expenses in this period.</p>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="mr-1.5 h-4 w-4" /> Add an expense
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: e.category_color }}
                  title={e.category_label}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.category_label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(e.spent_at)} · {formatTime(e.spent_at)}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtPKR(e.amount)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(e)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(e)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
