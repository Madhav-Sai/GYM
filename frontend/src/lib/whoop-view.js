// Whoop dashboard (our addition): the small pure rules its rings, trends and labels use.
// A value Whoop did not send stays null and is drawn as a dash (lib/whoop.js).

export const STEP_GOAL = 8000
export const STRAIN_MAX = 21
// Zone 0 to 5, cool to hot.
export const ZONE_INK = ['#4B5A66', '#3FA9F5', '#22D3EE', '#16EC06', '#FF9F0A', '#FF0026']
// The Whoop look: recovery green / yellow / red, strain blue, sleep blue-grey (views/whoop.css has the same as variables).
export const WH = { green: '#16EC06', yellow: '#FFDE00', red: '#FF0026', strain: '#0093E7', sleep: '#7BA1BB', hrv: '#16EC06', rhr: '#FF4D6A', steps: '#2EE6A8', dim: '#8A99A6' }
export const BAND_COLOR = { green: WH.green, yellow: WH.yellow, red: WH.red }

const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** Recovery band from the score: green 67+, yellow 34-66, red 33 and below; null without a score. */
export function bandOf(score) {
  if (!isNum(score)) return null
  return score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red'
}

/** The share of `max` that `v` fills, 0 to 1, or null when there is no value. */
export function pct(v, max) {
  if (!isNum(v) || !isNum(max) || max <= 0) return null
  return Math.max(0, Math.min(1, v / max))
}

/** Today against an average: arrow, difference and whether that is good. null without both. */
export function trendOf(now, avg, good = 'up') {
  if (!isNum(now) || !isNum(avg)) return null
  const d = Math.round((now - avg) * 10) / 10
  if (Math.abs(d) < 0.5) return { arrow: '→', text: 'at avg', tone: 'flat' }
  const up = d > 0
  return { arrow: up ? '↑' : '↓', text: (up ? '+' : '') + d + ' vs 30d', tone: up === (good === 'up') ? 'good' : 'bad' }
}

/** "01:42" in the phone's time zone, or a dash. */
export function clockOf(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '–'
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/** Whole minutes between two instants, or null. */
export function durMin(a, b) {
  const x = Date.parse(a), y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.round((y - x) / 60000) : null
}

// ---------------------------------------------------------------------------------------------
// The interactive dashboard: which day is shown, what a chart's axis is, what a tap on a ring
// opens. All pure, so the components only draw (WhoopDashboard.jsx).

export const GUIDANCE = {
  green: 'Green. Push for a PR today.',
  yellow: 'Yellow. Hit targets, do not force new weight.',
  red: "Red. Drop to last week's weight or make it a cardio day.",
}

const kcalOf = kj => (isNum(kj) ? Math.round(kj / 4.184) : null)
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "?day=2026-11-08" from the route, or null when it is not a real day. */
export function dayParam(v) {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return null
  return Number.isFinite(Date.parse(v + 'T12:00:00Z')) ? v : null
}

/** "Sun 8 Nov" (the calendar day itself, no time zone shift); a dash for nonsense. */
export function fmtDay(day, { weekday = true } = {}) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return '–'
  const d = new Date(day + 'T12:00:00Z')
  return (weekday ? WEEKDAYS[d.getUTCDay()] + ' ' : '') + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]
}
/** The two parts of a strip button: "Sun" and "8". */
export function dayParts(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return { wd: '–', dom: '–' }
  const d = new Date(day + 'T12:00:00Z')
  return { wd: WEEKDAYS[d.getUTCDay()], dom: String(d.getUTCDate()) }
}

/** Every day the dashboard can show, oldest first: the stored days, with today added when missing. */
function dayList(s) {
  const days = Array.isArray(s?.days) ? s.days : []
  const td = s?.today?.day
  if (td && !days.some(d => d.day === td)) return [...days, { day: td, recovery: s.today.recovery?.score ?? null }]
  return days
}

/** The strip of days at the top: the last `n`, oldest first, with each one's recovery band. */
export function dayStrip(s, n = 30) {
  return dayList(s).slice(-n).map(d => ({ day: d.day, recovery: isNum(d.recovery) ? d.recovery : null, band: bandOf(d.recovery) }))
}

/** The day before (`dir` -1) or after (+1) `day` that has data, or null at either end. */
export function shiftDay(s, day, dir) {
  const list = dayList(s).map(d => d.day)
  const at = list.indexOf(day || s?.today?.day)
  if (at < 0) return null
  return list[at + dir] ?? null
}

