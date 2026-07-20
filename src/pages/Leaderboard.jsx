import { useState, useEffect, useCallback, useMemo } from 'react'
import { getLeaderboardMonth } from '@/db.js'
import { rankMatches } from '@/lib/leaderboard.js'
import { todayBusinessDay } from '@/utils.js'
import { Button } from '@/components/ui/button'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import TeamSeriesModal from '@/components/TeamSeriesModal.jsx'
import Avatar from '@/components/Avatar.jsx'
import {
  ChevronLeft, ChevronRight, Loader2, Trophy, Crown,
  ChevronUp, ChevronDown, Minus, Users, Swords, Activity, Handshake,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const currentMonth = () => todayBusinessDay().slice(0, 7)

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const pct = (r) => `${Math.round(r * 100)}%`

// Count from 0 up to `target`; instant under prefers-reduced-motion.
function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setVal(target); return }
    let raf, start
    const step = (ts) => {
      start ??= ts
      const p = Math.min(1, (ts - start) / duration)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3)))) // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// Per-board presentation: the two tabs share one team set and differ only in
// sort + which metric is headlined.
const BOARDS = {
  series: {
    heroValue: (t) => t.seriesWon,
    heroUnit: 'Series won',
    heroSub: (t) => `${t.matchesWon} ${t.matchesWon === 1 ? 'match' : 'matches'} won${t.seriesDrawn > 0 ? ` · ${t.seriesDrawn} drawn` : ''}`,
    podiumSub: (t) => `${t.seriesWon} series`,
    barValue: (t) => t.seriesWon,
  },
  matches: {
    heroValue: (t) => t.points,
    heroUnit: 'Points',
    heroSub: (t) => `${t.matchesWon} of ${t.matchesPlayed} matches won · ${pct(t.winRate)}`,
    podiumSub: (t) => `${t.points} pts`,
    barValue: (t) => t.points,
  },
}

// Medal identity for the top three, shared by podium/table/hero.
const MEDAL = {
  1: {
    label: 'Gold', barH: 'h-28 sm:h-36', delay: '0.12s',
    grad: 'from-amber-300 to-amber-500', ring: 'ring-amber-400',
    text: 'text-amber-950', sub: 'text-amber-900/80',
    icon: 'text-amber-500', iconBg: 'bg-amber-500/15', rowWash: 'bg-amber-500/[0.07]',
  },
  2: {
    label: 'Silver', barH: 'h-20 sm:h-28', delay: '0s',
    grad: 'from-slate-200 to-slate-400', ring: 'ring-slate-300',
    text: 'text-slate-800', sub: 'text-slate-700/80',
    icon: 'text-slate-400', iconBg: 'bg-slate-400/20', rowWash: 'bg-slate-400/[0.06]',
  },
  3: {
    label: 'Bronze', barH: 'h-16 sm:h-20', delay: '0.24s',
    grad: 'from-[#e0a878] to-[#a86b3c]', ring: 'ring-[#c98a55]',
    text: 'text-white', sub: 'text-white/85',
    icon: 'text-[#a86b3c]', iconBg: 'bg-[#a86b3c]/15', rowWash: 'bg-[#a86b3c]/[0.06]',
  },
}

function MedalBadge({ rank }) {
  const m = MEDAL[rank]
  return (
    <span
      className={`lb-pop inline-flex h-7 w-7 items-center justify-center rounded-full ${m.iconBg}`}
      title={`${ordinal(rank)} place — ${m.label}`}
    >
      <Trophy className={`h-4 w-4 ${m.icon}`} aria-hidden="true" />
    </span>
  )
}

