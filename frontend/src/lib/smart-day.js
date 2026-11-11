// Smart day (this fork): what today's Whoop recovery band means for today's plan, as a suggestion
// with one-tap actions on Home and on the Diet screen. Nothing is changed until a tap: the banner
// only offers to switch the diet's day type (POST /api/health/diet/day), to open the cardio plan,
// or to keep the plan as it is ("Keep my plan" hides it for the day).
//
//   S.smartDay      false switches the suggestions off (Settings → Whoop); on unless turned off
//   S.smartDayKept  { 'YYYY-MM-DD': true } the health days (lib/ist.js) the banner was put away,
//                   a plain synced setting stamped whole, trimmed to the last two weeks
//
// The band comes from the server's guidance (GET /api/whoop/summary today.guidance.band, green
// 67 and up, yellow 34 to 66, red under 34). The rule per band:
//   red     swap the lifting for the easy 20 minutes of cardio (lib/cardio-plans.js) or rest, diet
//           a rest day, and keep last week's weights if you lift anyway
//   yellow  train, no new weight
//   green   train, try progression
import { addDays } from './ist.js'
import { cardioForRoutine } from './cardio-plans.js'

export const BANDS = ['green', 'yellow', 'red']
export const KEEP_DAYS = 14

/** Whether the suggestions are on (Settings → Whoop → Smart day suggestions). */
export const smartDayOn = S => S?.smartDay !== false

/** Whether "Keep my plan" was tapped on `day`. */
export const keptOn = (S, day) => !!(S?.smartDayKept && typeof S.smartDayKept === 'object' && S.smartDayKept[day] === true)

/** S.smartDayKept with `day` kept, days older than two weeks dropped. */
export function withKept(map, day) {
  const base = map && typeof map === 'object' && !Array.isArray(map) ? map : {}
  const since = addDays(day, -KEEP_DAYS)
  const out = {}
  for (const [d, v] of Object.entries(base)) if (v === true && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= since) out[d] = true
  out[day] = true
  return out
}

/** What kind of day the plan makes today: 'lift', 'cardio' (the plan's steady or interval day) or 'rest'. */
export function dayKind(routines) {
  const rs = Array.isArray(routines) ? routines.filter(Boolean) : []
  if (rs.some(r => { const c = cardioForRoutine(r); return c === 'postLift' || (!c && (r.ex || []).length > 0) })) return 'lift'
  if (rs.some(r => { const c = cardioForRoutine(r); return c === 'steady' || c === 'intervals' })) return 'cardio'
  return 'rest'
}

const TITLE = { green: 'Recovery is green', yellow: 'Recovery is yellow', red: 'Recovery is red' }
const TEXT = {
  red: {
    lift: "Swap today's lifting for the easy 20 minutes of cardio, or rest. If you lift anyway, keep last week's weights.",
    cardio: 'Make it the easy 20 minutes on the treadmill, or rest. Nothing hard today.',
    rest: 'A rest day is the right call. Sleep and eat well.',
  },
  yellow: {
    lift: 'Train as planned, but no new weight today. Repeat last week.',
    cardio: 'Do the cardio, and stay in the heart-rate bands.',
    rest: 'A rest day suits today.',
  },
  green: {
    lift: 'Train and try progression: add weight where you hit every rep last time.',
    cardio: 'Do the full cardio plan today.',
    rest: 'Green on a rest day. An easy walk is fine.',
  },
}
const LIFT = { red: 'keep', yellow: 'hold', green: 'progress' }

/**
 * The suggestion for today, or null (no band, switched off, or kept for today).
 * `dayType` is the diet's day type now (lib/diet-plan.js dayTypeOf with the day's override).
 * Returns { band, kind, title, text, lift, dietDayType, cardioKey, actions } where actions is a
 * list of 'diet' (switch to dietDayType), 'cardio' (open cardioKey's plan) and 'keep'.
 */
export function smartDay({ band, routines, dayType, kept = false, on = true } = {}) {
  if (!on || kept || !BANDS.includes(band)) return null
  const kind = dayKind(routines)
  const out = { band, kind, title: TITLE[band], text: TEXT[band][kind], lift: kind === 'lift' ? LIFT[band] : null, dietDayType: null, cardioKey: null, actions: [] }
  if (band === 'red') {
    out.dietDayType = 'rest'
    if (dayType !== 'rest') out.actions.push('diet')
    if (kind !== 'rest') { out.cardioKey = 'postLift'; out.actions.push('cardio') }
  }
  out.actions.push('keep')
  return out
}
