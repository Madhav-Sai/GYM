// Phone reminders for the daily timing plan (this fork, lib/day-schedule.js), through the same
// Capacitor local notifications as the supplement reminders (lib/supp-reminders.js), on an id range
// of their own: 5000 to 5199, seven days of up to 28 rows. Times are India time; a row before 04:00
// belongs to the plan day before, so its clock day is the next one. Off unless the schedule's switch
// is on; a row can opt out on its own (remind: false). Every open of the Schedule screen or Home
// replaces the queued week.
import { MOBILE } from './mobile.js'
import { addDays, atIST, minutesOf, DAY_ROLLOVER_MIN } from './ist.js'
import { planFor, sortRows, MAX_ROWS, KINDS } from './day-schedule.js'

export const SCHED_ID_BASE = 5000
export const SCHED_WINDOW_DAYS = 7
const PER_DAY = MAX_ROWS
export const SCHED_ID_LAST = SCHED_ID_BASE + SCHED_WINDOW_DAYS * PER_DAY - 1

const KIND_TITLE = { wake: 'Time to get up', meal: 'Time to eat', gym: 'Gym time', work: 'Work', supp: 'Supplements', sleep: 'Time for bed', other: 'Reminder' }

/** The notifications to queue from plan day `today` at instant `now`. Pure. */
export function buildScheduleNotifications(schedule, today, now = new Date()) {
  if (!schedule?.remind) return []
  const out = []
  for (let offset = 0; offset < SCHED_WINDOW_DAYS; offset++) {
    const day = addDays(today, offset)
    const rows = sortRows(planFor(schedule, day)?.rows || [])
    rows.slice(0, PER_DAY).forEach((r, i) => {
      if (r.remind === false) return
      const at = atIST(minutesOf(r.time) < DAY_ROLLOVER_MIN ? addDays(day, 1) : day, r.time)
      if (at <= now) return
      out.push({
        id: SCHED_ID_BASE + offset * PER_DAY + i,
        title: r.label || KIND_TITLE[KINDS.includes(r.kind) ? r.kind : 'other'],
        body: [r.time, r.note].filter(Boolean).join(' · '),
        schedule: { at, allowWhileIdle: true },
      })
    })
  }
  return out
}

/** Replace the queued schedule reminders. No-op off the phone. `interactive` may ask permission. */
export async function syncScheduleReminders(schedule, today, interactive = false) {
  if (!MOBILE) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: Array.from({ length: SCHED_WINDOW_DAYS * PER_DAY }, (_, k) => ({ id: SCHED_ID_BASE + k })) }).catch(() => {})
    if (!schedule?.remind) return true
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    const notifications = buildScheduleNotifications(schedule, today)
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    return true
  } catch { return false }
}
