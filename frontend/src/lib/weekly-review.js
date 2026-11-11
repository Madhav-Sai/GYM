// The weekly review (this fork): one Monday-to-Sunday week (India time, lib/ist.js) read back from
// what the app already holds. The synced state gives the workouts, the plan, the lifts and the
// check-ins; our server gives Whoop (GET /api/whoop/summary), the diet log (GET /api/health/diet,
// one call per day) and the supplements (GET /api/health/supplements). Anything not to hand is
// null and the card shows a dash for it, never a 0.
//
// Home shows the card on Sunday (the week that ends today) and Monday (the week just gone); its ×
// stores the week's key in S.weeklyReviewSeen, a plain synced setting. Stats opens the same review
// for any week. Every function here is pure: the caller passes `today`.
//
// Strings in the result are English keys with {0} places for t(), so the card translates them.
import { addDays, weekdayOf } from './ist.js'
import { effectiveRoutineIds } from './history.js'
import { bestSetOf, formulaOf } from './onerm.js'
import { visitDays } from './gym-visits.js'
import { dueOn } from './supplements.js'
import { EXIDX } from './exercises.js'
import { exerciseNameText } from './format.js'

export const ZONE45_TARGET = [20, 25]
export const ZONE45_WARN = 30
export const HR_CEILING = 175
export const SLEEP_GOAL_MIN = 7 * 60
const EPS = 0.05

const isNum = v => typeof v === 'number' && Number.isFinite(v)
const avg = xs => { const v = xs.filter(isNum); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null }
const list = v => (Array.isArray(v) ? v : [])

/** The Monday ('YYYY-MM-DD') of the week a day is in. */
export const mondayOf = day => addDays(day, -((weekdayOf(day) + 6) % 7))

/** The seven days of the week starting `from`. */
export const daysOfWeek = from => Array.from({ length: 7 }, (_, i) => addDays(from, i))

/** The key a dismissed card stores: the week's Monday. */
export const reviewKey = from => 'w:' + from

/**
 * The week a review opens on: on Sunday the week that ends today, on any other day the last full
 * week (Monday looks back on the week just gone).
 */
export const reviewWeekStart = today => (weekdayOf(today) === 0 ? mondayOf(today) : addDays(mondayOf(today), -7))

/** Whether Home shows the card today: Sunday or Monday, and that week not put away. */
export function reviewDue(S, today) {
  const wd = weekdayOf(today)
  if (wd !== 0 && wd !== 1) return false
  return S?.weeklyReviewSeen !== reviewKey(reviewWeekStart(today))
}

/** The week `from` moved by `n` weeks, never past the current week. */
export function stepWeek(from, n, today) {
  const next = addDays(from, n * 7)
  const cur = mondayOf(today)
  return next > cur ? cur : next
}

const inWeek = (d, from) => typeof d === 'string' && d >= from && d <= addDays(from, 6)

/** The best set (by estimated 1RM, lib/onerm.js) of each exercise logged in the week. */
export function topSets(S, from, formula = formulaOf(S)) {
  const out = new Map()
  for (const w of list(S?.workouts)) {
    if (!inWeek(w?.d, from)) continue
    for (const e of list(w.entries)) {
      if (!e?.id) continue
      const b = bestSetOf(e, formula)
      if (!b) continue
      const cur = out.get(e.id)
      if (!cur || b.est > cur.est) out.set(e.id, { ...b, d: w.d })
    }
  }
  return out
}

/** Whether top set `a` beats `b`: heavier, the same weight for more reps, or a higher estimate. */
export function beats(a, b) {
  if (!a || !b) return false
  if (a.w > b.w + EPS) return true
  if (Math.abs(a.w - b.w) <= EPS && a.r > b.r) return true
  return a.est > b.est + EPS
}
const fellBack = (a, b) => !!a && !!b && a.w < b.w - EPS && a.est < b.est - EPS

const nameOf = (S, id) => {
  const ex = EXIDX[id] || list(S?.customEx).find(x => x?.id === id)
  return ex ? exerciseNameText(ex) : id
}

/** How much to drop a stalled lift by: 5 kg (2.5 under 40 kg), 10 lb (5 under 90 lb). */
export function deloadStep(w, unit = 'kg') {
  if (unit === 'lb') return w >= 90 ? 10 : 5
  return w >= 40 ? 5 : 2.5
}

/**
 * Every lift of the week against the week before: { id, name, now, prev, status } with status
 * 'up', 'same', 'down' or 'new', and `stalled` (no progress two weeks running: this week did not
 * beat the last, and the last did not beat the one before).
 */
export function liftChanges(S, from) {
  const formula = formulaOf(S)
  const a = topSets(S, from, formula), b = topSets(S, addDays(from, -7), formula), c = topSets(S, addDays(from, -14), formula)
  const out = []
  for (const [id, now] of a) {
    const prev = b.get(id) || null
    const before = c.get(id) || null
    const status = !prev ? 'new' : beats(now, prev) ? 'up' : fellBack(now, prev) ? 'down' : 'same'
    const stalled = !!prev && !!before && status !== 'up' && !beats(prev, before)
    out.push({ id, name: nameOf(S, id), now, prev, status, stalled })
  }
  return out.sort((x, y) => y.now.est - x.now.est)
}