/** What the hero, the vitals and the sleep card draw for one day. No day, or today: what the server
 *  calls today (its recovery may be yesterday's, labelled with its own day). A past day: that day's
 *  row from `days`. A day Whoop has nothing for: null. Missing numbers stay null. */
export function dayView(s, day) {
  if (!s?.today) return null
  const td = s.today.day
  if (!day || day === td) {
    return {
      day: td, isToday: true,
      recovery: s.today.recovery || null, sleep: s.today.sleep || null, cycle: s.today.cycle || null,
      guidance: s.today.guidance || null, steps: s.steps?.value ?? null,
    }
  }
  const d = (s.days || []).find(x => x.day === day)
  if (!d) return null
  const n = v => (isNum(v) ? v : null)
  const band = bandOf(d.recovery)
  return {
    day, isToday: false,
    recovery: { score: n(d.recovery), hrv: n(d.hrv), rhr: n(d.rhr), spo2: n(d.spo2), skinTemp: n(d.skinTemp), day },
    sleep: {
      asleepMin: n(d.sleepMin), inBedMin: n(d.inBedMin), neededMin: n(d.neededMin), debtMin: n(d.debtMin),
      lightMin: n(d.lightMin), deepMin: n(d.deepMin), remMin: n(d.remMin), awakeMin: n(d.awakeMin),
      performance: n(d.performance), efficiency: n(d.efficiency), consistency: n(d.consistency),
      respRate: n(d.respRate), disturbances: n(d.disturbances), start: d.sleepStart ?? null, end: d.sleepEnd ?? null,
    },
    cycle: { strain: n(d.strain), kcal: kcalOf(d.kj), avgHr: n(d.avgHr), maxHr: n(d.maxHr) },
    guidance: band ? { band, text: GUIDANCE[band] } : null,
    steps: n(d.steps),
  }
}

/** One metric per day, oldest first. `kcal` comes from the day's kilojoules. */
export function seriesOf(days, key) {
  return (days || []).map(d => (key === 'kcal' ? kcalOf(d.kj) : key === 'sleep' ? (isNum(d.performance) ? d.performance : null) : (isNum(d[key]) ? d[key] : null)))
}

/** The `n` days that end on `day` (inclusive), oldest first; the last `n` when `day` is unknown. */
export function windowTo(days, day, n) {
  const list = days || []
  let end = day ? list.findIndex(d => d.day === day) : -1
  if (end < 0) end = list.length - 1
  return list.slice(Math.max(0, end - n + 1), end + 1)
}

/** min, max (with where), average and count of the numbers in `values`; nulls are skipped. */
export function statsOf(values) {
  let min = null, max = null, minI = -1, maxI = -1, sum = 0, n = 0
  ;(values || []).forEach((v, i) => {
    if (!isNum(v)) return
    if (min == null || v < min) { min = v; minI = i }
    if (max == null || v > max) { max = v; maxI = i }
    sum += v; n++
  })
  return { min, max, minI, maxI, n, avg: n ? Math.round((sum / n) * 10) / 10 : null }
}

/** Direction over the values (least squares): ↑ / ↓ / → and whether that is good. null under 3 points. */
export function trendArrow(values, good = 'up') {
  const pts = (values || []).map((v, i) => [i, v]).filter(p => isNum(p[1]))
  if (pts.length < 3) return null
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)
  const slope = sxx ? pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx : 0
  const change = slope * (pts[n - 1][0] - pts[0][0])
  const rel = my ? change / Math.abs(my) : change
  if (Math.abs(rel) < 0.03) return { arrow: '→', dir: 0, tone: 'flat' }
  const up = change > 0
  return { arrow: up ? '↑' : '↓', dir: up ? 1 : -1, tone: good === 'none' ? 'flat' : up === (good === 'up') ? 'good' : 'bad' }
}

