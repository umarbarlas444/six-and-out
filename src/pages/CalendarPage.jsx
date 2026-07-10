import { useState } from 'react'
import CalendarView from '@/components/CalendarView.jsx'
import { Button } from '@/components/ui/button'
import { todayBusinessDay } from '@/utils.js'
import { Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function CalendarPage({ onAdd, onEdit, refreshKey }) {
  const [calRefreshKey, setCalRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">View and manage cricket ground bookings.</p>
        </div>
        <div className="flex flex-row items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={refreshing}
            onClick={() => setCalRefreshKey((k) => k + 1)}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => onAdd({ date_start: `${todayBusinessDay()}T08:00` })}>
            <Plus className="h-4 w-4" />
            New booking
          </Button>
        </div>
      </div>

      <CalendarView
        onEdit={onEdit}
        onAdd={onAdd}
        refreshKey={refreshKey + calRefreshKey}
        onLoadingChange={setRefreshing}
      />
    </div>
  )
}
