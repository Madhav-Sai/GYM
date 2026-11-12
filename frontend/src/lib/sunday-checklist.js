// The Sunday checklist (our addition, the 6 am plan): on the rest day, Home lists the four things
// the plan asks for. The ticks are a plain synced setting, S.sundayChecks = { [iso]: [id…] }, one
// list per Sunday, so a tick on the phone shows on the website. A weigh-in or a waist reading
// logged that day ticks its row by itself. Pure helpers; the card only draws.
import { measurementValue } from './measurements.js'

export const SUNDAY_ITEMS = ['weigh', 'waist', 'd3', 'plan']
// How many Sundays of ticks are kept; older ones are dropped when a new tick is written.
export const KEEP_SUNDAYS = 8

const dateOf = iso => new Date(String(iso) + 'T12:00:00Z')
const valid = iso => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(dateOf(iso).getTime())

/** Whether the day is a Sunday. */
export const isSunday = iso => valid(iso) && dateOf(iso).getUTCDay() === 0

/** Whether the day is the first Sunday of its month (the D3 capsule's day). */
export const isFirstSunday = iso => isSunday(iso) && dateOf(iso).getUTCDate() <= 7

/** The rows of that Sunday's checklist, in order: D3 only on the first Sunday of the month. */
export const sundayItems = iso => SUNDAY_ITEMS.filter(id => id !== 'd3' || isFirstSunday(iso))

/** Whether Home shows the list: a Sunday with nothing planned to train. */
export const showSundayChecklist = (iso, plannedCount = 0) => isSunday(iso) && !(plannedCount > 0)

/** The ids ticked by hand on that day. */
export function sundayTicks(S, iso) {
  const list = S?.sundayChecks && typeof S.sundayChecks === 'object' ? S.sundayChecks[iso] : null
  return Array.isArray(list) ? list.filter(id => SUNDAY_ITEMS.includes(id)) : []
}

/** Whether the app saw it done that day without a tick: a weigh-in, or a waist reading. */
export function autoDone(S, iso, id) {
  if (id === 'weigh') return (S?.bodyweight || []).some(b => b && b.d === iso)
  if (id === 'waist') return (S?.measurements || []).some(e => e && e.d === iso && measurementValue(e, 'waist') != null)
  return false
}

/** Each row with whether it is done: [{ id, done, auto }]. */
export function sundayChecklist(S, iso) {
  const ticks = sundayTicks(S, iso)
  return sundayItems(iso).map(id => {
    const auto = autoDone(S, iso, id)
    return { id, done: auto || ticks.includes(id), auto }
  })
}

/** Ticks or unticks one row in a state draft; keeps only the latest KEEP_SUNDAYS days. */
export function toggleSundayCheck(S, iso, id) {
  if (!valid(iso) || !SUNDAY_ITEMS.includes(id)) return
  const all = S.sundayChecks && typeof S.sundayChecks === 'object' && !Array.isArray(S.sundayChecks) ? { ...S.sundayChecks } : {}
  const cur = sundayTicks(S, iso)
  all[iso] = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
  const keep = Object.keys(all).filter(valid).sort().slice(-KEEP_SUNDAYS)
  S.sundayChecks = Object.fromEntries(keep.map(k => [k, all[k]]))
}