/** The metrics a ring, a tile or the detail sheet can show. `meaning` is one line, an English key for t(). */
export const METRICS = {
  recovery: { key: 'recovery', label: 'Recovery', unit: '%', dp: 0, max: 100, good: 'up', meaning: 'How ready your body is for strain today, scored from HRV, resting heart rate, sleep, blood oxygen and skin temperature.' },
  strain: { key: 'strain', label: 'Strain', unit: '', dp: 1, max: STRAIN_MAX, good: 'none', meaning: 'How much load your heart and muscles took on over the day, from 0 to 21.' },
  sleep: { key: 'sleep', label: 'Sleep performance', unit: '%', dp: 0, max: 100, good: 'up', meaning: 'The sleep you got as a share of the sleep your body needed.' },
  hrv: { key: 'hrv', label: 'HRV', unit: ' ms', dp: 0, good: 'up', meaning: 'Heart rate variability while you slept. Higher than your normal usually means recovered.' },
  rhr: { key: 'rhr', label: 'Resting HR', unit: ' bpm', dp: 0, good: 'down', meaning: 'Your heart rate at rest during sleep. Lower than your normal usually means recovered.' },
  spo2: { key: 'spo2', label: 'Blood oxygen', unit: '%', dp: 1, good: 'up', meaning: 'How much oxygen your blood carried overnight. 95% and above is typical.' },
  skinTemp: { key: 'skinTemp', label: 'Skin temp', unit: ' °C', dp: 1, good: 'none', meaning: 'Skin temperature overnight. A jump away from your normal can mean illness or a hard day.' },
  respRate: { key: 'respRate', label: 'Respiratory rate', unit: ' /min', dp: 1, good: 'none', meaning: 'Breaths per minute while you slept. It stays steady unless something is off.' },
  kcal: { key: 'kcal', label: 'Calories', unit: ' kcal', dp: 0, good: 'none', meaning: 'Energy you burned over the whole day.' },
  avgHr: { key: 'avgHr', label: 'Average HR', unit: ' bpm', dp: 0, good: 'none', meaning: 'Your average heart rate over the day.' },
  maxHr: { key: 'maxHr', label: 'Max HR', unit: ' bpm', dp: 0, good: 'none', meaning: 'Your highest heart rate of the day. Keep it under 175 bpm.' },
}

/** Everything the detail sheet of a metric shows for `day`: the value, the 7 and 30-day averages that
 *  end on that day, the min and max over that range, and the series to chart. */
export function metricDetail(s, metric, day, range = 30) {
  const m = METRICS[metric]
  if (!m) return null
  const days = dayList(s)
  const win = windowTo(days, day, range)
  const values = seriesOf(win, m.key)
  const st = statsOf(values)
  const view = dayView(s, day)
  const value = !view ? null
    : metric === 'recovery' ? view.recovery?.score ?? null
    : metric === 'strain' ? view.cycle?.strain ?? null
    : metric === 'sleep' ? view.sleep?.performance ?? null
    : (view.recovery?.[metric] ?? view.sleep?.[metric] ?? view.cycle?.[metric] ?? null)
  return {
    ...m, day: view?.day ?? day, value: isNum(value) ? value : null,
    d7: statsOf(seriesOf(windowTo(days, day, 7), m.key)).avg, d30: statsOf(seriesOf(windowTo(days, day, 30), m.key)).avg,
    min: st.min, max: st.max, minDay: win[st.minI]?.day ?? null, maxDay: win[st.maxI]?.day ?? null,
    days: win.map(d => d.day), values,
  }
}

/** What fed the recovery score on `day`: each input against its own 30-day average.
 *  `rel` is value / average; `dev` is how far off the average it is, -1 to 1 where 1 is 25% above
 *  (drawn as a bar from a centre tick); `tone` says if that helps. */
export function contributors(s, day) {
  const view = dayView(s, day)
  if (!view) return []
  const win = windowTo(dayList(s), day, 30)
  const rows = [
    { k: 'hrv', label: 'HRV', unit: ' ms', dp: 0, good: 'up', value: view.recovery?.hrv },
    { k: 'rhr', label: 'Resting HR', unit: ' bpm', dp: 0, good: 'down', value: view.recovery?.rhr },
    { k: 'spo2', label: 'Blood oxygen', unit: '%', dp: 1, good: 'up', value: view.recovery?.spo2 },
    { k: 'skinTemp', label: 'Skin temp', unit: ' °C', dp: 1, good: 'none', value: view.recovery?.skinTemp },
    { k: 'performance', label: 'Sleep performance', unit: '%', dp: 0, good: 'up', value: view.sleep?.performance },
  ]
  return rows.map(r => {
    const avg = statsOf(seriesOf(win, r.k)).avg
    const value = isNum(r.value) ? r.value : null
    const rel = value != null && isNum(avg) && avg !== 0 ? Math.max(0.5, Math.min(1.5, value / avg)) : null
    let tone = 'flat'
    if (rel != null && Math.abs(value / avg - 1) >= 0.02 && r.good !== 'none') tone = (value > avg) === (r.good === 'up') ? 'good' : 'bad'
    const dev = rel != null ? Math.max(-1, Math.min(1, (value / avg - 1) / 0.25)) : null
    return { ...r, value, avg, rel, dev, tone }
  })
}

