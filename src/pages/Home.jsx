import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/context/AppContext.jsx'
import { getBookingsByDay, updateBooking, deleteBooking, getBookingById } from '@/db.js'
import { formatDate, formatTime, calcDuration, addDays, formatDateInput } from '@/utils.js'
import StatusBadge from '@/components/StatusBadge.jsx'
import CalendarView from '@/components/CalendarView.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ChevronLeft, ChevronRight, Plus, MoreHorizontal,
  Pencil, Trash2, CalendarDays, ArrowUpDown, LayoutList, CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Home({ onAdd, onEdit, refreshKey }) {
  const { statuses, refreshPending } = useApp()
  const [view, setView] = useState('table')
  const [date, setDate] = useState(formatDateInput(new Date()))
  const [bookings, setBookings] = useState([])
  const [nameFilter, setNameFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortCol, setSortCol] = useState('date_start')
  const [sortDir, setSortDir] = useState('asc')
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(async () => {
    setBookings(await getBookingsByDay(date))
  }, [date])

  useEffect(() => { load() }, [load, refreshKey])

  const handleStatusChange = async (id, statusId) => {
    const old = await getBookingById(id)
    await updateBooking(id, { status: statusId }, old)
    await refreshPending()
    load()
  }

  const handleDelete = async () => {
    const old = await getBookingById(toDelete.id)
    await deleteBooking(toDelete.id, old)
    await refreshPending()
    load()
    setToDelete(null)
  }

  const toggleSort = (col) => {
    setSortDir((d) => (sortCol === col && d === 'asc' ? 'desc' : 'asc'))
    setSortCol(col)
  }

  const rows = bookings
    .filter((b) => {
      if (nameFilter && !b.customer_name.toLowerCase().includes(nameFilter.toLowerCase())) return false
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      return true
    })
    .sort((a, b) => {
      const av = sortCol === 'status' ? (a.status_label ?? '') : (a[sortCol] ?? '')
      const bv = sortCol === 'status' ? (b.status_label ?? '') : (b[sortCol] ?? '')
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })

  const SortableHead = ({ col, children, className }) => (
    <TableHead
      className={cn('cursor-pointer select-none whitespace-nowrap', className)}
      onClick={() => toggleSort(col)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn(
          'h-3.5 w-3.5 shrink-0',
          sortCol === col ? 'text-foreground' : 'text-muted-foreground/30'
        )} />
      </div>
    </TableHead>
  )

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">View and manage daily cricket ground bookings.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* View toggle */}
        <div className="flex items-center rounded-md border self-start">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-9 rounded-r-none border-r gap-1.5', view === 'table' && 'bg-accent text-accent-foreground')}
            onClick={() => setView('table')}
          >
            <LayoutList className="h-4 w-4" /> Table
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-9 rounded-l-none gap-1.5', view === 'calendar' && 'bg-accent text-accent-foreground')}
            onClick={() => setView('calendar')}
          >
            <CalendarRange className="h-4 w-4" /> Calendar
          </Button>
        </div>

        {/* Date navigator — table view only */}
        {view === 'table' && (
          <>
            <div className="flex items-center rounded-md border self-start">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-r-none border-r"
                onClick={() => setDate((d) => addDays(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 px-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-sm font-medium outline-none w-[130px]"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none border-l"
                onClick={() => setDate((d) => addDays(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <span className="hidden text-sm text-muted-foreground md:block">
              {formatDate(date + 'T12:00:00')}
            </span>
          </>
        )}

        {/* Filters + add */}
        <div className="flex flex-col gap-2 sm:flex-row sm:ml-auto">
          {view === 'table' && (
            <>
              <Input
                placeholder="Search by name…"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                className="h-9 sm:w-44"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Button size="sm" className="h-9 gap-1.5" onClick={() => onAdd()}>
            <Plus className="h-4 w-4" />
            New booking
          </Button>
        </div>
      </div>

      {/* Calendar view */}
      {view === 'calendar' && (
        <CalendarView onEdit={onEdit} onAdd={onAdd} refreshKey={refreshKey} />
      )}

      {/* Table — horizontally scrollable on mobile */}
      {view === 'table' && <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <SortableHead col="customer_name" className="min-w-[140px]">Customer</SortableHead>
                <TableHead className="min-w-[120px]">Phone</TableHead>
                <SortableHead col="date_start" className="min-w-[90px]">Start</SortableHead>
                <SortableHead col="date_end" className="min-w-[80px]">End</SortableHead>
                <TableHead className="min-w-[80px]">Duration</TableHead>
                <SortableHead col="status" className="min-w-[130px]">Status</SortableHead>
                <TableHead className="min-w-[110px]">Advance</TableHead>
                <TableHead className="min-w-[140px]">Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        {bookings.length === 0
                          ? 'No bookings for this day.'
                          : 'No bookings match your filters.'}
                      </p>
                      {bookings.length === 0 && (
                        <Button variant="outline" size="sm" onClick={() => onAdd()}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add first booking
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.map((b, i) => (
                <TableRow key={b.id}>
                  <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{b.customer_name}</TableCell>
                  <TableCell>
                    {b.phone ? (
                      <a
                        href={`https://wa.me/${b.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {b.phone}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm whitespace-nowrap">{formatTime(b.date_start)}</TableCell>
                  <TableCell className="tabular-nums text-sm whitespace-nowrap">{formatTime(b.date_end)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{calcDuration(b.date_start, b.date_end)}</TableCell>
                  <TableCell>
                    <Select value={b.status} onValueChange={(v) => handleStatusChange(b.id, v)}>
                      <SelectTrigger className="h-auto w-auto border-none bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:hidden">
                        <StatusBadge label={b.status_label} color={b.status_color} />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                              {s.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm whitespace-nowrap">
                    {b.advance_paid > 0
                      ? `PKR ${Number(b.advance_paid).toLocaleString()}`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <p className="truncate text-sm text-muted-foreground" title={b.notes}>
                      {b.notes || '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(b.id)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setToDelete(b)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {rows.length > 0 && (
          <div className="border-t px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              {rows.length} booking{rows.length !== 1 ? 's' : ''} on {formatDate(date + 'T12:00:00')}
            </p>
          </div>
        )}
      </div>}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the booking for{' '}
              <strong>{toDelete?.customer_name}</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
