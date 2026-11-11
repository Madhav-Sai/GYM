// Stats → Overview → Weekly activity (our addition). Volume counts sets, and a workout from Whoop
// (a Cult class, a run, lib/whoop-import.js) has none, so the volume charts never see it. This
// counts every workout the way time does: a logged session by how long it ran, a Whoop one by how
// long Whoop measured it, and Whoop's strain where there is one.
//
//   activityWeeks(workouts, { today, ws, weeks }) → [{ week, sessions, minutes, strain, strainN, avgStrain }]
//
// Oldest week first; the last one is the week `today` falls in. `week` is the ISO day the week
// starts (format.js weekKey, so a Sunday start is honoured). `strain` is the week's Whoop strain
// added up, `avgStrain` its mean over the workouts that have one (null with none).
//
// Pure: no store, no clock unless `today` is left out.
import { isoOf, todayISO, weekKey, MONDAY } from './format.js'
import { workoutDay } from './history.js'

const DAY_MS = 86400000
// A session left running overnight would be a day of training; a day is as long as one counts.
const MAX_MIN = 24 * 60

/** How long workout `w` ran, in minutes (0 when it has no usable start and end). */
export function workoutMinutes(w) {
  const s = Number(w?.start), e = Number(w?.end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0
  return Math.min(MAX_MIN, (e - s) / 60000)
}

/** Whoop's strain for workout `w`, or null (a logged session, or Whoop sent none). */
export function workoutStrain(w) {
  const v = w?.whoop?.strain
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

export function activityWeeks(workouts, { today = todayISO(), ws = MONDAY, weeks = 12 } = {}) {
  const n = Math.max(1, Math.floor(Number(weeks) || 12))
  const last = weekKey(today, ws)
  const keys = []
  const base = new Date(last + 'T12:00:00')
  for (let i = n - 1; i >= 0; i--) keys.push(isoOf(new Date(base.getTime() - i * 7 * DAY_MS)))
  // Noon to noon steps cannot drift a day over DST, but a week key is read back to be sure.
  const rows = new Map(keys.map(k => [weekKey(k, ws), { week: weekKey(k, ws), sessions: 0, minutes: 0, strain: 0, strainN: 0, avgStrain: null }]))
  for (const w of Array.isArray(workouts) ? workouts : []) {
    if (!w) continue
    const day = workoutDay(w)
    if (!day) continue
    const row = rows.get(weekKey(day, ws))
    if (!row) continue
    row.sessions++
    row.minutes += workoutMinutes(w)
    const st = workoutStrain(w)
    if (st != null) { row.strain += st; row.strainN++ }
  }
  return [...rows.values()].map(r => ({
    ...r,
    minutes: Math.round(r.minutes),
    strain: Math.round(r.strain * 10) / 10,
    avgStrain: r.strainN ? Math.round((r.strain / r.strainN) * 10) / 10 : null,
  }))
}
