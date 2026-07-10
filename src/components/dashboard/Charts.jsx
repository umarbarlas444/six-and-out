import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDate } from '@/utils.js'

const COUNT_COLOR = '#0ea5e9'   // sky-500
const REVENUE_COLOR = '#10b981' // emerald-500

const tooltipStyle = {
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  fontSize: '12px',
}

const fmtPKR = (n) => `PKR ${Number(n).toLocaleString()}`

function EmptyChart({ message }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

// Bookings per day (bars) with revenue overlaid (line) over the selected period.
export function DailyTrendChart({ data, periodLabel }) {
  const hasData = data.some((d) => d.count > 0)
  return (
    <Card size="sm" className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Bookings &amp; revenue</CardTitle>
        <CardDescription>{periodLabel} · grouped by business day</CardDescription>
      </CardHeader>
      <CardContent className="h-64 text-muted-foreground">
        {!hasData ? <EmptyChart message="No bookings in this period." /> : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis yAxisId="count" allowDecimals={false} width={28} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="revenue" orientation="right" hide />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) => formatDate(d + 'T12:00:00')}
                formatter={(value, name) => (name === 'Revenue' ? [fmtPKR(value), name] : [value, name])}
              />
              <Bar yAxisId="count" dataKey="count" name="Bookings" fill={COUNT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Line yAxisId="revenue" dataKey="revenue" name="Revenue" stroke={REVENUE_COLOR} strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// Which hours of the business day (5 AM → 4 AM) sell the most.
export function PeakHoursChart({ data, periodLabel }) {
  const hasData = data.some((d) => d.count > 0)
  return (
    <Card size="sm" className="lg:col-span-3">
      <CardHeader>
        <CardTitle>Peak hours</CardTitle>
        <CardDescription>Bookings touching each hour · {periodLabel} (5 AM → 4 AM)</CardDescription>
      </CardHeader>
      <CardContent className="h-52 text-muted-foreground">
        {!hasData ? <EmptyChart message="No bookings in this period." /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'currentColor' }} tickLine={false} axisLine={false} interval={1} />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Bookings']} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
              <Bar dataKey="count" fill={COUNT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// Donut of bookings by status for the selected period.
export function StatusDonutChart({ data, periodLabel }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Status breakdown</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-40"><EmptyChart message="No bookings in this period." /></div>
        ) : (
          <>
            <div className="relative h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="90%" strokeWidth={0} paddingAngle={2}>
                    {data.map((d) => <Cell key={d.label} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{total}</span>
                <span className="text-xs text-muted-foreground">bookings</span>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5">
              {data.map((d) => (
                <li key={d.label} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">{d.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
