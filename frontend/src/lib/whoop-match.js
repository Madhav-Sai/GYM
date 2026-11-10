// Whoop workout matching (our addition): which Whoop workout, if any, was this logged session.
// Pure and stored nowhere: the session detail asks it each time it opens, against the workouts our
// server's Whoop summary already lists (GET /api/whoop/summary, `workouts`).
//
// A match is a Whoop workout whose time window overlaps the session's, give or take MATCH_TOLERANCE
// on either side (a strap started late, a session finished on the phone after the walk out).
// Several candidates: the one sharing the most time with the session, then the closest start.
import { overCeiling } from './cardio-plans.js'

export const MATCH_TOLERANCE_MS = 30 * 60 * 1000

const ms = v => (typeof v === 'number' ? v : Date.parse(v))
const ok = v => Number.isFinite(v)

/** The Whoop workout `workouts` holds for a session { start, end } (ms), or null. */
export function matchWhoopWorkout(session, workouts, tolerance = MATCH_TOLERANCE_MS) {
  const s = ms(session?.start)
  if (!ok(s) || !Array.isArray(workouts)) return null
  const e = ok(ms(session?.end)) && ms(session.end) >= s ? ms(session.end) : s
  let best = null, bestOverlap = -1, bestGap = Infinity
  for (const w of workouts) {
    const ws = ms(w?.start)
    if (!ok(ws)) continue
    const we = ok(ms(w?.end)) && ms(w.end) >= ws ? ms(w.end) : ws
    if (ws > e + tolerance || we < s - tolerance) continue
    const overlap = Math.max(0, Math.min(e, we) - Math.max(s, ws))
    const gap = Math.abs(ws - s)
    if (overlap > bestOverlap || (overlap === bestOverlap && gap < bestGap)) { best = w; bestOverlap = overlap; bestGap = gap }
  }
  return best
}

/** What the session detail shows of a match: strain, average and max heart rate, and whether max went over 175. */
export function whoopMatchView(w) {
  if (!w) return null
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const maxHr = num(w.maxHr)
  return { strain: num(w.strain), avgHr: num(w.avgHr), maxHr, over: overCeiling(maxHr), sport: w.sport || null }
}
