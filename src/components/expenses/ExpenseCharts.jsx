import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatDate } from '@/utils.js'

// Deliberately a local copy of the dashboard chart styling rather than an import
// from components/dashboard/Charts.jsx: those components are shaped around
// booking counts, and bending them to money would mean editing dashboard files.
const INCOME_COLOR = '#10b981'  // emerald-500
const EXPENSE_COLOR = '#f43f5e' // rose-500

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

// Income vs expenses per business day. The gap between the lines is the profit
// for that day — which is the whole point of showing them on one axis.
export function IncomeExpenseTrendChart({ data, periodLabel }) {
  const hasData = data.some((d) => d.income > 0 || d.expenses > 0)
  return (
    <Card size="sm" className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Income vs expenses</CardTitle>
        <CardDescription>{periodLabel} · grouped by business day</CardDescription>
      </CardHeader>
      <CardContent className="h-64 text-muted-foreground">
        {!hasData ? <EmptyChart message="Nothing recorded in this period." /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                width={44}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) => formatDate(d + 'T12:00:00')}
                formatter={(value, name) => [fmtPKR(value), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
              <Line dataKey="income" name="Income" stroke={INCOME_COLOR} strokeWidth={2} dot={false} type="monotone" />
              <Line dataKey="expenses" name="Expenses" stroke={EXPENSE_COLOR} strokeWidth={2} dot={false} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

// Donut of spending by category for the selected period.
export function CategoryDonutChart({ data, periodLabel }) {
  const total = data.reduce((s, d) => s + d.amount, 0)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Category breakdown</CardTitle>
        <CardDescription>{periodLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-40"><EmptyChart message="No expenses in this period." /></div>
        ) : (
          <>
            <div className="relative h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="amount" nameKey="label" innerRadius="62%" outerRadius="90%" strokeWidth={0} paddingAngle={2}>
                    {data.map((d) => <Cell key={d.label} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [fmtPKR(value), name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold tabular-nums">{fmtPKR(total)}</span>
                <span className="text-xs text-muted-foreground">spent</span>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5">
              {data.map((d) => (
                <li key={d.label} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtPKR(d.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
