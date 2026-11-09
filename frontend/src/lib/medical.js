// Medical (this fork): blood tests, InBody scans and goals, read back for the Medical screens and
// the Home card. Pure helpers, no React, no store: the record comes from GET /api/medical
// (api/medical/store.js) and the body weight and waist from the profile's own state.
//
// The empty value is an en dash, never 0 (lib/empty-placeholder.test.js).

import { measurementValue } from './measurements.js'

export const DASH = '–'
const DAY = 86400000
export const RETEST_WEEKS = 12
export const RETEST_TEXT = 'Retest: vitamin D + lipid profile + InBody (not the full panel)'
const LB_PER_KG = 2.2046226218

const isNum = v => typeof v === 'number' && Number.isFinite(v)
const dayMs = iso => Date.parse(iso + 'T12:00:00Z')
export const daysBetween = (fromIso, toIso) => Math.round((dayMs(toIso) - dayMs(fromIso)) / DAY)
export const addDays = (iso, n) => new Date(dayMs(iso) + n * DAY).toISOString().slice(0, 10)

/** A number to its sensible precision, or the dash. */
export function fmtVal(v, dp) {
  if (!isNum(v)) return DASH
  const p = dp ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : Math.abs(v) >= 1 ? 2 : 3)
  return String(Number(v.toFixed(p)))
}

/** The marker's flag: the one the lab printed, or worked out from its range. */
export function markerFlag(m) {
  if (!m) return null
  if (m.flag) return m.flag
  if (!isNum(m.value)) return null
  const { lo, hi, below } = m.ref || {}
  if (isNum(below) && m.value < below) return 'deficient'
  if (isNum(lo) && m.value < lo) return 'low'
  if (isNum(hi) && m.value > hi) return 'high'
  return isNum(lo) || isNum(hi) ? 'normal' : null
}
export const FLAG_INK = { normal: 'var(--green)', high: 'var(--orange)', low: 'var(--orange)', deficient: 'var(--red)' }
export const FLAG_LABEL = { normal: 'Normal', high: 'High', low: 'Low', deficient: 'Deficient' }
export const isOff = m => { const f = markerFlag(m); return !!f && f !== 'normal' }

/** Where the value sits against its reference band, as 0..1 positions on one scale. */
export function refBar(m) {
  if (!m || !isNum(m.value)) return null
  const { lo, hi } = m.ref || {}
  if (!isNum(lo) && !isNum(hi)) return null
  const v = m.value
  // A one-sided band gets an open end as wide as the band side shown, so the bar reads either way.
  const a = isNum(lo) ? lo : 0
  const b = isNum(hi) ? hi : lo * 2
  const span = Math.max(b - a, Math.abs(b) * 0.1, 1e-9)
  let min = Math.min(a - span * 0.5, v), max = Math.max(b + span * 0.5, v)
  if (!isNum(lo)) min = Math.min(0, v)
  if (min < 0 && a >= 0 && v >= 0) min = 0
  const pos = x => (x - min) / (max - min || 1)
  return { min, max, lo: isNum(lo) ? pos(lo) : 0, hi: isNum(hi) ? pos(hi) : 1, value: pos(v), openLo: !isNum(lo), openHi: !isNum(hi) }
}

const sortByDate = list => [...(list || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

/** One marker across every test, oldest first: [{ d, t, y, flag }]. */
export function markerSeries(labs, key) {
  return sortByDate(labs).flatMap(l => {
    const m = (l.markers || []).find(x => x.key === key)
    return m && isNum(m.value) ? [{ d: l.date, t: dayMs(l.date), y: m.value, flag: markerFlag(m) }] : []
  })
}

/** The newest reading of a marker, with the test it came from. */
export function latestMarker(labs, key) {
  const list = sortByDate(labs)
  for (let i = list.length - 1; i >= 0; i--) {
    const m = (list[i].markers || []).find(x => x.key === key)
    if (m && (isNum(m.value) || m.text)) return { ...m, date: list[i].date, labId: list[i].id }
  }
  return null
}

/** The tracked markers first (their newest readings), then every other marker of the newest
 *  test, grouped by panel in the order the report lists them. */
export function labOverview(labs, tracked = []) {
  const cards = tracked.map(k => latestMarker(labs, k)).filter(Boolean)
  const newest = sortByDate(labs).at(-1)
  const seen = new Set(tracked)
  const panels = []
  for (const m of newest?.markers || []) {
    if (seen.has(m.key)) continue
    let p = panels.find(x => x.panel === m.panel)
    if (!p) { p = { panel: m.panel, markers: [], off: 0 }; panels.push(p) }
    p.markers.push(m)
    if (isOff(m)) p.off++
  }
  return { cards, panels, newest: newest || null }
}

/** Every marker the tests have used, newest test first, for the add form's starting rows. */
export function markerTemplate(labs) {
  const out = new Map()
  for (const l of sortByDate(labs).reverse()) for (const m of l.markers || []) {
    if (!out.has(m.key)) out.set(m.key, { key: m.key, name: m.name, panel: m.panel, unit: m.unit, ref: m.ref })
  }
  return [...out.values()]
}

/** Body weight in kg, oldest first, from the weigh-ins and the InBody scans together. */
export function weightPoints(bodyweight = [], unit = 'kg', inbody = []) {
  const byDay = new Map()
  for (const b of Array.isArray(bodyweight) ? bodyweight : []) {
    if (!b || !isNum(b.w) || typeof b.d !== 'string') continue
    byDay.set(b.d, unit === 'lb' ? b.w / LB_PER_KG : b.w)
  }
  for (const s of inbody || []) if (isNum(s.weight) && !byDay.has(s.date)) byDay.set(s.date, s.weight)
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, y]) => ({ d, t: dayMs(d), y: Math.round(y * 100) / 100 }))
}

