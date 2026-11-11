// Today's steps, and who counted them (our addition). Whoop's summary carries them
// (GET /api/whoop/summary `steps: { value, day, source: 'whoop' }`), but a Whoop cycle can come
// without a step count. Then, on the iPhone with Apple Health switched on, the count Apple Health
// has for today stands in (AppleHealthPlugin.readSteps, read in lib/health-sync.js
// readTodaySteps), and every place that shows steps says which of the two it is.
//
// Pure: the reading itself lives in health-sync.js; this only decides.

export const STEPS_WHOOP = 'whoop'
export const STEPS_APPLE = 'apple-health'

const isCount = v => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Whoop's own count when it has one, else Apple Health's, else nothing: { value, source }. */
export function pickSteps(whoop, apple) {
  if (isCount(whoop)) return { value: whoop, source: STEPS_WHOOP }
  if (isCount(apple)) return { value: Math.round(apple), source: STEPS_APPLE }
  return { value: null, source: null }
}

/** Whether a Whoop summary is worth asking Apple Health about: connected, a today, no step count. */
export const needsStepsFallback = s => !!(s && s.connected !== false && s.today && !isCount(s.steps?.value))

/**
 * The summary with Apple Health's count in `steps` when Whoop had none for today, marked with its
 * source; otherwise the summary unchanged (the same object).
 */
export function withStepsFallback(s, apple, today = null) {
  if (!needsStepsFallback(s)) return s
  const p = pickSteps(s.steps?.value, apple)
  if (p.source !== STEPS_APPLE) return s
  return { ...s, steps: { value: p.value, day: s.steps?.day || today || s.today?.day || null, source: STEPS_APPLE } }
}

/** Who counted: 'apple-health' | 'whoop' | null (no count at all). */
export const stepsSourceOf = s => (isCount(s?.steps?.value) ? (s.steps.source === STEPS_APPLE ? STEPS_APPLE : STEPS_WHOOP) : null)

/** The name shown beside the steps. Product names, the same in every language. */
export const stepsSourceLabel = source => (source === STEPS_APPLE ? 'Apple Health' : 'Whoop')

/** From local midnight of `now`'s day to `now`, in ms, for the Apple Health read. */
export function todayWindow(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return { from: d.getTime(), to: now }
}
