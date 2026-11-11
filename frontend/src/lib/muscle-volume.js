// Weekly volume per muscle (Stats → Lifts → "Volume by muscle", our addition): weight × reps of
// the ticked work sets, per muscle, per week, for the last few weeks.
//
// Each entry's volume is counted exactly as the session's own volume is (history.js
// workoutVolume: both bells of a dumbbell pair, each side of a per-side row, drops, body weight
// when the profile counts it, warm-ups only when the profile says so), and then shared out over
// the muscles the exercise trains with the same weights the muscle map uses (muscles.js): a
// primary muscle gets all of it, a secondary its share (0.4 for a dataset secondary). So a bench
// press of 1000 kg is 1000 kg of chest and 400 kg of triceps. Weights are in the profile's unit,
// like every logged set.
import { EXIDX } from './exercises.js'
import { MUSCLES, musclesOf } from './muscles.js'
import { workoutVolume, workoutDay, countsWarmups } from './history.js'
import { bodyweightFor, countsBodyweight } from './bw-load.js'
import { todayISO, weekKey, isoOf, weekStartOf, MONDAY } from './format.js'

export const VOLUME_WEEKS = 8
export const DEFAULT_PICK = 5

/** The `n` week keys (ISO date of each week's first day) ending with the week of `today`, oldest first. */
export function weekKeysBack(today = todayISO(), n = VOLUME_WEEKS, ws = MONDAY) {
  const last = new Date(weekKey(today, ws) + 'T12:00:00')
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(last)
    d.setDate(d.getDate() - i * 7)
    out.push(isoOf(d))
  }
  return out
}

// The exercise a logged entry stands for, for its muscles: the snapshot the workout saved when it
// has muscle weights, else the catalogue's, else whatever the entry carries (muscles.js loadOf).
const sourceOf = e => {
  const historical = e?.exercise || e
  return historical?.muscleWeights ? historical : (EXIDX[e?.id] || historical)
}

/**
 * { weeks: [iso], byMuscle: { slug: [volume per week] }, totals: { slug: sum }, ranked: [slug] }
 * for the `weeks` weeks ending with the week of `today`. `ranked` holds only muscles with volume,
 * most first (ties in the map's head-to-toe order). Options:
 *   ws          first day of the week (format.js MONDAY / SUNDAY)
 *   warmups     count warm-up rows too
 *   bodyweight  w => the body weight to count in that session's bodyweight lifts (0 = none)
 */
export function muscleVolumeByWeek(workouts, { today = todayISO(), weeks = VOLUME_WEEKS, ws = MONDAY, warmups = false, bodyweight = () => 0 } = {}) {
  const keys = weekKeysBack(today, weeks, ws)
  const at = new Map(keys.map((k, i) => [k, i]))
  const byMuscle = {}
  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (!Array.isArray(w?.entries) || !w.entries.length) continue
    const day = workoutDay(w)
    if (!day) continue
    const i = at.get(weekKey(day, ws))
    if (i == null) continue
    const bw = Number(bodyweight(w)) || 0
    for (const e of w.entries) {
      const v = workoutVolume({ entries: [e] }, { warmups, bodyweight: bw })
      if (!(v > 0)) continue
      const m = musclesOf(sourceOf(e))
      for (const slug in m) {
        if (!MUSCLES.includes(slug) || !(m[slug] > 0)) continue
        const row = byMuscle[slug] || (byMuscle[slug] = Array(keys.length).fill(0))
        row[i] += v * m[slug]
      }
    }
  }
  const totals = {}
  for (const slug in byMuscle) {
    byMuscle[slug] = byMuscle[slug].map(x => Math.round(x * 10) / 10)
    totals[slug] = Math.round(byMuscle[slug].reduce((a, b) => a + b, 0) * 10) / 10
  }
  const ranked = Object.keys(totals).filter(s => totals[s] > 0)
    .sort((a, b) => totals[b] - totals[a] || MUSCLES.indexOf(a) - MUSCLES.indexOf(b))
  return { weeks: keys, byMuscle, totals, ranked }
}

/** The same for a profile: its workouts, week start, warm-up and body-weight settings. */
export function muscleVolumeOf(S, { today = todayISO(), weeks = VOLUME_WEEKS } = {}) {
  const withBw = countsBodyweight(S)
  return muscleVolumeByWeek(S?.workouts, {
    today, weeks, ws: weekStartOf(S), warmups: countsWarmups(S),
    bodyweight: w => (withBw ? bodyweightFor(w, S) : 0),
  })
}

/** The muscles shown before anyone picks: the top `n` by volume over the window. */
export const defaultPick = (vol, n = DEFAULT_PICK) => (vol?.ranked || []).slice(0, n)

/**
 * The muscles to draw: a pick the person made, kept to muscles that have volume in the window
 * (in ranked order), or the default when that leaves nothing.
 */
export function shownMuscles(vol, picked) {
  const have = new Set(vol?.ranked || [])
  const kept = (vol?.ranked || []).filter(s => have.has(s) && (picked || []).includes(s))
  return Array.isArray(picked) && kept.length ? kept : defaultPick(vol)
}

/** One week's numbers for the tap: [{ m, v }] for `muscles` (zeros kept), and their sum. */
export function weekBreakdown(vol, index, muscles) {
  const rows = (muscles || []).map(m => ({ m, v: vol?.byMuscle?.[m]?.[index] || 0 }))
  return { week: vol?.weeks?.[index] || null, rows, total: Math.round(rows.reduce((a, r) => a + r.v, 0) * 10) / 10 }
}
