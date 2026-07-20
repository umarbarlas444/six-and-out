import { useState, useEffect, useCallback } from 'react'
import {
  getBookingsInRange, getExpensesInRange, getExpenseCategories, deleteExpense,
} from '@/db.js'
import { getBusinessDayBounds, todayBusinessDay } from '@/utils.js'
import { getPeriodRange, periodLabel as resolvePeriodLabel } from '@/lib/period.js'
import { computeStats, dailySeries } from '@/lib/stats.js'
import {
  computeExpenseStats, categoryBreakdown, dailyExpenseSeries, mergeIncomeExpenseSeries,
} from '@/lib/expenseStats.js'
import DateRangeFilter from '@/components/DateRangeFilter.jsx'
import StatCard from '@/components/dashboard/StatCard.jsx'
import ExpenseList from '@/components/expenses/ExpenseList.jsx'
import ExpenseFormModal from '@/components/expenses/ExpenseFormModal.jsx'
import { IncomeExpenseTrendChart, CategoryDonutChart } from '@/components/expenses/ExpenseCharts.jsx'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Banknote, Receipt, TrendingUp, Wallet, Loader2, Plus, RefreshCw,
} from 'lucide-react'

const fmtPKR = (n) => `PKR ${Math.round(n).toLocaleString()}`

export default function Expenses({ refreshKey }) {
  // Defaults to the current week, matching the Dashboard.
  const [period, setPeriod] = useState('week')
  const [customFrom, setCustomFrom] = useState(todayBusinessDay())
  const [customTo, setCustomTo] = useState(todayBusinessDay())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [bookings, setBookings] = useState([])
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)        // null | 'new' | expenseObj
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { startDay, endDay } = getPeriodRange(period, customFrom, customTo)

  const load = useCallback(async () => {
    const start = getBusinessDayBounds(startDay).start
    const end = getBusinessDayBounds(endDay).end
    const [b, e, c] = await Promise.all([
      getBookingsInRange(start, end),
      getExpensesInRange(start, end),
      getExpenseCategories(),
    ])
    setBookings(b)
    setExpenses(e)
    setCategories(c)
    setLoading(false)
  }, [startDay, endDay])

  useEffect(() => { load() }, [load, refreshKey])

  const remove = async () => {
    await deleteExpense(deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )

  // Income uses the exact same definition the dashboard shows — one revenue
  // number app-wide (Completed booking = full total, otherwise advance only).
  const income = computeStats(bookings)

  // The category filter narrows the list, cards and donut together, so the Net
  // figure always matches the rows on screen rather than silently including
  // categories that are filtered out.
  const visibleExpenses = categoryFilter === 'all'
    ? expenses
    : expenses.filter((e) => e.category_id === categoryFilter)

  const expenseStats = computeExpenseStats(visibleExpenses)
  const net = income.revenue - expenseStats.total

  const periodLabel = resolvePeriodLabel(period, startDay, endDay)

  const trendData = mergeIncomeExpenseSeries(
    dailySeries(bookings, startDay, endDay),
    dailyExpenseSeries(visibleExpenses, startDay, endDay),
  )

  const filterLabel = categoryFilter === 'all'
    ? null
    : categories.find((c) => c.id === categoryFilter)?.label

  return (
    <div className="space-y-6">

      {/* Page title + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">Money out, and what's left after it.</p>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2 sm:ml-auto">
          <DateRangeFilter
            period={period}
            onPeriodChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
          />

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
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

          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setModal('new')}>
            <Plus className="h-4 w-4" />
            Add expense
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          label={`Income · ${periodLabel}`}
          value={fmtPKR(income.revenue)}
          sub={`${income.count} booking${income.count !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={Receipt}
          label={filterLabel ? `Expenses · ${filterLabel}` : 'Expenses'}
          value={fmtPKR(expenseStats.total)}
          sub={`${expenseStats.count} entr${expenseStats.count !== 1 ? 'ies' : 'y'}`}
        />
        <StatCard
          icon={TrendingUp}
          label="Revenue after expenses"
          value={fmtPKR(net)}
          sub={net < 0 ? 'running at a loss' : 'net for this period'}
        />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={fmtPKR(income.outstanding)}
          sub="not yet collected"
        />
      </div>

      {/* List + category breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ExpenseList
          expenses={visibleExpenses}
          description={`${periodLabel}${filterLabel ? ` · ${filterLabel}` : ''} · ${visibleExpenses.length} entr${visibleExpenses.length !== 1 ? 'ies' : 'y'}`}
          onAdd={() => setModal('new')}
          onEdit={(e) => setModal(e)}
          onDelete={setDeleteTarget}
        />
        <CategoryDonutChart data={categoryBreakdown(visibleExpenses)} periodLabel={periodLabel} />
      </div>

      {/* Trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IncomeExpenseTrendChart data={trendData} periodLabel={periodLabel} />
      </div>

      {modal && (
        <ExpenseFormModal
          expense={modal === 'new' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {deleteTarget && fmtPKR(deleteTarget.amount)} {deleteTarget?.category_label}{' '}
              entry from your totals. It is soft-deleted and can be recovered from the database if needed.
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