/** The four sleep stages with their minutes and share of the night; `pct` null without a total. */
export const STAGES = [
  { k: 'deepMin', label: 'Deep', ink: '#C86BFA', meaning: 'Deep sleep is when your body repairs muscle and tissue.' },
  { k: 'remMin', label: 'REM', ink: '#5AC8FA', meaning: 'REM sleep is when your brain sorts memories and learning.' },
  { k: 'lightMin', label: 'Light', ink: WH.sleep, meaning: 'Light sleep links the other stages and makes up most of the night.' },
  { k: 'awakeMin', label: 'Awake', ink: '#E8EDF0', meaning: 'Short wake-ups are normal; you rarely remember them.' },
]
export function stageParts(sleep) {
  const total = STAGES.reduce((a, x) => a + (isNum(sleep?.[x.k]) ? sleep[x.k] : 0), 0)
  return STAGES.map(x => {
    const min = isNum(sleep?.[x.k]) ? sleep[x.k] : null
    return { ...x, min, pct: min != null && total > 0 ? Math.round((min / total) * 100) : null }
  })
}

/** Minutes after midnight on the phone's clock, or null. */
export function clockMin(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}
/** A 24 h track that runs from 18:00 to 18:00, so a night sits in the middle: 0 to 1. */
export const TRACK_FROM = 18 * 60
export const trackPos = min => (isNum(min) ? (((min - TRACK_FROM) % 1440) + 1440) % 1440 / 1440 : null)

/** Bedtime and wake time for the `n` days that end on `day`: positions on the 18:00 track and clocks. */
export function bedTrack(s, day, n = 7) {
  return windowTo(dayList(s), day, n).map(d => {
    const a = clockMin(d.sleepStart), b = clockMin(d.sleepEnd)
    const from = trackPos(a), to = trackPos(b)
    return { day: d.day, from, to: from != null && to != null && to < from ? null : to, start: d.sleepStart ? clockOf(d.sleepStart) : null, end: d.sleepEnd ? clockOf(d.sleepEnd) : null }
  })
}

/** The workouts that count toward this week's zone 4-5 budget, oldest first, with their minutes. */
export function zoneContrib(s) {
  const from = s?.zone45?.weekStart
  if (!from) return []
  return (s.workouts || [])
    .filter(w => w.day >= from && isNum(w.zonesMin?.[4]) && isNum(w.zonesMin?.[5]) && w.zonesMin[4] + w.zonesMin[5] > 0)
    .map(w => ({ id: w.id, day: w.day, sport: w.sport || null, start: w.start, minutes: w.zonesMin[4] + w.zonesMin[5] }))
    .sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0))
}

/** The scale of a chart: bars start at 0 (or `min`), lines hug their data with a little room.
 *  `y(v)` is the share of the height from the top, 0 to 1. Average over the numbers shown. */
export function chartScale(values, { kind = 'bar', max, min, goal, marks } = {}) {
  const nums = (values || []).filter(isNum)
  const extra = [goal, ...(marks || [])].filter(isNum)
  let lo, hi
  if (kind === 'bar') {
    lo = isNum(min) ? min : 0
    hi = isNum(max) ? max : Math.max(1, ...nums, ...extra)
  } else {
    const all = [...nums, ...extra]
    const a = all.length ? Math.min(...all) : 0, b = all.length ? Math.max(...all) : 1
    const pad = (b - a) * 0.12 || Math.abs(a) * 0.05 || 1
    lo = isNum(min) ? min : a - pad; hi = isNum(max) ? max : b + pad
  }
  const span = hi - lo || 1
  const st = statsOf(values)
  return { lo, hi, avg: st.avg, min: st.min, max: st.max, y: v => (isNum(v) ? 1 - Math.max(0, Math.min(1, (v - lo) / span)) : null) }
}

/** The index under the pointer at `frac` (0 to 1 across the chart). Bars own a slot each; a line's
 *  points sit on the edges. */
export function indexAt(frac, n, kind = 'bar') {
  if (!(n > 0) || !Number.isFinite(frac)) return null
  const f = Math.max(0, Math.min(1, frac))
  return kind === 'bar' ? Math.min(n - 1, Math.floor(f * n)) : Math.round(f * (n - 1))
}
/** Where the centre of index `i` is across the chart, 0 to 1. */
export const xOf = (i, n, kind = 'bar') => (kind === 'bar' ? (i + 0.5) / n : n > 1 ? i / (n - 1) : 0.5)
