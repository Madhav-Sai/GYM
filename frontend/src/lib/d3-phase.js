// Vitamin D3 loading phase (our addition): `weeklyDoses` weekly doses from `start` (a Sunday), then
// one every `everyDays` days (28 by default: "monthly", kept on the same weekday) for good. Days are
// India-time 'YYYY-MM-DD' health days (ist.js). The dates are fixed: a missed dose stays missed and is
// never moved or doubled up on the next one (never double-dose to catch up).
//
// Monthly may instead be `monthly: 'firstSunday'`: the first `dow` (Sunday) of each month. From
// `monthlyFrom` on, the weekly doses stop too; the days before it keep the schedule they had, so the
// history reads the same.
import { addDays, weekdayOf } from './ist.js'

/** The first `dow` (0 Sunday) of the month of 'YYYY-MM-DD'. */
export function firstDowOfMonth(day, dow = 0) {
  const d1 = day.slice(0, 7) + '-01'
  return addDays(d1, (dow - weekdayOf(d1) + 7) % 7)
}
const nextMonth = day => { const y = +day.slice(0, 4), mo = +day.slice(5, 7); return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01` }

/** Every dose day of a phase schedule up to and including `until`. */
export function doseDays(schedule, until) {
  const { start, weeklyDoses = 8, everyDays = 28, monthly, monthlyFrom, dow = 0 } = schedule || {}
  if (!start || until < start) return []
  const first = monthly === 'firstSunday'
  const cut = first ? (monthlyFrom || null) : null   // weekly and every-N doses stop here
  const before = d => d <= until && (!cut || d < cut)
  const out = []
  for (let i = 0; i < weeklyDoses; i++) {
    const d = addDays(start, 7 * i)
    if (!before(d)) break
    out.push(d)
  }
  const last = weeklyDoses > 0 ? addDays(start, 7 * (weeklyDoses - 1)) : addDays(start, -everyDays)
  if (!first || cut) for (let d = addDays(last, everyDays); before(d); d = addDays(d, everyDays)) out.push(d)
  if (first) {
    const from = cut && cut > start ? cut : (weeklyDoses > 0 ? addDays(last, 1) : start)
    for (let m = from; ; m = nextMonth(m)) {
      const d = firstDowOfMonth(m, dow)
      if (d > until) break
      if (d >= from) out.push(d)
    }
  }
  return out
}

/** The first dose day on or after `day`. */
export function nextDose(schedule, day) {
  const { start, everyDays = 28 } = schedule || {}
  if (!start) return null
  if (day <= start) return doseDays(schedule, start)[0] ?? doseDays(schedule, addDays(start, 42 + everyDays))[0] ?? null
  return doseDays(schedule, addDays(day, Math.max(everyDays, 42) + 7)).find(d => d >= day) ?? null
}

export const isDoseDay = (schedule, day) => nextDose(schedule, day) === day

/**
 * Where the phase stands on `today`. `log` maps a day to that day's entry for this supplement
 * ({ status: 'taken' | 'skipped' }). Each weekly dose reads taken, skipped, missed, due or upcoming.
 */
export function d3Phase(schedule, log, today) {
  const { start, weeklyDoses = 8, everyDays = 28, monthly: monthlyKind, monthlyFrom } = schedule || {}
  const firstSunday = monthlyKind === 'firstSunday'
  const statusOf = d => {
    const s = log?.[d]?.status
    if (s === 'taken' || s === 'skipped') return s
    return d < today ? 'missed' : d === today ? 'due' : 'upcoming'
  }
  // The weekly doses (those before monthlyFrom when the weekly stopped early).
  const weekly = Array.from({ length: weeklyDoses }, (_, i) => { const day = addDays(start, 7 * i); return { n: i + 1, day, status: statusOf(day) } })
    .filter(w => !(firstSunday && monthlyFrom && w.day >= monthlyFrom))
  const weeklyEnd = weekly.length ? weekly[weekly.length - 1].day : start
  const phase = today > weeklyEnd || (firstSunday && monthlyFrom && today >= monthlyFrom) ? 'monthly' : 'weekly'
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
    firstSunday,
    next,
    dueToday: next === today,
    // the dose before today, when it went by without being taken: say "do not double up"
    missedLast: lastPast && statusOf(lastPast) === 'missed' ? lastPast : null,
  }
}
