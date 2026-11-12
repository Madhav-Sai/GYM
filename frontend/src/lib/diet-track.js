// The diet track (our addition): 'veg' (pure veg: no eggs, fish or chicken anywhere on the Diet
// screen, the Home card, the rules, the shopping list or the widgets) or 'nonveg', kept in the diet
// prefs on the server (api/health/diet.js setPrefs), with an optional veg challenge
// { start: 'YYYY-MM-DD', days: 40 }. The old prefs.veg switch reads as the track.
import { daysBetween } from './ist.js'

export const TRACKS = ['veg', 'nonveg']
export const CHALLENGE_DAYS = 40

const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'))

/** The track of the prefs: its own `track`, else the old `veg` true, else non-veg. */
export function trackOf(prefs) {
  if (TRACKS.includes(prefs?.track)) return prefs.track
  return prefs?.veg === true ? 'veg' : 'nonveg'
}
export const isVegTrack = prefs => trackOf(prefs) === 'veg'

/**
 * Where the veg challenge stands on `today`: { start, days, day, left, done } (day 1 is the start
 * day; done once the days are over), or null with no challenge, or when the track is not veg.
 */
export function challengeOf(prefs, today) {
  const c = prefs?.vegChallenge
  if (!c || !isDay(c.start) || !isDay(today) || trackOf(prefs) !== 'veg') return null
  const days = Number.isInteger(c.days) && c.days > 0 ? c.days : CHALLENGE_DAYS
  const day = daysBetween(c.start, today) + 1
  if (day < 1) return null
  return { start: c.start, days, day: Math.min(day, days), left: Math.max(0, days - day), done: day > days }
}

/** The line to show for a challenge: [i18n key, ...args], or null. */
export function challengeLine(ch) {
  if (!ch) return null
  return ch.done ? ['{0} days done: stay veg or switch back?', ch.days] : ['Pure veg: day {0} of {1}', ch.day, ch.days]
}

/* The bodies POST /api/health/diet/prefs takes for each button. */
export const startChallengeBody = (today, days = CHALLENGE_DAYS) => ({ track: 'veg', vegChallenge: { start: today, days } })
export const stayVegBody = () => ({ track: 'veg', vegChallenge: null })
/** The track switch. Going back to non-veg ends a challenge; going veg keeps whatever is set. */
export const trackBody = track => (track === 'veg' ? { track: 'veg' } : { track: 'nonveg', vegChallenge: null })

export const B12_NOTE = 'Pure veg for 40 days: B12 retest in 3 months (it was 403). Below 250: B12 1500 mcg weekly.'
export const ALGAL_NOTE = 'Prefer fully vegetarian? Algal omega-3 gives the same EPA+DHA.'