/** Workouts done against the plan: sessions, days trained, planned days and planned days trained. */
export function workoutTally(S, from, today) {
  const days = daysOfWeek(from)
  const ws = list(S?.workouts).filter(w => inWeek(w?.d, from))
  const trained = new Set(ws.map(w => w.d))
  let planned = 0, plannedDone = 0
  for (const d of days) {
    let ids = []
    try { ids = effectiveRoutineIds(S, d, today) } catch { ids = [] }
    if (!ids.length) continue
    planned++
    if (trained.has(d)) plannedDone++
  }
  return { sessions: ws.length, days: trained.size, planned, plannedDone }
}

/** The week's PRs: exercise ids a finished session recorded as records (w.prs), each once. */
export function weekPRs(S, from) {
  const ids = []
  for (const w of list(S?.workouts)) {
    if (!inWeek(w?.d, from)) continue
    for (const id of list(w.prs)) if (typeof id === 'string' && !ids.includes(id)) ids.push(id)
  }
  return ids.map(id => ({ id, name: nameOf(S, id) }))
}

/** Check-ins (lib/gym-visits.js) and gym days (check-ins and logged workouts together). */
export function checkIns(S, from) {
  const checks = visitDays(S).filter(d => inWeek(d, from))
  const gym = new Set(checks)
  for (const w of list(S?.workouts)) if (inWeek(w?.d, from)) gym.add(w.d)
  return { checkIns: checks.length, gymDays: gym.size }
}

/**
 * Whoop for the week from the summary: recovery average and its change on the week before, sleep,
 * zone 4-5 minutes against 20-25, and every workout over 175 bpm. null when not connected.
 */
export function whoopWeek(summary, from) {
  if (!summary || summary.connected === false || !Array.isArray(summary.days)) return null
  const days = summary.days.filter(d => inWeek(d?.day, from))
  const prev = summary.days.filter(d => inWeek(d?.day, addDays(from, -7)))
  const recovery = avg(days.map(d => d.recovery))
  const prevRecovery = avg(prev.map(d => d.recovery))
  const ws = list(summary.workouts).filter(w => inWeek(w?.day, from))
  const known = ws.filter(w => w?.zonesMin && isNum(w.zonesMin[4]) && isNum(w.zonesMin[5]))
  const zone = known.length ? Math.round(known.reduce((n, w) => n + w.zonesMin[4] + w.zonesMin[5], 0)) : (ws.length ? 0 : null)
  const zoneStatus = zone == null ? null : zone > ZONE45_WARN ? 'over' : zone > ZONE45_TARGET[1] ? 'high' : zone >= ZONE45_TARGET[0] ? 'on-target' : 'building'
  const sleep = avg(days.map(d => d.sleepMin))
  return {
    recovery,
    prevRecovery,
    trend: isNum(recovery) && isNum(prevRecovery) ? Math.round(recovery - prevRecovery) : null,
    sleepMin: isNum(sleep) ? Math.round(sleep) : null,
    zone45: zone,
    zoneTarget: ZONE45_TARGET,
    zoneStatus,
    hrFlags: ws.filter(w => isNum(w.maxHr) && w.maxHr > HR_CEILING).map(w => ({ day: w.day, sport: w.sport || '', maxHr: w.maxHr })),
    scoredDays: days.filter(d => isNum(d.recovery)).length,
  }
}

/**
 * The diet log for the week: `dietDays` is { day: GET /api/health/diet answer }. Days with
 * nothing logged are left out of the average. null when no day was fetched.
 */
export function dietWeek(dietDays, from, today, proteinTarget) {
  if (!dietDays || typeof dietDays !== 'object') return null
  const days = daysOfWeek(from).filter(d => d <= today)
  const fetched = days.filter(d => dietDays[d])
  if (!fetched.length) return null
  const logged = fetched.filter(d => list(dietDays[d].entries).length > 0 || (dietDays[d].totals?.kcal || 0) > 0)
  const protein = logged.map(d => dietDays[d].totals?.protein)
  const hit = isNum(proteinTarget) ? logged.filter(d => (dietDays[d].totals?.protein || 0) >= proteinTarget).length : null
  const a = avg(protein)
  return { days: days.length, logged: logged.length, hit, target: isNum(proteinTarget) ? proteinTarget : null, avgProtein: isNum(a) ? Math.round(a) : null }
}

const isD3 = s => s?.schedule?.kind === 'phase' || /\b(d3|vitamin d)\b/i.test(String(s?.name || ''))

/**
 * Supplements taken against due, over the week's days so far (today only once marked, as
 * lib/supplements.js adherence counts it), with D3 on its own and the ones missed.
 */
