// Public leaderboard JSON for the Six & Out Arena landing page.
//
// GET /leaderboard[?month=YYYY-MM]  ->  { month, series: [...], matches: [...] }
//
// Two boards over the same team set, matching the app's Series/Matches tabs:
//   series  — ranked by seriesWon, then matchesWon, then name
//   matches — ranked by points (2/win), then winRate, then name
//
// Serves the SAME rankings the in-app Leaderboard screen shows, but publicly
// (CORS-open) so the marketing site can fetch it without the anon key. The
// aggregation below is a straight port of src/lib/leaderboard.js and the
// business-day helpers in src/utils.js — keep the two in sync so the public
// board never disagrees with the app.
//
// Business day: the ground's day runs 05:00–05:00 in the operator's local
// timezone (Asia/Karachi, UTC+5, no DST). The app computes this from the
// browser's local time; here we pin Asia/Karachi so the month buckets match.
//
// Deploy: `supabase functions deploy leaderboard` (not part of the SPA CI in
// .github/workflows/deploy.yml — deploy it out-of-band). Public URL:
// https://<project-ref>.functions.supabase.co/leaderboard

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUSINESS_DAY_START_HOUR = 5
const TZ = 'Asia/Karachi'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 'YYYY-MM-DD' business day for a UTC ISO timestamp, evaluated in TZ. A time
// before 05:00 belongs to the previous calendar day.
function businessDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value])) as Record<string, string>
  let hour = parseInt(p.hour, 10)
  if (hour === 24) hour = 0 // some runtimes render midnight as '24'
  let y = +p.year, mo = +p.month, d = +p.day
  if (hour < BUSINESS_DAY_START_HOUR) {
    const dt = new Date(Date.UTC(y, mo - 1, d))
    dt.setUTCDate(dt.getUTCDate() - 1)
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate()
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

// Series outcome from one team's win tally (drawn matches ignored here). Only
// called for a booking with ≥1 match, so equal wins is always a drawn series —
// including 0–0 (every match drawn).
function seriesOutcome(myWins: number, oppWins: number): 'won' | 'lost' | 'drew' {
  if (myWins > oppWins) return 'won'
  if (myWins < oppWins) return 'lost'
  return 'drew'
}

interface Booking {
  id: string
  customer_id: string | null
  customer_name: string | null
  customer_id_2: string | null
  customer_name_2: string | null
}
interface Match { booking_id: string; winner: string | null }

// Mirror of computeLeaderboard() in src/lib/leaderboard.js.
function computeLeaderboard(bookings: Booking[], matchesByBooking: Record<string, Match[]>) {
  const teams = new Map<string, any>()
  const team = (id: string, name: string | null) => {
    let t = teams.get(id)
    if (!t) {
      t = {
        customer_id: id, name: name || 'Unknown',
        seriesWon: 0, seriesDrawn: 0, seriesLost: 0, seriesPlayed: 0,
        matchesWon: 0, matchesDrawn: 0, matchesLost: 0, matchesPlayed: 0,
        points: 0, winRate: 0, form: [] as string[], matchForm: [] as string[],
      }
      teams.set(id, t)
    } else if (!t.name && name) t.name = name
    return t
  }

  for (const b of bookings) {
    const matches = matchesByBooking[b.id] ?? []
    if (matches.length === 0) continue
    // winner is a customer id (or null = draw); draws counted first so a null
    // winner isn't mistaken for a win by an unlinked (null-id) team.
    const id1 = b.customer_id, id2 = b.customer_id_2
    let t1 = 0, t2 = 0, draws = 0
    for (const m of matches) {
      if (m.winner == null) draws++
      else if (m.winner === id1) t1++
      else if (m.winner === id2) t2++
    }
    const slots = [
      { id: id1, name: b.customer_name, wins: t1, oppWins: t2 },
      { id: id2, name: b.customer_name_2, wins: t2, oppWins: t1 },
    ]
    for (const s of slots) {
      if (!s.id) continue
      const t = team(s.id, s.name)
      t.matchesWon += s.wins
      t.matchesDrawn += draws
      t.matchesLost += s.oppWins
      t.matchesPlayed += s.wins + s.oppWins + draws
      t.points += s.wins * 2
      for (const m of matches) {
        t.matchForm.push(m.winner == null ? 'drew' : m.winner === s.id ? 'won' : 'lost')
      }
      const outcome = seriesOutcome(s.wins, s.oppWins)
      t.seriesPlayed += 1
      t.form.push(outcome)
      if (outcome === 'won') t.seriesWon += 1
      else if (outcome === 'drew') t.seriesDrawn += 1
      else t.seriesLost += 1
    }
  }

  const rows = [...teams.values()]
  for (const t of rows) t.winRate = t.matchesPlayed > 0 ? t.matchesWon / t.matchesPlayed : 0
  return rows
}

// Two boards over the same team set — mirrors rankSeries/rankMatches in
// src/lib/leaderboard.js. Keep both in sync or the public JSON drifts from the app.
function rankSeries(rows: any[]) {
  return [...rows].sort((a, b) =>
    b.seriesWon - a.seriesWon || b.matchesWon - a.matchesWon || a.name.localeCompare(b.name)
  )
}

function rankMatches(rows: any[]) {
  return [...rows].sort((a, b) =>
    b.points - a.points || b.winRate - a.winRate || a.name.localeCompare(b.name)
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = new URL(req.url)
    const monthParam = url.searchParams.get('month')
    const month = /^\d{4}-\d{2}$/.test(monthParam ?? '')
      ? monthParam!
      : businessDayKey(new Date().toISOString()).slice(0, 7)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    // Pad a day each side of the business-month so pre-05:00 bookings that
    // shift across the boundary are still fetched, then filter precisely.
    const monthStart = new Date(`${month}-01T00:00:00+05:00`)
    const monthEnd = new Date(`${shiftMonth(month, 1)}-01T00:00:00+05:00`)
    const padStart = new Date(monthStart.getTime() - 864e5).toISOString()
    const padEnd = new Date(monthEnd.getTime() + 864e5).toISOString()

    const { data: rawBookings, error: bErr } = await supabase
      .from('bookings')
      .select('id, customer_id, customer_name, customer_id_2, customer_name_2, date_start')
      .is('deleted_at', null)
      .gte('date_start', padStart)
      .lt('date_start', padEnd)
    if (bErr) throw bErr

    const bookings = (rawBookings ?? []).filter(
      (b: any) => businessDayKey(b.date_start).slice(0, 7) === month,
    )

    const ids = bookings.map((b: any) => b.id)
    let matchesByBooking: Record<string, Match[]> = {}
    if (ids.length > 0) {
      const { data: matches, error: mErr } = await supabase
        .from('booking_matches')
        .select('booking_id, winner')
        .in('booking_id', ids)
      if (mErr) throw mErr
      for (const m of matches ?? []) (matchesByBooking[m.booking_id] ??= []).push(m as Match)
    }

    const rows = computeLeaderboard(bookings as Booking[], matchesByBooking)

    return new Response(JSON.stringify({
      month,
      series: rankSeries(rows),
      matches: rankMatches(rows),
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
