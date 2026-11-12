// The owner's treadmill sessions (our addition): the segment tables behind the cardio sheet
// (components/CardioPlanSheet.jsx). Pure data and small rules, so they are tested here and the
// sheet only draws. Speeds are km/h, incline is percent, minutes count from the start of the run.
//
// A segment is { from, to, speed, speedTo?, incline, hr, kind }:
//   hr    { lo, hi } a band, { max } "under", { at } one number, or null when the table has none
//   kind  'warm' | 'hard' | 'recover' | 'cool' | null, the word the sheet puts on the row
// The one rule above all of them: never above HR_CEILING.

export const HR_CEILING = 175
const WEEK_MS = 7 * 86400000

const seg = (from, to, speed, incline, hr = null, kind = null, speedTo) =>
  ({ from, to, speed, ...(speedTo != null ? { speedTo } : {}), incline, hr, kind })

// Wednesday: 35 minutes of steady work, most of it on a 9 % grade.
const STEADY = [
  seg(0, 3, 4.5, 0, { lo: 100, hi: 110 }, 'warm'),
  seg(3, 5, 5.5, 4, { lo: 120, hi: 135 }),
  seg(5, 25, 6.0, 9, { lo: 145, hi: 160 }),
  seg(25, 30, 6.0, 12, { lo: 165, hi: 170 }),
  seg(30, 33, 5.0, 3, { at: 130 }, 'cool'),
  seg(33, 35, 4.0, 0, { max: 120 }, 'cool')
]

// The same session on the elliptical: one level for the main block, a harder one for the push.
export const ELLIPTICAL = Object.freeze({ level: 6, pushLevel: 8, pushFrom: 25, pushTo: 30 })

// After every lifting day (the 6 am plan): an easy 15 minutes at HR 120-140.
const POST_LIFT = [
  seg(0, 1, 4.0, 0, null, 'warm'),
  seg(1, 14, 5.5, 5, { lo: 120, hi: 140 }),
  seg(14, 15, 4.0, 0, null, 'cool')
]

// Saturday: hard rounds of 3 minutes on 12 %, 3 minutes easy in between, then 10 minutes down:
// 5 at 4 km/h around 130 bpm, then 5 at 3.5 km/h until the heart rate is under 120.
// Three rounds to start; a fourth is added (another recovery and hard block before the cool-down)
// from week 3 of the plan, so the cool-down is never cut short.
export const INTERVAL_ROUNDS = 3
export const INTERVAL_ROUNDS_MAX = 4
export const FOURTH_ROUND_WEEK = 3
export function intervalSegments(rounds = INTERVAL_ROUNDS) {
  const n = Math.max(1, Math.min(INTERVAL_ROUNDS_MAX, Math.round(rounds) || INTERVAL_ROUNDS))
  const out = [seg(0, 3, 4.5, 0, null, 'warm'), seg(3, 5, 5.5, 5, { lo: 125, hi: 140 })]
  let at = 5
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      // the first recovery waits until the heart rate is back to 135; later ones are plain easy walking
      out.push(seg(at, at + 3, 4.0, 0, k === 1 ? { max: 135 } : null, 'recover'))
      at += 3
    }
    out.push(seg(at, at + 3, 6.0, 12, { lo: 165, hi: HR_CEILING }, 'hard'))
    at += 3
  }
  out.push(seg(at, at + 5, 4.0, 0, { at: 130 }, 'cool'))
  out.push(seg(at + 5, at + 10, 3.5, 0, { max: 120 }, 'cool'))
  return out
}

/** Which week of the plan `today` falls in: 1 on the day it was loaded and the six after. null without a date. */
export function planWeek(loadedOn, today) {
  if (!loadedOn || !today) return null
  const a = Date.parse(loadedOn + 'T12:00:00Z'), b = Date.parse(today + 'T12:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(1, Math.floor((b - a) / WEEK_MS) + 1)
}

/** How many hard rounds Saturday asks for in that plan week. */
export const intervalRounds = week => (week != null && week >= FOURTH_ROUND_WEEK ? INTERVAL_ROUNDS_MAX : INTERVAL_ROUNDS)

export const CARDIO_KEYS = ['steady', 'intervals', 'postLift']

/** One session's table: { key, min, rounds?, segments }, or null for an unknown key. */
export function cardioPlan(key, { week = null } = {}) {
  if (key === 'steady') return { key, min: 35, segments: STEADY, elliptical: ELLIPTICAL }
  if (key === 'postLift') return { key, min: 15, segments: POST_LIFT }
  if (key === 'intervals') {
    const rounds = intervalRounds(week)
    const segments = intervalSegments(rounds)
    return { key, min: segments[segments.length - 1].to, rounds, segments }
  }
  return null
}

/** The session a weekday (getDay index) asks for: Wednesday steady, Saturday intervals, the lifting days the walk after. */
export function cardioForWeekday(day) {
  if (day === 3) return 'steady'
  if (day === 6) return 'intervals'
  if ([1, 2, 4, 5].includes(day)) return 'postLift'
  return null
}

/** The cardio a routine of the owner's plan carries (lib/my-plan.js `planKey`), or null. */
export function cardioForRoutine(routine) {
  const k = routine?.planKey
  if (k === 'steady' || k === 'intervals') return k
  if (['upper-a', 'lower-a', 'upper-b', 'lower-b'].includes(k)) return 'postLift'
  return null
}

/** Whether a heart rate is over the hard ceiling. */
export const overCeiling = hr => typeof hr === 'number' && Number.isFinite(hr) && hr > HR_CEILING

/** The highest heart rate a table ever asks for: a check that no segment goes over the ceiling. */
export const topHr = segments => Math.max(0, ...segments.map(s => s.hr ? (s.hr.hi ?? s.hr.max ?? s.hr.at ?? 0) : 0))
