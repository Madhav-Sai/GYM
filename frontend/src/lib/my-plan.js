// The owner's own training plan (our addition): four lifting days, two cardio days and Sunday off,
// loaded in one tap from Home or Settings → Plan & schedule. Weights are kg, as the plan is
// written. Each routine carries a `planKey`, which is what makes loading it a second time reuse the
// routines already there instead of adding a second Upper A; `planLoadedOn` is the day it first
// went in, which the interval day counts its weeks from (lib/cardio-plans.js).
//
// Every lift uses the weekly linear rule (lib/progression.js `weeklyStep`): all sets and reps done
// with no failed set and the weight goes up by the slot's `inc`, otherwise it stays; at most one
// step a week per exercise, even when it is trained twice. The assisted pull-up (0017) is an
// assistance machine, so its step takes help away (issue #232's assisted progression).
//
// Version 2 is the 6 am plan: core work on both lower days (hanging knee raise and cable crunch on
// Lower A; lying leg raise, a 45 s plank that grows 10 s a week and Russian twists on Lower B), a
// 15 minute walk after lifting, and one warm-up set at 50 % for 10 on each lifting day's first
// exercise. Every plan routine carries `planV`; a profile that loaded version 1 gets the new pieces
// from upgradeMyPlan, which adds and never rewrites a weight you already lift.
import { uid } from './format.js'

const TREADMILL = '3666'   // walking on incline treadmill
const PRIORITY = 'Priority: both legs Under on InBody.'

// [exerciseId, sets, reps, kg, increment, note?]. A plank is held for seconds instead (below).
const lift = (id, sets, reps, weight, inc, note) => ({ id, sets, reps, weight, prog: 'linear', weeklyStep: true, ...(inc ? { inc } : {}), ...(note ? { note } : {}) })
const walk = (min, speed, incline) => ({ id: TREADMILL, mode: 'cardio', sets: 1, min, speed, incline })
export const POST_LIFT_MIN = 15
const OLD_POST_LIFT_MIN = 20
const AFTER_LIFT = () => walk(POST_LIFT_MIN, 5.5, 5)
export const MY_PLAN_VERSION = 2
/** The lifting days, which start with the 10 minute warm-up and end on the treadmill. */
export const MY_PLAN_LIFT_KEYS = ['upper-a', 'lower-a', 'upper-b', 'lower-b']
// The first exercise's warm-up: one set at half the working weight for 10 (lib/warmup-ramp.js 'own').
export const FIRST_WARMUP = Object.freeze({ wp: 50, r: 10 })
const PLANK = '0463'
export const PLANK_SEC = 45
export const PLANK_INC = 10
const plank = () => ({ id: PLANK, mode: 'time', sets: 3, sec: PLANK_SEC, weight: 0, prog: 'time', inc: PLANK_INC })
// The core work of the 6 am plan, in the order each day does it.
const CORE = {
  'lower-a': () => [
    lift('9819', 3, 10, 0),                // hanging knee raise, body weight
    lift('0175', 3, 15, 15, 2.5),          // cable crunch (kneeling)
  ],
  'lower-b': () => [
    lift('1163', 3, 12, 0),                // lying leg raise, body weight
    plank(),                               // plank, 45 s, +10 s a week
    lift('0687', 3, 20, 0),                // Russian twist, body weight
  ],
}
const withFirstWarmup = slots => {
  const first = slots.find(e => e.mode !== 'cardio')
  if (first) Object.assign(first, { warmup: 'own', warmupRows: [{ ...FIRST_WARMUP }] })
  return slots
}

// [key, name, glyph, weekday (getDay index), slots]
const PLAN = [
  ['upper-a', 'Upper A', 'barbell', 1, () => [
    lift('0576', 3, 10, 25, 2.5),          // machine chest press
    lift('2291', 3, 10, 35, 2.5),          // lat pulldown, wide grip to the front
    lift('0603', 3, 10, 22.7, 2.5),        // machine shoulder press
    lift('0861', 3, 10, 38.6, 2.5),        // seated cable row
    lift('1030', 3, 12, 31.8, 2.5),        // machine chest fly (pec deck)
    lift('0200', 3, 12, 10, 2.5),          // tricep rope pushdown
    AFTER_LIFT()
  ]],
  ['lower-a', 'Lower A (priority)', 'legs', 2, () => [
    lift('2267', 3, 12, 30, 5, PRIORITY),  // leg press
    lift('0599', 3, 12, 15, 2.5),          // seated leg curl
    lift('0585', 3, 12, 15, 2.5),          // leg extension
    lift('0605', 3, 15, 15, 2.5),          // standing calf raise
    lift('5656', 3, 15, 10, 2.5),          // cable face pull
    ...CORE['lower-a'](),
    AFTER_LIFT()
  ]],
  ['upper-b', 'Upper B', 'pullup', 4, () => [
    lift('1047', 3, 10, 32, 2.5),          // lat pulldown, close grip
    lift('0576', 3, 10, 25, 2.5),          // machine chest press
    lift('0017', 3, 8, 65, 5),             // assisted pull-up: 65 kg of help, down 5 kg a step
    lift('0178', 3, 12, 2.5, 2.5),         // cable lateral raise
    lift('0868', 3, 12, 10, 2.5),          // cable biceps curl
    lift('0602', 3, 15, 15, 2.5),          // rear delt fly (machine reverse fly)
    AFTER_LIFT()
  ]],
  ['lower-b', 'Lower B (priority)', 'legs', 5, () => [
    lift('2267', 3, 12, 30, 5, PRIORITY),  // leg press
    lift('1760', 3, 10, 8),                // goblet squat, the dumbbell's own step
    lift('0599', 3, 12, 15, 2.5),          // seated leg curl
    lift('0594', 3, 20, 15, 2.5),          // seated calf raise
    ...CORE['lower-b'](),
    AFTER_LIFT()
  ]],
  ['steady', 'Steady cardio', 'figureRun', 3, () => [walk(35, 6, 9)]],
  ['intervals', 'Intervals', 'timer', 6, () => [walk(30, 6, 12)]]
]