// Last-five series form, oldest→newest, as W/D/L chips.
const FORM = {
  won: { ch: 'W', cls: 'bg-emerald-600 text-white' },
  drew: { ch: 'D', cls: 'bg-slate-400 text-white dark:bg-slate-500' },
  lost: { ch: 'L', cls: 'bg-destructive text-white' },
}
function FormChips({ form }) {
  const last5 = form.slice(-5)
  if (last5.length === 0) return <span className="text-muted-foreground">—</span>
  const outcome = (r) => (r === 'won' ? 'Won' : r === 'drew' ? 'Draw' : 'Lost')
  return (
    // Oldest → newest, left to right. The last chip (newest) is ringed so the
    // direction of time is unambiguous.
    <span className="inline-flex gap-1">
      {last5.map((r, i) => {
        const f = FORM[r]
        const latest = i === last5.length - 1
        return (
          <span
            key={i}
            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${f.cls} ${latest ? 'ring-2 ring-foreground/50 ring-offset-1 ring-offset-card' : ''}`}
            title={latest ? `${outcome(r)} · latest` : outcome(r)}
          >
            {f.ch}
          </span>
        )
      })}
    </span>
  )
}

// Rank movement vs the same board's previous month.
function MovementPill({ prevRank, rank }) {
  if (prevRank == null) {
    return <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">New</span>
  }
  const d = prevRank - rank
  if (d > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        <ChevronUp className="h-3 w-3" />{d}
      </span>
    )
  }
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-destructive">
        <ChevronDown className="h-3 w-3" />{-d}
      </span>
    )
  }
  return <Minus className="h-3.5 w-3.5 text-muted-foreground/40" aria-label="no change" />
}

// ── Champion hero ─────────────────────────────────────────────────────────────

function ChampionHero({ champion, monthKey, board, onTeamClick }) {
  const cfg = BOARDS[board]
  const value = useCountUp(cfg.heroValue(champion))
  return (
    <section className="lb-rise relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-primary/20 sm:p-7">
      <div className="lb-sheen" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onTeamClick(champion)}
          className="flex items-center gap-4 rounded-xl text-left transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none motion-reduce:hover:scale-100"
          title={`View ${champion.name}'s series`}
        >
          <span className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-amber-300/40 blur-md" aria-hidden="true" />
            <Avatar
              name={champion.name}
              src={champion.avatar_url}
              className="relative h-16 w-16 text-xl ring-4 ring-amber-300/80 ring-offset-2 ring-offset-transparent sm:h-20 sm:w-20 sm:text-2xl"
            />
            <Crown className="absolute -top-3.5 left-1/2 h-6 w-6 -translate-x-1/2 fill-amber-300 text-amber-400 drop-shadow" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
              <Trophy className="h-3.5 w-3.5" /> Champion · {monthLabel(monthKey)}
            </span>
            <span className="mt-0.5 block truncate text-2xl font-bold tracking-tight sm:text-3xl" title={champion.name}>
              {champion.name}
            </span>
            <span className="mt-1 block text-sm text-white/80">{cfg.heroSub(champion)}</span>
          </span>
        </button>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-4xl font-bold leading-none tabular-nums sm:text-5xl">{value}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{cfg.heroUnit}</p>
        </div>
      </div>
    </section>
  )
}

// ── Podium ────────────────────────────────────────────────────────────────────

function PodiumSpot({ team, rank, board, onTeamClick }) {
  const s = MEDAL[rank]
  const cfg = BOARDS[board]
  return (
    <div className="flex w-[30%] max-w-32 flex-col items-center">
      <button
        type="button"
        onClick={() => onTeamClick(team)}
        className="flex w-full flex-col items-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
        title={`View ${team.name}'s series`}
      >
        <Avatar
          name={team.name}
          src={team.avatar_url}
          ringClass={s.ring}
          className={`lb-pop mb-2 ${rank === 1 ? 'h-12 w-12 text-base sm:h-14 sm:w-14' : 'h-10 w-10 text-sm'}`}
        />
        <span className="mb-1.5 max-w-full truncate text-xs font-medium" title={team.name}>{team.name}</span>
      </button>
      <div
        className={`lb-pedestal relative flex w-full flex-col items-center overflow-hidden rounded-t-xl bg-gradient-to-b px-1 pt-3 ${s.text} ${s.grad} ${s.barH}`}
        style={{ animationDelay: s.delay }}
      >
        {rank === 1 && <div className="lb-sheen" aria-hidden="true" />}
        <span className="relative text-lg font-bold leading-none sm:text-xl">{ordinal(rank)}</span>
        <span className={`relative mt-1 text-[11px] font-semibold tabular-nums ${s.sub}`}>{cfg.podiumSub(team)}</span>
      </div>
    </div>
  )
}

function Podium({ top, board, onTeamClick }) {
  const byRank = { 1: top[0], 2: top[1], 3: top[2] }
  const order = [2, 1, 3].filter((r) => byRank[r]) // 2 · 1 · 3 visual order
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3">
      {order.map((rank) => (
        <PodiumSpot key={rank} team={byRank[rank]} rank={rank} board={board} onTeamClick={onTeamClick} />
      ))}
    </div>
  )
}

// ── Month summary tiles ────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, accent, delay }) {
  const n = useCountUp(value)
  return (
    <div
      className="lb-rise group relative overflow-hidden rounded-xl border bg-background/40 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ animationDelay: delay }}
    >
      <div className={`pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-50 blur-2xl transition-opacity duration-300 group-hover:opacity-90 ${accent.blob}`} aria-hidden="true" />
      <div className="relative flex items-center justify-between">
        <span className="text-2xl font-semibold tabular-nums">{n}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none ${accent.bg} ${accent.text}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function StatTiles({ stats }) {
  const tiles = [
    { label: 'Teams', value: stats.teams, icon: Users, accent: { text: 'text-primary', bg: 'bg-primary/10', blob: 'bg-primary/25' } },
    { label: 'Series', value: stats.series, icon: Swords, accent: { text: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/10', blob: 'bg-amber-500/25' } },
    { label: 'Matches', value: stats.matches, icon: Activity, accent: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', blob: 'bg-emerald-500/25' } },
    { label: 'Draws', value: stats.draws, icon: Handshake, accent: { text: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/10', blob: 'bg-slate-500/20' } },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t, i) => (
        <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} delay={`${i * 0.05}s`} />
      ))}
    </div>
  )
}

// ── One board (hero + podium + stats + table) ──────────────────────────────────

const PAGE_SIZE = 10

function BoardPanel({ board, rows, prevRanks, stats, monthKey, page, setPage, onTeamClick }) {
  const cfg = BOARDS[board]
  const champion = rows[0]
  const maxValue = Math.max(1, cfg.barValue(champion))

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageStart = page * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <div className="space-y-6">
      <ChampionHero champion={champion} monthKey={monthKey} board={board} onTeamClick={onTeamClick} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="lb-rise flex flex-col justify-end rounded-2xl border bg-card p-5 shadow-sm" style={{ animationDelay: '0.05s' }}>
          <Podium top={rows.slice(0, 3)} board={board} onTeamClick={onTeamClick} />
          <p className="mt-5 border-t pt-4 text-center text-xs text-muted-foreground">
            Top three by {board === 'series' ? 'series won' : 'match points'}
          </p>
        </div>

        <div className="lb-rise flex flex-col rounded-2xl border bg-card p-5 shadow-sm" style={{ animationDelay: '0.1s' }}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{monthLabel(monthKey)} at a glance</h2>
            <span className="text-xs text-muted-foreground">2 pts / match won</span>
          </div>
          <StatTiles stats={stats} />
        </div>
      </div>

      <div className="lb-rise overflow-hidden rounded-2xl border bg-card shadow-sm" style={{ animationDelay: '0.15s' }}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28 pl-5">Place</TableHead>
                <TableHead>Team</TableHead>
                {board === 'series' ? (
                  <>
                    <TableHead className="whitespace-nowrap text-right">Played</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Won</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Drawn</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Lost</TableHead>
                    <TableHead className="whitespace-nowrap pr-5 text-right">Last&nbsp;5</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="whitespace-nowrap text-right">Played</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Won</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Lost</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Drawn</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Points</TableHead>
                    <TableHead className="whitespace-nowrap pr-5 text-right">Last&nbsp;5</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((t, i) => {
                const rank = pageStart + i + 1
                const medal = MEDAL[rank]
                const barPct = Math.max(4, (cfg.barValue(t) / maxValue) * 100)
                return (
                  <TableRow
                    key={t.customer_id}
                    className={`lb-rise transition-colors ${medal ? medal.rowWash : ''}`}
                    style={{ animationDelay: `${0.03 * i}s` }}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2">
                        {rank <= 3
                          ? <MedalBadge rank={rank} />
                          : <span className="inline-flex h-7 w-7 items-center justify-center text-sm font-medium tabular-nums text-muted-foreground">{rank}</span>}
                        <MovementPill prevRank={prevRanks[t.customer_id]} rank={rank} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onTeamClick(t)}
                        className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={`View ${t.name}'s series`}
                      >
                        <Avatar name={t.name} src={t.avatar_url} className="h-9 w-9 shrink-0 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium" title={t.name}>{t.name}</span>
                          <span className="mt-1 flex h-1.5 max-w-[200px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <span
                              className={`h-full rounded-full ${rank === 1 ? 'bg-amber-500' : 'bg-primary/70'}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    {board === 'series' ? (
                      <>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.seriesPlayed}</TableCell>
                        <TableCell className="text-right text-base font-semibold tabular-nums">{t.seriesWon}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.seriesDrawn}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.seriesLost}</TableCell>
                        <TableCell className="pr-5 text-right"><FormChips form={t.form} /></TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.matchesPlayed}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.matchesWon}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.matchesLost}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{t.matchesDrawn}</TableCell>
                        <TableCell className="text-right text-base font-semibold tabular-nums">{t.points}</TableCell>
                        <TableCell className="pr-5 text-right"><FormChips form={t.matchForm} /></TableCell>
                      </>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page + 1} of {totalPages} · {rows.length} {rows.length === 1 ? 'team' : 'teams'}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Leaderboard({ refreshKey, onEditBooking }) {
  const [month, setMonth] = useState(currentMonth)
  const [board, setBoard] = useState('series')
  const [rows, setRows] = useState([])            // series-ranked (reducer default)
  const [prevRows, setPrevRows] = useState([])
  const [stats, setStats] = useState({ teams: 0, series: 0, matches: 0, draws: 0 })
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openTeam, setOpenTeam] = useState(null)

  // Month or tab change restarts paging.
  useEffect(() => { setPage(0) }, [month, board])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    Promise.all([getLeaderboardMonth(month), getLeaderboardMonth(shiftMonth(month, -1))])
      .then(([cur, prev]) => {
        setRows(cur.teams)
        setStats(cur.stats)
        setPrevRows(prev.teams)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => { load() }, [load, refreshKey])

  // Same team set, two sorts. Movement compares against the SAME board's prior
  // month, so each pill means what its own board means.
  const seriesRows = rows
  const matchesRows = useMemo(() => rankMatches(rows), [rows])
  const prevSeriesRanks = useMemo(() => rankToMap(prevRows), [prevRows])
  const prevMatchesRanks = useMemo(() => rankToMap(rankMatches(prevRows)), [prevRows])

  const isCurrent = month === currentMonth()

  const panel = board === 'series'
    ? { rows: seriesRows, prevRanks: prevSeriesRanks }
    : { rows: matchesRows, prevRanks: prevMatchesRanks }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Team standings for {monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums">{monthLabel(month)}</span>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={isCurrent} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <Trophy className="h-7 w-7 text-amber-500/70" />
          </div>
          <p className="text-sm font-medium">No series recorded in {monthLabel(month)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Log match results on a booking and teams will climb the board here.</p>
        </div>
      ) : (
        <Tabs value={board} onValueChange={setBoard}>
          {/* h-13/h-11 keeps the triggers a ≥44px tap target on mobile, trimming
              to a tidier size from sm up. */}
          <TabsList className="h-13 sm:h-11">
            <TabsTrigger value="series" className="h-11 gap-1.5 px-4 sm:h-9">
              <Trophy className="h-4 w-4" /> Series
            </TabsTrigger>
            <TabsTrigger value="matches" className="h-11 gap-1.5 px-4 sm:h-9">
              <Activity className="h-4 w-4" /> Matches
            </TabsTrigger>
          </TabsList>

          {/* Both tabs render the same panel with a different ranking. */}
          <TabsContent value={board} className="mt-6">
            <BoardPanel
              board={board}
              rows={panel.rows}
              prevRanks={panel.prevRanks}
              stats={stats}
              monthKey={month}
              page={page}
              setPage={setPage}
              onTeamClick={setOpenTeam}
            />
          </TabsContent>
        </Tabs>
      )}

      {openTeam && (
        <TeamSeriesModal
          team={openTeam}
          monthKey={month}
          onClose={() => setOpenTeam(null)}
          onEditBooking={onEditBooking}
        />
      )}
    </div>
  )
}

// [{team}] in rank order -> { customer_id: rank }
function rankToMap(ranked) {
  const m = {}
  ranked.forEach((t, i) => { m[t.customer_id] = i + 1 })
  return m
}
