// Monthly leaderboard aggregation.
//
// A booking hosts a SERIES between two teams — both are customer records:
// Team 1 = booking.customer_id (the booker), Team 2 = booking.customer_id_2
// (chosen later). Each booking_matches row's `winner` is the winning team's
// customer id, or null for a draw. A win is worth 2 points; a draw scores
// nothing and counts toward neither team's match-win tally.
//
// The series outcome is derived from the match-WIN tally only (drawn matches
// ignored): more wins takes it, equal wins (and > 0) is a drawn series.
// booking.series_winner_id is a denormalised copy of the winning team's
// customer id, but the leaderboard recomputes from matches so it can't drift.
//
// This module is intentionally import-free and pure so the public Edge Function
// (supabase/functions/leaderboard) can reuse the exact same algorithm — keeping
// the in-app board and the public JSON byte-for-byte identical. Business-day
// month filtering happens BEFORE this, in db.js / the function.

// One team's contribution from a single series. Only called for a booking with
// at least one match, so equal wins is always a genuine drawn series — including
// 0–0, where every match was drawn (rained off). That matches what the team
// modal shows for the same series.
function seriesOutcome(myWins, oppWins) {
  if (myWins > oppWins) return 'won'
  if (myWins < oppWins) return 'lost'
  return 'drew'
}

// bookings: [{ customer_id, customer_name, customer_id_2, customer_name_2 }]
// matchesByBooking: { [bookingId]: [{ winner }] }
// -> ranked rows, best first.
export function computeLeaderboard(bookings, matchesByBooking) {
  const teams = new Map()

  const team = (id, name) => {
    let t = teams.get(id)
    if (!t) {
      t = {
        customer_id: id,
        name: name || 'Unknown',
        seriesWon: 0, seriesDrawn: 0, seriesLost: 0, seriesPlayed: 0,
        matchesWon: 0, matchesDrawn: 0, matchesLost: 0, matchesPlayed: 0,
        points: 0, winRate: 0,
        // Outcomes in chronological order ('won'|'drew'|'lost') — the caller
        // slices the tail for recent-form columns. `form` = per series,
        // `matchForm` = per match. Relies on `bookings` arriving date-ordered
        // (getBookingsInRange orders by date_start).
        form: [], matchForm: [],
      }
      teams.set(id, t)
    } else if (!t.name && name) {
      t.name = name
    }
    return t
  }

  for (const b of bookings) {
    const matches = matchesByBooking[b.id] ?? []
    if (matches.length === 0) continue

    // winner is a customer id (or null = draw). Count by matching each team's
    // id; draws are counted first so a null winner is never mistaken for a win
    // by an unlinked (null-id) team.
    const id1 = b.customer_id, id2 = b.customer_id_2
    let t1Wins = 0, t2Wins = 0, draws = 0
    for (const m of matches) {
      if (m.winner == null) draws++
      else if (m.winner === id1) t1Wins++
      else if (m.winner === id2) t2Wins++
      // winner matching neither current team (stale after a team swap) is ignored
    }

    // Credit each slotted (resolved) customer with their side of the series.
    const slots = [
      { id: id1, oppId: id2, name: b.customer_name, wins: t1Wins, oppWins: t2Wins },
      { id: id2, oppId: id1, name: b.customer_name_2, wins: t2Wins, oppWins: t1Wins },
    ]
    for (const s of slots) {
      if (!s.id) continue // phoneless / unlinked team can't be ranked
      const t = team(s.id, s.name)
      t.matchesWon += s.wins
      t.matchesDrawn += draws
      t.matchesLost += s.oppWins
      // Every decisive + drawn match in this series counts as played by both
      // sides — the denominator for win rate on the Matches board.
      t.matchesPlayed += s.wins + s.oppWins + draws
      t.points += s.wins * 2
      // Per-match outcomes from this team's view, in play order — for the
      // Matches board's recent-form column.
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
  for (const t of rows) {
    t.winRate = t.matchesPlayed > 0 ? t.matchesWon / t.matchesPlayed : 0
  }
  return rankSeries(rows)
}

// ── Rankings ─────────────────────────────────────────────────────────────────
// Two boards over the same team set, differing only in sort.

// Series board: titles first, ties broken by total matches won.
export function rankSeries(rows) {
  return [...rows].sort((a, b) =>
    b.seriesWon - a.seriesWon ||
    b.matchesWon - a.matchesWon ||
    a.name.localeCompare(b.name)
  )
}

// Matches board: match points (2 per win — orders identically to matchesWon, so
// win rate is the real tie-breaker: 6-from-6 beats 6-from-14).
export function rankMatches(rows) {
  return [...rows].sort((a, b) =>
    b.points - a.points ||
    b.winRate - a.winRate ||
    a.name.localeCompare(b.name)
  )
}
