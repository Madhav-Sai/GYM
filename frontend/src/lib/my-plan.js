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
import { uid } from './format.js'

const TREADMILL = '3666'   // walking on incline treadmill
const PRIORITY = 'Priority: both legs Under on InBody.'

// [exerciseId, sets, reps, kg, increment, note?]. A plank is held for seconds instead (below).
const lift = (id, sets, reps, weight, inc, note) => ({ id, sets, reps, weight, prog: 'linear', weeklyStep: true, ...(inc ? { inc } : {}), ...(note ? { note } : {}) })
const walk = (min, speed, incline) => ({ id: TREADMILL, mode: 'cardio', sets: 1, min, speed, incline })
const AFTER_LIFT = () => walk(20, 5.5, 5)

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
    { id: '0463', mode: 'time', sets: 3, sec: 30, weight: 0, prog: 'time', inc: 5 },  // plank, body weight
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
    routines: PLAN.map(([key, name, emoji, , slots]) => ({ id: makeId(), name, emoji, planKey: key, planLoadedOn: today, ex: slots() })),
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
