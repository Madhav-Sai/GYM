// HRV watch for the split sleep (our addition, the 6 am plan). Two sleep blocks make Whoop's sleep
// consistency read low whatever the hours, so the plan watches HRV and resting heart rate instead:
// if HRV sits under 45 ms on most days for two straight weeks, the split is costing more than the
// 6 am slot is worth. Pure: it reads the Whoop summary's days (GET /api/whoop/summary,
// days[] { day, hrv, rhr }, oldest first) and nothing else.

export const HRV_FLOOR = 45
export const HRV_WINDOW = 14
export const HRV_AVG_DAYS = 7
// "Most days": more than half of the scored days in the window, with enough of them scored to say so.
export const MIN_SCORED = 10
// Under 1 bpm either way is no trend.
export const RHR_FLAT = 1
export const HRV_ALERT_TEXT = 'HRV under 45 for two weeks: the split sleep may be costing more than the 6 am slot. Consider moving the gym back to a single sleep block.'

const DAY_MS = 86400000
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const dayMs = d => Date.parse(String(d) + 'T12:00:00Z')
const isoOf = ms => new Date(ms).toISOString().slice(0, 10)
const mean = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null)

/** The summary's days cleaned: a valid date each, sorted oldest first, one entry per day (the last wins). */
export function cleanDays(days) {
  const by = new Map()
  for (const d of Array.isArray(days) ? days : []) {
    if (!d || !Number.isFinite(dayMs(d.day))) continue
    by.set(d.day, { day: d.day, hrv: isNum(d.hrv) ? d.hrv : null, rhr: isNum(d.rhr) ? d.rhr : null })
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

// The days in the calendar window of `n` days ending on `end` (inclusive).
const windowOf = (days, end, n) => {
  const hi = dayMs(end), lo = hi - (n - 1) * DAY_MS
  return days.filter(d => { const m = dayMs(d.day); return m >= lo && m <= hi })
}

/** The rolling 7-day HRV average for every day that has data: [{ day, avg }], avg null when none of the 7 days was scored. */
export function rollingHrv(days, n = HRV_AVG_DAYS) {
  const list = cleanDays(days)
  return list.map(d => ({ day: d.day, avg: mean(windowOf(list, d.day, n).map(x => x.hrv).filter(isNum)) }))
}

/**
 * The alert: the 14 days ending on the newest day had HRV under the floor on most of the days
 * Whoop scored. Needs at least MIN_SCORED scored days and data reaching back to the window's
 * first days (within 3), so a new strap or a gap is never read as two bad weeks.
 * Returns { from, to, below, scored } or null.
 */
export function hrvAlert(days, { floor = HRV_FLOOR, window = HRV_WINDOW, minScored = MIN_SCORED } = {}) {
  const list = cleanDays(days).filter(d => isNum(d.hrv))
  if (!list.length) return null
  const to = list[list.length - 1].day
  const from = isoOf(dayMs(to) - (window - 1) * DAY_MS)
  const inWin = windowOf(list, to, window)
  if (inWin.length < minScored) return null
  if (dayMs(inWin[0].day) - dayMs(from) > 2 * DAY_MS) return null
  const below = inWin.filter(d => d.hrv < floor).length
  return below * 2 > inWin.length ? { from, to, below, scored: inWin.length } : null
}

/**
 * Resting heart rate: the last 14 days' average against the 14 before them.
 * { recent, previous, delta, dir: 'up' | 'down' | 'flat' }, or null with fewer than 5 readings on either side.
 */
export function rhrTrend(days, { window = HRV_WINDOW, minEach = 5 } = {}) {
  const list = cleanDays(days).filter(d => isNum(d.rhr))
  if (!list.length) return null
  const end = list[list.length - 1].day
  const recentDays = windowOf(list, end, window)
  const prevEnd = isoOf(dayMs(end) - window * DAY_MS)
  const prevDays = windowOf(list, prevEnd, window)
  if (recentDays.length < minEach || prevDays.length < minEach) return null
  const recent = mean(recentDays.map(d => d.rhr)), previous = mean(prevDays.map(d => d.rhr))
  const delta = Math.round((recent - previous) * 10) / 10
  return { recent, previous, delta, dir: Math.abs(delta) < RHR_FLAT ? 'flat' : delta > 0 ? 'up' : 'down' }
}

/** Everything the card shows: { avg7, below7, alert, rhr }, or null with no HRV or RHR at all. */
export function hrvWatch(days) {
  const list = cleanDays(days)
  if (!list.some(d => isNum(d.hrv) || isNum(d.rhr))) return null
  const roll = rollingHrv(list)
  const avg7 = roll.length ? roll[roll.length - 1].avg : null
  return { avg7, below7: avg7 != null && avg7 < HRV_FLOOR, alert: hrvAlert(list), rhr: rhrTrend(list) }
}