export function supplementsWeek(supps, from, today) {
  if (!supps || !Array.isArray(supps.list)) return null
  const days = daysOfWeek(from).filter(d => d <= today)
  let due = 0, taken = 0
  const d3 = { due: 0, taken: 0 }
  const missed = []
  for (const s of supps.list) {
    let sDue = 0, sTaken = 0
    for (const d of days) {
      if (!dueOn(s, d)) continue
      const st = supps.log?.[d]?.[s.id]?.status
      if (d === today && !st) continue
      sDue++
      if (st === 'taken') sTaken++
    }
    due += sDue; taken += sTaken
    if (isD3(s)) { d3.due += sDue; d3.taken += sTaken }
    if (sDue > sTaken) missed.push({ id: s.id, name: s.name || s.id, due: sDue, taken: sTaken })
  }
  if (!due) return { due: 0, taken: 0, pct: null, d3: d3.due ? d3 : null, missed: [] }
  return { due, taken, pct: Math.round(taken / due * 100), d3: d3.due ? d3 : null, missed }
}

const fmtW = (w, unit) => (Math.round(w * 10) / 10) + ' ' + unit
const fmtH = min => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

/** One or two plain suggestions, the most useful first: { text, args } for t(). */
export function suggestionsOf(r, unit = 'kg') {
  const out = []
  const stalled = r.lifts.find(l => l.stalled)
  if (stalled) out.push({ id: 'stalled', text: '{0} stalled 2 weeks: drop {1} and build back', args: [stalled.name, fmtW(deloadStep(stalled.now.w, unit), unit)] })
  const w = r.whoop
  if (w?.hrFlags?.length) out.push({ id: 'hr', text: 'Heart rate went over {0} bpm ({1} bpm). Keep the hard rounds under the ceiling.', args: [HR_CEILING, Math.max(...w.hrFlags.map(f => f.maxHr))] })
  if (w && w.zoneStatus === 'over') out.push({ id: 'zone-over', text: '{0} min in zone 4 to 5 is over {1}. Make one cardio day easier.', args: [w.zone45, ZONE45_WARN] })
  if (w && w.zoneStatus === 'building' && w.zone45 != null) out.push({ id: 'zone-low', text: 'Only {0} min in zone 4 to 5. The Saturday intervals get you to 20 to 25.', args: [w.zone45] })
  const t = r.workouts
  if (t.planned && t.plannedDone < t.planned) out.push({ id: 'missed', text: '{0} of {1} planned days trained. Put the missed session early next week.', args: [t.plannedDone, t.planned] })
  const d = r.diet
  if (d && d.logged >= 3 && d.hit != null && d.hit < d.logged - 1) out.push({ id: 'protein', text: 'Protein target hit on {0} of {1} days. Add a whey scoop or curd on the low days.', args: [d.hit, d.logged] })
  if (w && isNum(w.trend) && w.trend <= -5) out.push({ id: 'recovery', text: 'Recovery fell {0} points on last week. Guard your sleep and keep the weights steady.', args: [Math.abs(w.trend)] })
  if (w && isNum(w.sleepMin) && w.sleepMin < SLEEP_GOAL_MIN) out.push({ id: 'sleep', text: 'Average sleep was {0}. Aim for 7 hours or more.', args: [fmtH(w.sleepMin)] })
  const sp = r.supplements
  if (sp?.d3 && sp.d3.taken < sp.d3.due) out.push({ id: 'd3', text: 'D3 taken {0} of {1} times. Take it with a fatty meal so it is not missed.', args: [sp.d3.taken, sp.d3.due] })
  if (!out.length) {
    const up = r.lifts.filter(l => l.status === 'up').length
    if (up) out.push({ id: 'keep', text: '{0} lifts went up. Keep the same plan next week.', args: [up] })
    else if (t.sessions) out.push({ id: 'solid', text: 'A steady week. Keep showing up.', args: [] })
  }
  return out.slice(0, 2)
}

/**
 * The whole review of the week starting `from` (a Monday): see the file comment. `health` is
 * { whoop, dietDays, supplements, proteinTarget }, each optional.
 */
export function weeklyReview(S, from, today, health = {}) {
  const to = addDays(from, 6)
  const lifts = liftChanges(S, from)
  const r = {
    key: reviewKey(from),
    from,
    to,
    current: from === mondayOf(today),
    workouts: workoutTally(S, from, today),
    lifts,
    progressed: lifts.filter(l => l.status === 'up'),
    stalled: lifts.filter(l => l.stalled),
    prs: weekPRs(S, from),
    gym: checkIns(S, from),
    whoop: whoopWeek(health.whoop, from),
    diet: dietWeek(health.dietDays, from, today, health.proteinTarget),
    supplements: supplementsWeek(health.supplements, from, today),
  }
  r.suggestions = suggestionsOf(r, S?.unit === 'lb' ? 'lb' : 'kg')
  return r
}
