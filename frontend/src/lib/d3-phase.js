// Vitamin D3 loading phase (our addition): `weeklyDoses` weekly doses from `start` (a Sunday), then
// one every `everyDays` days (28 by default: "monthly", kept on the same weekday) for good. Days are
// India-time 'YYYY-MM-DD' health days (ist.js). The dates are fixed: a missed dose stays missed and is
// never moved or doubled up on the next one (never double-dose to catch up).
import { addDays, daysBetween } from './ist.js'

/** Every dose day of a phase schedule up to and including `until`. */
export function doseDays(schedule, until) {
  const { start, weeklyDoses = 8, everyDays = 28 } = schedule || {}
  if (!start || until < start) return []
  const out = []
  for (let i = 0; i < weeklyDoses; i++) {
    const d = addDays(start, 7 * i)
    if (d > until) return out
    out.push(d)
  }
  const last = weeklyDoses > 0 ? addDays(start, 7 * (weeklyDoses - 1)) : addDays(start, -everyDays)
  for (let d = addDays(last, everyDays); d <= until; d = addDays(d, everyDays)) out.push(d)
  return out
}

/** The first dose day on or after `day`. */
export function nextDose(schedule, day) {
  const { start, weeklyDoses = 8, everyDays = 28 } = schedule || {}
  if (!start) return null
  if (day <= start) return start
  const weeklyEnd = addDays(start, 7 * (weeklyDoses - 1))
  if (weeklyDoses > 0 && day <= weeklyEnd) return addDays(start, Math.ceil(daysBetween(start, day) / 7) * 7)
  const from = weeklyDoses > 0 ? weeklyEnd : addDays(start, -everyDays)
  return addDays(from, Math.ceil(daysBetween(from, day) / everyDays) * everyDays)
}

export const isDoseDay = (schedule, day) => nextDose(schedule, day) === day

/**
 * Where the phase stands on `today`. `log` maps a day to that day's entry for this supplement
 * ({ status: 'taken' | 'skipped' }). Each weekly dose reads taken, skipped, missed, due or upcoming.
 */
export function d3Phase(schedule, log, today) {
  const { start, weeklyDoses = 8, everyDays = 28 } = schedule || {}
  const statusOf = d => {
    const s = log?.[d]?.status
    if (s === 'taken' || s === 'skipped') return s
    return d < today ? 'missed' : d === today ? 'due' : 'upcoming'
  }
  const weekly = Array.from({ length: weeklyDoses }, (_, i) => { const day = addDays(start, 7 * i); return { n: i + 1, day, status: statusOf(day) } })
  const weeklyEnd = weekly.length ? weekly[weekly.length - 1].day : start
  const phase = today > weeklyEnd ? 'monthly' : 'weekly'
  const monthly = doseDays(schedule, today).filter(d => d > weeklyEnd).map(day => ({ day, status: statusOf(day) }))
  const next = nextDose(schedule, today)
  const past = doseDays(schedule, addDays(today, -1))
  const lastPast = past.length ? past[past.length - 1] : null
  return {
    phase,
    weekly,
    taken: weekly.filter(w => w.status === 'taken').length,
    monthly,
    everyDays,
    next,
    dueToday: next === today,
    // the dose before today, when it went by without being taken: say "do not double up"
    missedLast: lastPast && statusOf(lastPast) === 'missed' ? lastPast : null,
  }
}
