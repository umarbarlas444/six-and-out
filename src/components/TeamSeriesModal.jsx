import { useState, useEffect, useCallback } from 'react'
import { getTeamSeries } from '@/db.js'
import { businessDayKey, formatTime } from '@/utils.js'
import { Button } from '@/components/ui/button'
import Avatar from '@/components/Avatar.jsx'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'

const PAGE_SIZE = 10

// 'YYYY-MM' -> 'July 2026'
function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// A series' date as the operator thinks of it: the BUSINESS day it belongs to
// (a 1 AM start counts as the previous day), rendered '17 JUL 2026'.
function seriesDate(iso) {
  const [y, m, d] = businessDayKey(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
}

// The shared avatar at this screen's crest sizing: initials here are smaller and
// bolder than the default because they sit inside 8-10px chips.
function Crest({ name, src, className = '' }) {
  return <Avatar name={name} src={src} className={`text-[10px] font-bold text-foreground/70 ${className}`} />
}

// Result drives the scoreboard's colour: the badge and the card's underline.
const RESULT = {
  won: { badge: 'bg-emerald-600', bar: 'border-b-emerald-600', chev: 'text-emerald-600/40' },
  lost: { badge: 'bg-destructive', bar: 'border-b-destructive', chev: 'text-destructive/40' },
  draw: { badge: 'bg-slate-500', bar: 'border-b-slate-500', chev: 'text-slate-500/40' },
}

// Pointed scoreboard badge, like a fixture graphic.
const HEX = { clipPath: 'polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)' }

/**
 * A team's series history, shown as fixture-style scoreboards. Opens
 * month-scoped (matching the board you clicked from) with an all-time toggle;
 * both scopes paginate. Clicking a scoreboard opens its booking to edit.
 */
export default function TeamSeriesModal({ team, monthKey, onClose, onEditBooking }) {
  const [scope, setScope] = useState('month') // 'month' | 'all'
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Changing scope restarts paging.
  useEffect(() => { setPage(0) }, [scope])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getTeamSeries(team.customer_id, {
      monthKey: scope === 'month' ? monthKey : null,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(({ rows, total }) => { setRows(rows); setTotal(total) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [team.customer_id, monthKey, scope, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* sm: prefix required — DialogContent's own sm:max-w-lg would otherwise win */}
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Crest name={team.name} src={team.avatar_url} className="h-10 w-10 text-sm" />
            <span className="min-w-0 truncate" title={team.name}>{team.name}</span>
          </DialogTitle>
          <DialogDescription>
            {scope === 'month'
              // Month aggregates come straight off the board row, so they always
              // reconcile with the row that was clicked.
              ? `${monthLabel(monthKey)} · ${team.seriesWon}W ${team.seriesDrawn}D ${team.seriesLost}L · ${team.matchesWon} ${team.matchesWon === 1 ? 'match' : 'matches'} won`
              : `All time · ${total} series`}
          </DialogDescription>
        </DialogHeader>

        {/* Scope toggle */}
        <div className="inline-flex w-fit items-center rounded-full bg-muted p-1">
          {[
            { key: 'month', label: monthLabel(monthKey) },
            { key: 'all', label: 'All time' },
          ].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              aria-pressed={scope === s.key}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === s.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scoreboards. min-w-0: DialogContent is a grid, whose items default to
            min-width:auto — without this the rows size to their content and
            spill past the dialog instead of truncating. */}
        <div className="min-h-[13rem] min-w-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No series {scope === 'month' ? `in ${monthLabel(monthKey)}` : 'recorded yet'}.
            </p>
          ) : (
            <ul className="space-y-4">
              {rows.map((r) => {
                const res = RESULT[r.result]
                return (
                  <li key={r.bookingId} className="space-y-1.5">
                    {/* date · time · drawn note — the fixture caption */}
                    <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {seriesDate(r.date)} · {formatTime(r.date)}
                      {r.drawn > 0 && ` · ${r.drawn} drawn`}
                    </p>

                    <button
                      type="button"
                      onClick={() => onEditBooking?.(r.bookingId)}
                      title="Open this booking"
                      className={`flex min-h-14 w-full items-center gap-1 rounded-lg border border-b-4 bg-card px-2 py-2 text-left transition-shadow hover:shadow-md motion-reduce:transition-none ${res.bar}`}
                    >
                      {/* this team — crest hidden on mobile to buy name width;
                          it's the same team on every row and already in the header */}
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Crest name={team.name} src={team.avatar_url} className="hidden h-8 w-8 sm:flex" />
                        <span className="min-w-0 truncate text-xs font-bold uppercase tracking-tight sm:text-sm" title={team.name}>
                          {team.name}
                        </span>
                      </span>

                      {/* score — banner-style, double chevrons pointing outward */}
                      <span className="flex shrink-0 items-center">
                        <ChevronsLeft className={`-mr-1.5 h-5 w-5 ${res.chev}`} aria-hidden="true" />
                        <span
                          className={`flex h-9 w-[4.75rem] items-center justify-center text-sm font-bold tabular-nums text-white sm:w-24 sm:text-base ${res.badge}`}
                          style={HEX}
                        >
                          {r.won} – {r.lost}
                        </span>
                        <ChevronsRight className={`-ml-1.5 h-5 w-5 ${res.chev}`} aria-hidden="true" />
                      </span>

                      {/* opponent */}
                      <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                        <span className="min-w-0 truncate text-right text-xs font-bold uppercase tracking-tight sm:text-sm" title={r.opponentName}>
                          {r.opponentName}
                        </span>
                        <Crest name={r.opponentName} src={r.opponentAvatarUrl} className="hidden h-8 w-8 sm:flex" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pager */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {page + 1} of {totalPages} · {total} series
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || loading}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
