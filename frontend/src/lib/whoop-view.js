// Whoop dashboard (our addition): the small pure rules its rings, trends and labels use.
// A value Whoop did not send stays null and is drawn as a dash (lib/whoop.js).

export const STEP_GOAL = 8000
export const STRAIN_MAX = 21
// Zone 0 to 5, cool to hot.
export const ZONE_INK = ['var(--label-4)', 'var(--blue)', 'var(--teal)', 'var(--green)', 'var(--orange)', 'var(--red)']

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
