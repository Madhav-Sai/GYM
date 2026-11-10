// The daily timing plan (this fork): when to wake, eat, train, work and sleep, as one or more named
// plans with the weekdays each one covers. The owner works a 14:00 to 23:00 shift and goes to bed
// after midnight, so a plan day runs 04:00 to 04:00 India time (lib/ist.js): 01:30 sleep belongs to
// the same plan day as the 10:00 wake-up before it, and sorts after 23:45.
//
//   S.daySchedule = { plans: [{ id, name, days: [0-6], rows: [{ id, time: 'HH:MM', label, kind, note, remind }] }], remind }
//
// Stored only once you change something: until then the default plan below is shown, so a fresh
// profile writes nothing. It syncs as one setting (lib/sync-merge.js stampEdits stamps it whole,
// api/sync-stamps.js the same on the server), the newest edit of the whole plan wins.
//
// Every function here is pure and returns a new schedule; the input is never mutated.
import { healthDay, healthMinutes, weekdayOf, DAY_ROLLOVER_MIN } from './ist.js'

export const KINDS = ['wake', 'meal', 'gym', 'work', 'supp', 'sleep', 'other']
export const KIND_ICON = { wake: 'sunrise', meal: 'leaf', gym: 'dumbbell', work: 'clock', supp: 'pill', sleep: 'moon', other: 'dot' }
export const KIND_TINT = { wake: 'var(--orange)', meal: 'var(--green)', gym: 'var(--acc)', work: 'var(--blue)', supp: 'var(--purple)', sleep: 'var(--indigo)', other: 'var(--label-3)' }
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
export const MAX_PLANS = 8
export const MAX_ROWS = 28
const LABEL_MAX = 60
const NOTE_MAX = 200
const NAME_MAX = 40

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const pad = n => String(n).padStart(2, '0')

export const DEFAULT_PLAN_ID = 'shift'
export const DEFAULT_PLAN_NAME = 'Shift 2pm-11pm'
const DEFAULT_ROWS = [
  ['10:00', 'Wake up', 'wake'],
  ['10:15', 'Pre-gym meal, coffee and omega-3', 'meal'],
  ['11:00', 'Gym', 'gym'],
  ['12:30', 'Post-gym protein', 'meal'],
  ['13:00', 'Lunch', 'meal'],
  ['14:00', 'Shift starts', 'work'],
  ['17:00', 'Snack 1', 'meal'],
  ['20:00', 'Dinner (packed)', 'meal'],
  ['22:00', 'Snack 2', 'meal'],
  ['23:00', 'Shift ends', 'work'],
  ['23:45', 'Isabgol and protein', 'supp'],
  ['01:30', 'Sleep', 'sleep'],
]

/** The seeded schedule: one plan, "Shift 2pm-11pm", on every day. */
export function defaultSchedule() {
  return {
    plans: [{
      id: DEFAULT_PLAN_ID, name: DEFAULT_PLAN_NAME, days: [...ALL_DAYS],
      rows: DEFAULT_ROWS.map(([time, label, kind], i) => ({ id: 'r' + (i + 1), time, label, kind, note: '' })),
    }],
    remind: false,
  }
}

/** 'HH:MM' as minutes on the plan day's axis: before 04:00 counts as the night after (01:30 is 1530). */
export function dayMinutes(time) {
  if (!TIME.test(String(time || ''))) return Infinity
  const [h, m] = time.split(':').map(Number)
  const v = h * 60 + m
  return v < DAY_ROLLOVER_MIN ? v + 1440 : v
}

/** Minutes on the plan-day axis back to 'HH:MM'. */
export const timeOf = mins => { const v = ((Math.round(mins) % 1440) + 1440) % 1440; return pad(Math.floor(v / 60)) + ':' + pad(v % 60) }

/** Rows in plan-day order; rows at the same time keep their stored order. */
export const sortRows = rows => rows.map((r, i) => [r, i]).sort((a, b) => dayMinutes(a[0].time) - dayMinutes(b[0].time) || a[1] - b[1]).map(x => x[0])

