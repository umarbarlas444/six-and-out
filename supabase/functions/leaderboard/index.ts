// Public leaderboard JSON for the Six & Out marketing site (6nout.com).
//
// GET /functions/v1/leaderboard
//   -> { updatedAt, currentMonth: { label, teams[] }, champions[] }
//
// Read-only, anonymous, cached. Replaces the previous {month, series, matches}
// payload outright — that shape is gone, and so is the ?month= param.
//
// Decisions baked in here (see docs/brain/ for the grilling that produced them):
//
//  * Teams ARE customer records. There is no `teams` table — the standalone one
//    was dropped in 20260715130000_drop_unused_team_columns.sql. A booking hosts
//    a SERIES between customer_id (team 1) and customer_id_2 (team 2), and each
//    row in booking_matches is one match, won by a customer id or NULL = draw.
//
//  * MATCH-level standings, not series-level. `points = won * 2` is only true at
//    match grain (it mirrors `t.points += s.wins * 2` in src/lib/leaderboard.js),
//    so this is the grain that keeps the public board from contradicting the
//    in-app one.
//
//  * DRAWN MATCHES ARE DROPPED ENTIRELY — not counted in `played`, absent from
//    `form`. The response shape has no vocabulary for a draw ("W"/"L" only), and
//    counting them in `played` would make played != won + lost, which reads as a
//    bug on the podium. Consequence: `played == won + lost` always, and the
//    public totals run lower than the in-app board, which does show draws.
//
//  * Ties break on winRate, NOT on `won`. The spec's stated tiebreak
//    (points, won, teamName) has a dead tier: points = won * 2, so equal points
//    implies equal wins and the `won` comparison can never fire — leaving the
//    alphabet to decide the gold medal. winRate matches rankMatches() in
//    src/lib/leaderboard.js.
//
//  * BUSINESS-DAY months, not calendar months. The ground's day runs 05:00–05:00
//    Asia/Karachi (BUSINESS_DAY_START_HOUR in src/utils.js), so a match at 1 AM
//    on the 1st belongs to the PREVIOUS month — it's a late-night session of the
//    previous evening. Bucketing by calendar month would make this endpoint
//    disagree with the operator's own dashboard/calendar/stats at every month
//    boundary.
//
//  * ANON key, not service role. bookings / booking_matches / customers are all
//    readable by anon under allow-all RLS, so the service role buys no access
//    while removing every policy backstop from an endpoint that runs with
//    verify_jwt = false (i.e. reachable by anyone). Least privilege.
//
// Deploy: `supabase functions deploy leaderboard` — NOT part of the SPA CI in
// .github/workflows/deploy.yml, deploy it out-of-band.
// Public URL: https://<project-ref>.supabase.co/functions/v1/leaderboard

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUSINESS_DAY_START_HOUR = 5
const TZ = 'Asia/Karachi'

