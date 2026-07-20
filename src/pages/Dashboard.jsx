import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/context/AppContext.jsx'
import { getBookingsInRange, getBookingsWithBalance, updateBooking } from '@/db.js'
import {
  formatDate, getBusinessDayBounds, businessDayKey, todayBusinessDay,
} from '@/utils.js'
import { getPeriodRange, periodLabel as resolvePeriodLabel, periodDayCount } from '@/lib/period.js'
import { computeStats, dailySeries, hourHistogram, statusBreakdown } from '@/lib/stats.js'
import DateRangeFilter from '@/components/DateRangeFilter.jsx'
import StatCard from '@/components/dashboard/StatCard.jsx'
import BookingsList from '@/components/dashboard/BookingsList.jsx'
import PaymentsDue from '@/components/dashboard/PaymentsDue.jsx'
import { DailyTrendChart, PeakHoursChart, StatusDonutChart } from '@/components/dashboard/Charts.jsx'
import { Button } from '@/components/ui/button'
import {
  CalendarCheck, Clock, Banknote, Wallet, Loader2, Plus, RefreshCw,
} from 'lucide-react'

const fmtPKR = (n) => `PKR ${Math.round(n).toLocaleString()}`

export default function Dashboard({ onAdd, onEdit, refreshKey }) {
  const { statuses } = useApp()
  const [period, setPeriod] = useState('week')
  const [customFrom, setCustomFrom] = useState(todayBusinessDay())
  const [customTo, setCustomTo] = useState(todayBusinessDay())
  const [periodBookings, setPeriodBookings] = useState([])
  const [todayBookings, setTodayBookings] = useState([])
  const [dueBookings, setDueBookings] = useState([])
  const [loading, setLoading] = useState(true)

  const today = todayBusinessDay()
  const { startDay, endDay } = getPeriodRange(period, customFrom, customTo)

  const load = useCallback(async () => {
    const todayBounds = getBusinessDayBounds(todayBusinessDay())
    const [p, t, due] = await Promise.all([
      getBookingsInRange(getBusinessDayBounds(startDay).start, getBusinessDayBounds(endDay).end),
      getBookingsInRange(todayBounds.start, todayBounds.end),
      getBookingsWithBalance(),
    ])
    setPeriodBookings(p)
    setTodayBookings(t)
    setDueBookings(due)
    setLoading(false)
  }, [startDay, endDay])

  useEffect(() => { load() }, [load, refreshKey])

  const handleStatusChange = async (id, statusId) => {
    await updateBooking(id, { status: statusId })
    load()
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )

  // All statuses count toward the KPIs — status availability governs slot
  // conflicts, not money (e.g. "Completed" is typically set to 'ignore'), so
  // it can't be used to exclude cancelled-like bookings.
  const stats = computeStats(periodBookings)
  const periodSorted = [...periodBookings].sort((a, b) => a.date_start.localeCompare(b.date_start))
  const todays = todayBookings
    .filter((b) => businessDayKey(b.date_start) === today)
    .sort((a, b) => a.date_start.localeCompare(b.date_start))

  const periodDays = periodDayCount(startDay, endDay)
  const periodLabel = resolvePeriodLabel(period, startDay, endDay)

  return (
    <div className="space-y-6">

      {/* Page title + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of bookings, revenue and payments.</p>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-2 sm:ml-auto">
          <DateRangeFilter
            period={period}
            onPeriodChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
          />
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => onAdd({ date_start: `${today}T08:00` })}>
            <Plus className="h-4 w-4" />
            New booking
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={CalendarCheck}
          label={`Bookings · ${periodLabel}`}
          value={stats.count}
        />
        <StatCard
          icon={Clock}
          label="Hours booked"
          value={`${Math.round(stats.hours * 10) / 10}h`}
          sub={periodDays > 1 ? `${(stats.hours / periodDays).toFixed(1)}h / day avg` : null}
        />
        <StatCard
          icon={Banknote}
          label="Revenue"
          value={fmtPKR(stats.revenue)}
          sub={stats.fromAdvances > 0 ? `incl. ${fmtPKR(stats.fromAdvances)} advances` : null}
        />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={fmtPKR(stats.outstanding)}
          sub="to collect this period"
        />
      </div>

      {/* Bookings in the selected period + today's bookings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <BookingsList
          title="Bookings"
          description={`${periodLabel} · ${periodBookings.length} booking${periodBookings.length !== 1 ? 's' : ''}`}
          bookings={periodSorted}
          statuses={statuses}
          onEdit={onEdit}
          onStatusChange={handleStatusChange}
          showDate
          className="lg:col-span-2"
          emptyMessage="No bookings in this period."
        />
        <BookingsList
          title="Today's bookings"
          description={`${formatDate(today + 'T12:00:00')} · 5 AM – 5 AM`}
          bookings={todays}
          statuses={statuses}
          onEdit={onEdit}
          onStatusChange={handleStatusChange}
          onAdd={() => onAdd({ date_start: `${today}T08:00` })}
          compact
          emptyMessage="No bookings today."
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DailyTrendChart data={dailySeries(periodBookings, startDay, endDay)} periodLabel={periodLabel} />
        <StatusDonutChart data={statusBreakdown(periodBookings)} periodLabel={periodLabel} />
        <PeakHoursChart data={hourHistogram(periodBookings)} periodLabel={periodLabel} />
      </div>

      {/* Outstanding payments */}
      <PaymentsDue bookings={dueBookings} onEdit={onEdit} />
    </div>
  )
}