function cleanRow(r, i) {
  if (!isMap(r) || !TIME.test(String(r.time || ''))) return null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : 'x' + i,
    time: r.time,
    label: String(r.label || '').slice(0, LABEL_MAX),
    kind: KINDS.includes(r.kind) ? r.kind : 'other',
    note: String(r.note || '').slice(0, NOTE_MAX),
    ...(r.remind === false ? { remind: false } : {}),
  }
}

function cleanPlan(p, i) {
  if (!isMap(p)) return null
  const days = Array.isArray(p.days) ? [...new Set(p.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
  const rows = sortRows((Array.isArray(p.rows) ? p.rows : []).map(cleanRow).filter(Boolean)).slice(0, MAX_ROWS)
  return { id: typeof p.id === 'string' && p.id ? p.id : 'p' + i, name: String(p.name || 'Plan').slice(0, NAME_MAX), days, rows }
}

/** The schedule a profile shows: its own when it has a valid one, else the default. Never throws. */
export function scheduleOf(S) {
  const raw = S?.daySchedule
  if (!isMap(raw) || !Array.isArray(raw.plans)) return defaultSchedule()
  const seen = new Set()
  const plans = raw.plans.map(cleanPlan).filter(p => p && !seen.has(p.id) && seen.add(p.id)).slice(0, MAX_PLANS)
  if (!plans.length) return defaultSchedule()
  return { plans, remind: raw.remind === true }
}

/** Today's plan day ('YYYY-MM-DD'), with the 04:00 India-time rollover. */
export const planDay = (now = new Date()) => healthDay(now)

/** The plan that covers a plan day ('YYYY-MM-DD') or weekday (0 Sunday): the first that lists it, else the first plan. */
export function planFor(schedule, day) {
  const plans = schedule?.plans || []
  const wd = typeof day === 'number' ? day : weekdayOf(day)
  return plans.find(p => p.days.includes(wd)) || plans[0] || null
}

/** The row in progress at `minutes` (plan-day axis): the last one that has started. Null before the first. */
export function nowRow(plan, minutes) {
  let cur = null
  for (const r of sortRows(plan?.rows || [])) if (dayMinutes(r.time) <= minutes) cur = r
  return cur
}

/** The next row after `minutes`, or null once the last one has started. */
export function nextRow(plan, minutes) {
  return sortRows(plan?.rows || []).find(r => dayMinutes(r.time) > minutes) || null
}

/**
 * Where the day stands at `now`: { day, plan, now, next, minutesLeft, tomorrow }. Past the last row,
 * `next` is the first row of the next plan day's plan (`tomorrow` true).
 */
export function whereNow(schedule, now = new Date()) {
  const day = planDay(now)
  const mins = healthMinutes(now)
  const plan = planFor(schedule, day)
  const cur = nowRow(plan, mins)
  let next = nextRow(plan, mins), tomorrow = false, left = null
  if (next) left = dayMinutes(next.time) - mins
  else {
    const nd = (weekdayOf(day) + 1) % 7
    const first = sortRows(planFor(schedule, nd)?.rows || [])[0] || null
    if (first) { next = first; tomorrow = true; left = dayMinutes(first.time) + 1440 - mins }
  }
  return { day, plan, now: cur, next, minutesLeft: left, tomorrow }
}

/** "2h 15m", "45m": the time left until the next row. */
export function fmtLeft(mins) {
  if (mins == null || !Number.isFinite(mins)) return ''
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60), r = m % 60
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`
}

/** Where on the plan day (0 to 1) `minutes` sits, for the "now" line. */
export const dayFraction = minutes => Math.min(1, Math.max(0, (minutes - DAY_ROLLOVER_MIN) / 1440))

const randomId = p => p + Math.random().toString(36).slice(2, 9)

const withPlan = (schedule, planId, fn) => ({
  ...schedule,
  plans: schedule.plans.map(p => (p.id === planId ? fn(p) : p)),
})

/** A row added to a plan; returns the schedule. A bad time is refused (schedule unchanged). */
export function addRow(schedule, planId, row, id = randomId('r')) {
  const r = cleanRow({ kind: 'other', label: '', note: '', ...row, id }, 0)
  if (!r) return schedule
  return withPlan(schedule, planId, p => (p.rows.length >= MAX_ROWS ? p : { ...p, rows: sortRows([...p.rows, r]) }))
}

/** A row changed (time, label, kind, note, remind). A bad time keeps the old one. */
export function editRow(schedule, planId, rowId, patch) {
  return withPlan(schedule, planId, p => ({
    ...p,
    rows: sortRows(p.rows.map(r => {
      if (r.id !== rowId) return r
      const next = cleanRow({ ...r, ...patch, id: r.id, time: TIME.test(String(patch?.time || '')) ? patch.time : r.time }, 0)
      return next || r
    })),
  }))
}

/** A row taken out. */
export const removeRow = (schedule, planId, rowId) => withPlan(schedule, planId, p => ({ ...p, rows: p.rows.filter(r => r.id !== rowId) }))

/**
 * A row moved one place earlier (dir -1) or later (+1). It takes the neighbour's time slot and the
 * neighbour takes its: "move Lunch up" puts Lunch at 12:30 and the protein at 13:00.
 */
export function moveRow(schedule, planId, rowId, dir) {
  return withPlan(schedule, planId, p => {
    const rows = sortRows(p.rows)
    const i = rows.findIndex(r => r.id === rowId), j = i + (dir < 0 ? -1 : 1)
    if (i < 0 || j < 0 || j >= rows.length) return p
    const a = rows[i], b = rows[j]
    const out = [...rows]
    out[i] = { ...b, time: a.time }
    out[j] = { ...a, time: b.time }
    return { ...p, rows: sortRows(out) }
  })
}

/** A copy of a plan with no weekdays yet, right after it. Returns { schedule, id }. */
export function duplicatePlan(schedule, planId, name, id = randomId('p')) {
  const src = schedule.plans.find(p => p.id === planId)
  if (!src || schedule.plans.length >= MAX_PLANS) return { schedule, id: null }
  const copy = { ...src, id, name: String(name || src.name + ' (copy)').slice(0, NAME_MAX), days: [], rows: src.rows.map(r => ({ ...r })) }
  const at = schedule.plans.indexOf(src) + 1
  return { schedule: { ...schedule, plans: [...schedule.plans.slice(0, at), copy, ...schedule.plans.slice(at)] }, id }
}

/** A plan renamed. */
export const renamePlan = (schedule, planId, name) => withPlan(schedule, planId, p => ({ ...p, name: String(name || '').trim().slice(0, NAME_MAX) || p.name }))

/**
 * A plan set to cover `days` (0 Sunday … 6 Saturday). A weekday has one plan: the days given here
 * are taken off every other plan.
 */
export function assignDays(schedule, planId, days) {
  const want = [...new Set((days || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  return {
    ...schedule,
    plans: schedule.plans.map(p => (p.id === planId ? { ...p, days: want } : { ...p, days: p.days.filter(d => !want.includes(d)) })),
  }
}

/** One weekday switched on or off for a plan. */
export function toggleDay(schedule, planId, day) {
  const p = schedule.plans.find(x => x.id === planId)
  if (!p) return schedule
  return assignDays(schedule, planId, p.days.includes(day) ? p.days.filter(d => d !== day) : [...p.days, day])
}

/** A plan removed. The last one stays: there is always a plan to show. */
export function removePlan(schedule, planId) {
  if (schedule.plans.length <= 1) return schedule
  return { ...schedule, plans: schedule.plans.filter(p => p.id !== planId) }
}

/** The weekdays no plan lists (they fall back to the first plan). */
export const uncoveredDays = schedule => ALL_DAYS.filter(d => !(schedule?.plans || []).some(p => p.days.includes(d)))