// How far back `champions` reaches. Bounds the query — without it this scans
// every booking ever recorded on each cold request.
const CHAMPION_MONTHS = 12

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JSON_HEADERS = {
  ...CORS,
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One retry after a 10s pause, per the endpoint's error policy. Note this pins
// the worker for the full 10s on a failing request; it is deliberate, but it is
// also why CHAMPION_MONTHS keeps the query small and why stale-while-revalidate
// is set — clients keep serving the last good payload while the origin is sick.
async function withRetry<T>(label: string, run: () => Promise<{ data: T | null; error: unknown }>) {
  let { data, error } = await run()
  if (error) {
    console.error(`[leaderboard] ${label} failed, retrying in 10s:`, error)
    await sleep(10_000)
    ;({ data, error } = await run())
  }
  if (error) {
    console.error(`[leaderboard] ${label} failed after retry:`, error)
    throw new Error(`Failed to load leaderboard data (${label})`)
  }
  return data ?? ([] as unknown as T)
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

const monthKeyOf = (iso: string) => businessDayKey(iso).slice(0, 7)

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

// '2026-07' -> 'July 2026'. Rendered as-is by the site.
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

interface Booking {
  id: string
  customer_id: string | null
  customer_name: string | null
  customer_id_2: string | null
  customer_name_2: string | null
  date_start: string
}
interface MatchRow { booking_id: string; winner: string | null; match_number: number }

interface TeamRow {
  teamId: string
  teamName: string
  captain: string
  avatarUrl: string | null
  played: number
  won: number
  lost: number
  points: number
  winRate: number
  form: string[]
}

// Match-level standings for one month's bookings. Drawn matches (winner == null)
// are skipped outright — they touch neither the counters nor `form`.
function standingsFor(
  bookings: Booking[],
  matchesByBooking: Record<string, MatchRow[]>,
  avatars: Record<string, string>,
): TeamRow[] {
  const teams = new Map<string, TeamRow>()
  const team = (id: string, name: string | null) => {
    let t = teams.get(id)
    if (!t) {
      t = {
        teamId: id, teamName: name || 'Unknown', captain: '',
        avatarUrl: avatars[id] ?? null,
        played: 0, won: 0, lost: 0, points: 0, winRate: 0, form: [],
      }
      teams.set(id, t)
    } else if (t.teamName === 'Unknown' && name) t.teamName = name
    return t
  }

  // Oldest booking first so `form` accumulates oldest -> newest.
  const ordered = [...bookings].sort((a, b) => a.date_start.localeCompare(b.date_start))

  for (const b of ordered) {
    const matches = [...(matchesByBooking[b.id] ?? [])].sort((x, y) => x.match_number - y.match_number)
    if (matches.length === 0) continue

    for (const slot of [
      { id: b.customer_id, name: b.customer_name },
      { id: b.customer_id_2, name: b.customer_name_2 },
    ]) {
      if (!slot.id) continue
      const t = team(slot.id, slot.name)
      for (const m of matches) {
        if (m.winner == null) continue // draw — dropped entirely
        const won = m.winner === slot.id
        t.played += 1
        if (won) t.won += 1
        else t.lost += 1
        t.form.push(won ? 'W' : 'L')
      }
    }
  }

  const rows = [...teams.values()]
  for (const t of rows) {
    t.points = t.won * 2
    t.winRate = t.played > 0 ? t.won / t.played : 0
    t.form = t.form.slice(-5) // at most 5, oldest first, newest last
  }
  // Contract: index 0/1/2 are the gold/silver/bronze podium.
  return rows.sort((a, b) =>
    b.points - a.points || b.winRate - a.winRate || a.teamName.localeCompare(b.teamName)
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: 'GET, OPTIONS' },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const currentMonth = monthKeyOf(new Date().toISOString())
    const firstMonth = shiftMonth(currentMonth, -CHAMPION_MONTHS)

    // Pad a day each side so bookings that shift across a business-day boundary
    // are still fetched; the exact bucketing happens below via monthKeyOf().
    const windowStart = new Date(new Date(`${firstMonth}-01T00:00:00+05:00`).getTime() - 864e5).toISOString()
    const windowEnd = new Date(new Date(`${shiftMonth(currentMonth, 1)}-01T00:00:00+05:00`).getTime() + 864e5).toISOString()

    const bookings = await withRetry<Booking[]>('bookings', () => supabase
      .from('bookings')
      .select('id, customer_id, customer_name, customer_id_2, customer_name_2, date_start')
      .is('deleted_at', null)
      .gte('date_start', windowStart)
      .lt('date_start', windowEnd)
      .order('date_start') as any)

    const ids = bookings.map((b) => b.id)
    const matchesByBooking: Record<string, MatchRow[]> = {}
    if (ids.length > 0) {
      const matches = await withRetry<MatchRow[]>('booking_matches', () => supabase
        .from('booking_matches')
        .select('booking_id, winner, match_number')
        .in('booking_id', ids) as any)
      for (const m of matches) (matchesByBooking[m.booking_id] ??= []).push(m)
    }

    // Captain photos. avatar_url holds the PUBLIC URL of an object in the
    // `customer-images` bucket (a public bucket — see
    // 20260720120100_customer_images_bucket.sql), so it can be handed straight
    // to the site with no signing. Mirrors getCustomerAvatars() in src/db.js.
    // A stored URL can outlive its object if the bucket was cleaned up by hand,
    // so the client still needs an initials fallback on image error.
    const teamIds = [...new Set(
      bookings.flatMap((b) => [b.customer_id, b.customer_id_2]).filter((id): id is string => !!id),
    )]
    const avatars: Record<string, string> = {}
    if (teamIds.length > 0) {
      const rows = await withRetry<{ id: string; avatar_url: string }[]>('customer avatars', () => supabase
        .from('customers')
        .select('id, avatar_url')
        .in('id', teamIds)
        .not('avatar_url', 'is', null) as any)
      for (const r of rows) avatars[r.id] = r.avatar_url
    }

    // Bucket bookings into business months.
    const byMonth: Record<string, Booking[]> = {}
    for (const b of bookings) (byMonth[monthKeyOf(b.date_start)] ??= []).push(b)

    // updatedAt: business day of the most recent booking that actually has a
    // recorded match; today's business day if nothing has been played yet.
    const played = bookings.filter((b) => (matchesByBooking[b.id] ?? []).length > 0)
    const updatedAt = played.length > 0
      ? played.map((b) => businessDayKey(b.date_start)).sort().at(-1)!
      : businessDayKey(new Date().toISOString())

    // Past months, newest first, current month excluded. A month with no team
    // that played a decided match yields no champion and is skipped.
    const champions = Object.keys(byMonth)
      .filter((m) => m < currentMonth)
      .sort()
      .reverse()
      .map((m) => {
        const winner = standingsFor(byMonth[m], matchesByBooking, avatars)[0]
        if (!winner) return null
        return {
          month: monthLabel(m),
          teamName: winner.teamName,
          record: `${winner.won}-${winner.lost}`,
          avatarUrl: winner.avatarUrl,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    return new Response(JSON.stringify({
      updatedAt,
      currentMonth: {
        label: monthLabel(currentMonth),
        teams: standingsFor(byMonth[currentMonth] ?? [], matchesByBooking, avatars),
      },
      champions,
    }), { headers: JSON_HEADERS })
  } catch (e) {
    // Detail goes to the server log only — never the response body.
    console.error('[leaderboard] unhandled:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
    })
  }
})