/** Waist in cm, oldest first, from the profile's body measurements (lib/measurements.js stores cm). */
export function waistPoints(measurements = []) {
  return (Array.isArray(measurements) ? measurements : [])
    .map(e => ({ e, y: e && typeof e.d === 'string' ? measurementValue(e, 'waist') : null }))
    .filter(x => isNum(x.y) && x.y > 0)
    .sort((a, b) => (a.e.d < b.e.d ? -1 : 1))
    .map(({ e, y }) => ({ d: e.d, t: dayMs(e.d), y }))
}

/** One InBody field across every scan, oldest first. */
export function inbodySeries(inbody, field) {
  return sortByDate(inbody).filter(s => isNum(s[field])).map(s => ({ d: s.date, t: dayMs(s.date), y: s[field] }))
}

/** The value a goal stands at now: the newest test, scan or weigh-in that has it. */
export function goalCurrent(goal, { labs = [], inbody = [], bodyweight = [], unit = 'kg' } = {}) {
  if (!goal?.key) return null
  if (goal.key === 'weight') {
    const p = weightPoints(bodyweight, unit, inbody).at(-1)
    return p ? { value: p.y, date: p.d, source: 'weight' } : null
  }
  const [kind, k] = goal.key.split(':')
  if (kind === 'lab') {
    const m = latestMarker(labs, k)
    return m && isNum(m.value) ? { value: m.value, date: m.date, source: 'lab' } : null
  }
  if (kind === 'inbody') {
    const p = inbodySeries(inbody, k).at(-1)
    return p ? { value: p.y, date: p.d, source: 'inbody' } : null
  }
  return null
}

/** How far a goal has come. The target is a band [lo, hi] (either end open); progress runs from
 *  the start value to the nearest edge of the band, 0..1. */
export function goalProgress(goal, current, today) {
  const { start, lo, hi, by } = goal
  const cur = isNum(current) ? current : null
  const inBand = v => (!isNum(lo) || v >= lo) && (!isNum(hi) || v <= hi)
  // Going up if the start is below the band, down if above. A start already inside: hold it.
  const dir = isNum(start) && isNum(lo) && start < lo ? 'up' : isNum(start) && isNum(hi) && start > hi ? 'down' : 'hold'
  const edge = dir === 'up' ? lo : dir === 'down' ? hi : null
  let pct = null
  if (cur !== null) {
    if (inBand(cur)) pct = 1
    else if (edge !== null && isNum(start) && edge !== start) pct = Math.max(0, Math.min(1, (cur - start) / (edge - start)))
    else pct = 0
  }
  const daysLeft = by && today ? daysBetween(today, by) : null
  return {
    current: cur, dir, pct, met: cur !== null && inBand(cur),
    toGo: cur === null || inBand(cur) || edge === null ? 0 : Math.abs(edge - cur),
    daysLeft, overdue: daysLeft !== null && daysLeft < 0,
  }
}

/** The target as words: "30+", "<100", "18-20". */
export function targetText(goal) {
  const { lo, hi } = goal
  if (isNum(lo) && isNum(hi)) return `${fmtVal(lo)}-${fmtVal(hi)}`
  if (isNum(lo)) return `${fmtVal(lo)}+`
  if (isNum(hi)) return `<${fmtVal(hi)}`
  return DASH
}

/** Twelve weeks after the newest blood test: retest the markers that were off, not the whole
 *  panel. `due` once the day has come; `soon` in the week before. null with no test at all. */
export function retestReminder(labs, today, weeks = RETEST_WEEKS) {
  const last = sortByDate(labs).at(-1)
  if (!last || !today) return null
  const dueDate = addDays(last.date, weeks * 7)
  const daysUntil = daysBetween(today, dueDate)
  return { lastDate: last.date, dueDate, daysUntil, due: daysUntil <= 0, soon: daysUntil > 0 && daysUntil <= 7, text: RETEST_TEXT }
}

// The reading nearest a day, within `maxDays`.
function nearest(points, t, maxDays) {
  let best = null
  for (const p of points) if (Math.abs(p.t - t) <= maxDays * DAY && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p
  return best
}

/** Waist against weight over the same stretch. The pattern worth naming: the waist came down
 *  while the weight held, which is fat lost and muscle gained. Needs two waist readings at least
 *  `minDays` apart with a weigh-in within `matchDays` of each. */
export const RECOMP_TEXT = 'Waist dropping while weight holds = muscle gained and fat lost'
export function waistVsWeight(waist, weight, { minWaistDrop = 1, maxWeightMove = 1, minDays = 14, matchDays = 7 } = {}) {
  if (!Array.isArray(waist) || waist.length < 2 || !Array.isArray(weight) || !weight.length) return null
  const last = waist.at(-1)
  const first = waist.find(p => last.t - p.t >= minDays * DAY)
  if (!first) return null
  const w0 = nearest(weight, first.t, matchDays), w1 = nearest(weight, last.t, matchDays)
  if (!w0 || !w1 || w0 === w1) return null
  const waistDelta = Math.round((last.y - first.y) * 10) / 10
  const weightDelta = Math.round((w1.y - w0.y) * 10) / 10
  const recomp = waistDelta <= -minWaistDrop && Math.abs(weightDelta) <= maxWeightMove
  return { from: first.d, to: last.d, waistDelta, weightDelta, recomp, text: recomp ? RECOMP_TEXT : null }
}
