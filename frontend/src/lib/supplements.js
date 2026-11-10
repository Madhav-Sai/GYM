// Supplements (our addition): which ones are due on a day, today's checklist, and the 30-day
// adherence. The list and the log come from GET /api/health/supplements; days are India-time health
// days (ist.js). A supplement is due from the day it was added (createdDay) and while it is active.
import { addDays, weekdayOf } from './ist.js'
import { isDoseDay, d3Phase } from './d3-phase.js'

export const ADHERENCE_DAYS = 30

/** Whether `s` is due on `day`. */
export function dueOn(s, day) {
  if (!s || s.active === false) return false
  const sch = s.schedule || { kind: 'daily' }
  if (sch.kind === 'phase') return isDoseDay(sch, day)
  if (s.createdDay && day < s.createdDay) return false
  if (sch.kind === 'weekly') return weekdayOf(day) === (sch.dow ?? 0)
  return true
}

/** The dose to take on a day type (whey: 2 scoops on training days, 1 otherwise). */
export const doseFor = (s, dayType) => s?.doseByDayType?.[dayType] || s?.dose || ''

/** Today's checklist: every active supplement due on `day`, with its status from the log. */
export function checklist(list, log, day, dayType) {
  const dayLog = log?.[day] || {}
  return (list || []).filter(s => dueOn(s, day)).map(s => ({
    s,
    dose: doseFor(s, dayType),
    status: dayLog[s.id]?.status || 'pending',
    reason: dayLog[s.id]?.reason || '',
  }))
}

/** How many on the checklist are still pending. */
export const pendingCount = items => items.filter(i => i.status === 'pending').length

/** One supplement's log, as { day: entry }. */
export const logOf = (log, id) => Object.fromEntries(Object.entries(log || {}).filter(([, d]) => d[id]).map(([day, d]) => [day, d[id]]))

/**
 * Taken / due over the last `days` days up to `today`. Today counts only once it is marked (the day
 * is not over); a skip counts as not taken. Phase doses before createdDay count too, since they were
 * on the schedule and can be marked afterwards. Null when nothing was due (drawn as a dash).
 */
export function adherence(s, log, today, days = ADHERENCE_DAYS) {
  let due = 0, taken = 0
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i)
    if (!dueOn(s, day)) continue
    const st = log?.[day]?.[s.id]?.status
    if (day === today && !st) continue
    due++
    if (st === 'taken') taken++
  }
  return due ? { due, taken, pct: Math.round((taken / due) * 100) } : null
}

/** The D3 phase of the first phase-scheduled supplement on the list, with it. */
export function phaseOf(list, log, today) {
  const s = (list || []).find(x => x.schedule?.kind === 'phase' && x.active !== false)
  return s ? { s, ...d3Phase(s.schedule, logOf(log, s.id), today) } : null
}

/** Fat to take a fat-soluble supplement with (omega-3, D3): about 5 to 10 g in the same meal is enough.
 *  Veg first; amounts are everyday portions with their rough fat. Milk alone (about 3 g a glass) is not. */
export const FAT_SOURCES = Object.freeze({
  veg: [
    ['10 to 12 almonds', '6 g'], ['2 to 3 walnut halves', '5 g'], ['1 tbsp peanut butter', '8 g'],
    ['1 tbsp pumpkin or flax seeds', '5 g'], ['50 g paneer', '10 g'], ['1 bowl full-fat curd', '5 g'],
    ['1 tsp ghee or oil (on a chapati, in sabzi or dal)', '5 g'],
  ],
  nonVeg: [['3 boiled eggs', '16 g'], ['Fish like mackerel or sardine', '10+ g']],
})
