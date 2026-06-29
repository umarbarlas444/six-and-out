import { useEffect, useRef, useCallback, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { getBookingsInRange } from '@/db.js'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'dayGridMonth', label: 'Month' },
  { key: 'timeGridWeek', label: 'Week' },
  { key: 'timeGridDay', label: 'Day' },
]

function EventPill({ info }) {
  const { event } = info
  const color = event.backgroundColor
  const isAllDay = event.allDay
  return (
    <div
      className="w-full truncate rounded-full px-2 py-0.5 text-xs font-medium text-white leading-tight cursor-pointer"
      style={{ backgroundColor: color }}
      title={event.title}
    >
      {!isAllDay && info.timeText && (
        <span className="opacity-80 mr-1">{info.timeText}</span>
      )}
      {event.title}
    </div>
  )
}

export default function CalendarView({ onEdit, onAdd, refreshKey }) {
  const calendarRef = useRef(null)
  const [activeView, setActiveView] = useState('dayGridMonth')

  const fetchEvents = useCallback(async (info, successCallback, failureCallback) => {
    try {
      const bookings = await getBookingsInRange(info.start.toISOString(), info.end.toISOString())
      successCallback(
        bookings.map((b) => ({
          id: b.id,
          title: b.customer_name,
          start: b.date_start,
          end: b.date_end,
          backgroundColor: b.status_color ?? '#6B7280',
          borderColor: 'transparent',
          textColor: '#ffffff',
          extendedProps: { booking: b },
        }))
      )
    } catch (err) {
      failureCallback(err)
    }
  }, [])

  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents()
  }, [refreshKey])

  const switchView = (view) => {
    calendarRef.current?.getApi().changeView(view)
    setActiveView(view)
  }

  return (
    <div className="fc-wrapper rounded-lg border bg-card overflow-hidden">
      {/* Custom toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        {/* View switcher */}
        <div className="flex items-center rounded-md border">
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 rounded-none text-xs px-3 first:rounded-l-md last:rounded-r-md',
                activeView === v.key && 'bg-accent text-accent-foreground'
              )}
              onClick={() => switchView(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>

        {/* Navigation — prev | title | next */}
        <div className="flex items-center gap-2 flex-1 justify-center min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => calendarRef.current?.getApi().prev()}
          >
            ‹
          </Button>
          <span
            id="fc-custom-title"
            className="text-sm font-semibold text-center truncate min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => calendarRef.current?.getApi().next()}
          >
            ›
          </Button>
        </div>

        {/* Today */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => calendarRef.current?.getApi().today()}
        >
          Today
        </Button>
      </div>

      <div className="p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          events={fetchEvents}
          eventClick={({ event }) => onEdit(event.id)}
          dateClick={({ dateStr }) => onAdd({ date_start: dateStr + 'T00:00', date_end: dateStr + 'T01:00' })}
          height="auto"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: true }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: true }}
          nowIndicator
          editable={false}
          selectable={false}
          eventContent={(info) => <EventPill info={info} />}
          datesSet={({ view }) => {
            setActiveView(view.type)
            const titleEl = document.getElementById('fc-custom-title')
            if (titleEl) titleEl.textContent = view.title
          }}
        />
      </div>
    </div>
  )
}
