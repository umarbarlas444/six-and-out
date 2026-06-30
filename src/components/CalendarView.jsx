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
  { key: 'timeGrid3Day', label: '3 Days' },
  { key: 'timeGridDay', label: 'Day' },
]

function EventPill({ info }) {
  const { event } = info
  const color = event.extendedProps.color
  const isAllDay = event.allDay
  return (
    <div
      className="w-full overflow-hidden whitespace-nowrap rounded px-1 py-0 text-[10px] font-medium text-white leading-snug cursor-pointer"
      style={{ backgroundColor: color }}
      title={event.title}
    >
      {!isAllDay && info.timeText && (
        <span className="opacity-75 mr-0.5">{info.timeText}</span>
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
          extendedProps: { booking: b, color: b.status_color ?? '#6B7280' },
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
    <div className="fc-wrapper -mx-4 sm:mx-0 rounded-none sm:rounded-lg border-x-0 sm:border-x border-y bg-card overflow-hidden">
      {/* Custom toolbar */}
      <div className="border-b">
        {/* Row 1: view switcher + today */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            Today
          </Button>
        </div>

        {/* Row 2: prev | title | next */}
        <div className="flex items-center justify-between px-2 pb-2">
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
            className="text-sm font-semibold text-center"
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
      </div>

      <div className="p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          views={{ timeGrid3Day: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 Days' } }}
          events={fetchEvents}
          eventClick={({ event }) => onEdit(event.id)}
          dateClick={({ date, view }) => {
            if (view.type === 'dayGridMonth' || view.type === 'timeGridWeek') {
              calendarRef.current?.getApi().changeView('timeGridDay', date)
              setActiveView('timeGridDay')
            } else {
              const dateStr = date.toISOString().slice(0, 10)
              const hour = date.getHours().toString().padStart(2, '0')
              const min = date.getMinutes().toString().padStart(2, '0')
              onAdd({ date_start: `${dateStr}T${hour}:${min}`, date_end: `${dateStr}T${hour}:${min}` })
            }
          }}
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