export const MY_PLAN_KEYS = PLAN.map(([key]) => key)
// Sunday is the rest day: nothing on it.
export const MY_PLAN_REST = [0]

/** Fresh routine objects for the whole plan, with their weekdays: { routines, schedule: [{ day, key }] }. */
export function buildMyPlan(today, makeId = uid) {
  return {
    routines: PLAN.map(([key, name, emoji, , slots]) => ({
      id: makeId(), name, emoji, planKey: key, planV: MY_PLAN_VERSION, planLoadedOn: today,
      ex: MY_PLAN_LIFT_KEYS.includes(key) ? withFirstWarmup(slots()) : slots()
    })),
    schedule: PLAN.map(([key, , , day]) => ({ day, key }))
  }
}

/** The routine of `S` that holds a plan key, or undefined. */
export const planRoutine = (S, key) => (S?.routines || []).find(r => r && r.planKey === key)

/** Whether every routine of the plan is in the profile. */
export const hasMyPlan = S => MY_PLAN_KEYS.every(k => planRoutine(S, k))

/** The day the plan first went in (the earliest of its routines), or null. */
export function myPlanLoadedOn(S) {
  const days = (S?.routines || []).filter(r => r?.planKey && MY_PLAN_KEYS.includes(r.planKey) && r.planLoadedOn).map(r => r.planLoadedOn).sort()
  return days[0] || null
}

/**
 * Puts the plan into a state draft: the routines it does not have yet, and the weekly schedule
 * (Monday Upper A, Tuesday Lower A, Wednesday steady cardio, Thursday Upper B, Friday Lower B,
 * Saturday intervals, Sunday off). A routine already loaded is reused as it stands, edits and all,
 * so loading twice never duplicates anything. Returns how many routines it added.
 */
export function applyMyPlan(S, today, makeId = uid) {
  const plan = buildMyPlan(today, makeId)
  if (!Array.isArray(S.routines)) S.routines = []
  if (!S.week || typeof S.week !== 'object') S.week = {}
  let added = 0
  const idOf = {}
  for (const r of plan.routines) {
    const have = planRoutine(S, r.planKey)
    if (have) { idOf[r.planKey] = have.id; continue }
    S.routines.push(r)
    idOf[r.planKey] = r.id
    added++
  }
  for (const { day, key } of plan.schedule) S.week[day] = [idOf[key]]
  for (const day of MY_PLAN_REST) S.week[day] = []
  // A weekly plan, not a rotation: the weekday grid is what this plan is written as.
  if (S.scheduleMode === 'rotation') S.scheduleMode = 'week'
  return added
}

const planVersionOf = r => (Number.isFinite(r?.planV) ? r.planV : 1)
const isPlanRoutine = r => !!r && MY_PLAN_KEYS.includes(r.planKey)

/** Whether a routine is one of the plan's lifting days (the warm-up note shows on those). */
export const isPlanLiftDay = r => !!r && MY_PLAN_LIFT_KEYS.includes(r.planKey)

/** Whether the profile holds plan routines written before the 6 am version. */
export const myPlanOutdated = S => (S?.routines || []).some(r => isPlanRoutine(r) && planVersionOf(r) < MY_PLAN_VERSION)

const isWalk = e => e && e.mode === 'cardio' && e.id === TREADMILL

/**
 * Brings plan routines loaded before the 6 am version up to it, in a state draft: the core
 * exercises a lower day does not have yet go in before its walk, the plank becomes 45 s (a longer
 * hold you already reached stays) on a 10 s step, the walk after lifting becomes 15 minutes when it
 * is still the old 20, and a lifting day's first exercise gets the 50 % warm-up set unless it has a
 * warm-up of its own. Weights, sets and reps of the exercises you already have are left exactly as
 * they are. Returns how many routines it changed; 0 when everything is current.
 */
export function upgradeMyPlan(S) {
  let changed = 0
  for (const r of S?.routines || []) {
    if (!isPlanRoutine(r) || planVersionOf(r) >= MY_PLAN_VERSION) continue
    if (!Array.isArray(r.ex)) r.ex = []
    if (CORE[r.planKey]) {
      const specs = CORE[r.planKey]()
      const has = id => r.ex.findIndex(e => e && e.id === id)
      specs.forEach((spec, i) => {
        if (has(spec.id) >= 0) return
        // before the next core exercise already there, else before the walk, else at the end
        const later = specs.slice(i + 1).map(x => has(x.id)).find(k => k >= 0)
        const walkAt = r.ex.findIndex(isWalk)
        const at = later != null ? later : walkAt >= 0 ? walkAt : r.ex.length
        r.ex.splice(at, 0, spec)
      })
      const p = r.ex.find(e => e && e.id === PLANK && e.mode === 'time')
      if (p) {
        p.sec = Math.max(Number(p.sec) || 0, PLANK_SEC)
        p.inc = PLANK_INC
      }
    }
    if (isPlanLiftDay(r)) {
      for (const e of r.ex) if (isWalk(e) && e.min === OLD_POST_LIFT_MIN) e.min = POST_LIFT_MIN
      const first = r.ex.find(e => e && e.mode !== 'cardio')
      if (first && first.warmup == null && !(Math.round(first.warmupSets) > 0)) {
        first.warmup = 'own'
        first.warmupRows = [{ ...FIRST_WARMUP }]
      }
    }
    r.planV = MY_PLAN_VERSION
    changed++
  }
  return changed
}
