import { useEffect, useRef, useCallback, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { getBookingsInRange } from '@/db.js'
import { BUSINESS_DAY_START_HOUR } from '@/utils.js'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'dayGridMonth', label: 'Month' },
  { key: 'timeGridWeek', label: 'Week' },
  { key: 'timeGrid3Day', label: '3 Days' },
  { key: 'timeGridDay', label: 'Day' },
]

// The business day runs from 5 AM (BUSINESS_DAY_START_HOUR) until 5 AM the next
// calendar day. A booking at e.g. Friday 1 AM belongs to Thursday's business day.
//
// Shift a booking that starts before the 5 AM cutoff back onto the previous
// calendar day (keeping its clock time) so day-grid/month view groups it under
// the correct business day. The same day-delta is applied to the end so events
// spanning the cutoff stay intact.
function toBusinessDay(startIso, endIso) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (start.getHours() < BUSINESS_DAY_START_HOUR) {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  }
  return { start, end }
}

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
      // Widen the query end so early-morning bookings (up to the 5 AM cutoff)
      // that belong to the last visible business day are still fetched.
      const queryEnd = new Date(info.end)
      queryEnd.setHours(queryEnd.getHours() + BUSINESS_DAY_START_HOUR)
      const bookings = await getBookingsInRange(info.start.toISOString(), queryEnd.toISOString())

      // Only month (day-grid) view needs the date shifted onto the business day.
      // Time-grid views place events at their real time and rely on the extended
      // slotMaxTime to render past-midnight bookings under the previous day.
      const isMonthView = calendarRef.current?.getApi().view.type === 'dayGridMonth'

      successCallback(
        bookings.map((b) => {
          const shifted = isMonthView ? toBusinessDay(b.date_start, b.date_end) : null
          const start = shifted ? shifted.start : b.date_start
          const end = shifted ? shifted.end : b.date_end
          return {
            id: b.id,
            title: b.customer_name,
            start,
            end,
            backgroundColor: b.status_color ?? '#6B7280',
            borderColor: 'transparent',
            textColor: '#ffffff',
            extendedProps: { booking: b, color: b.status_color ?? '#6B7280' },
          }
        })
      )
    } catch (err) {
      failureCallback(err)
    }
  }, [])

  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents()
  }, [refreshKey])

  const switchView = (view) => {
    const api = calendarRef.current?.getApi()
    api?.changeView(view)
    setActiveView(view)
    // Month vs time-grid views transform event dates differently (business-day
    // shift), so force a refetch to recompute events for the new view.
    api?.refetchEvents()
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
          slotMinTime="05:00:00"
          slotMaxTime="29:00:00"
          nextDayThreshold="05:00:00"
          events={fetchEvents}
          eventClick={({ event }) => onEdit(event.id)}
          dateClick={({ date, view }) => {
            if (view.type === 'dayGridMonth' || view.type === 'timeGridWeek') {
              const api = calendarRef.current?.getApi()
              api?.changeView('timeGridDay', date)
              setActiveView('timeGridDay')
              api?.refetchEvents()
            } else {
              // Build from local parts — toISOString() would convert to UTC and
              // shift the day/hour, which is especially wrong for post-midnight slots.
              const pad = (n) => n.toString().padStart(2, '0')
              const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
              const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`
              onAdd({ date_start: `${dateStr}T${timeStr}`, date_end: `${dateStr}T${timeStr}` })
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
