// Supplement reminders on the phone (our addition), through the same Capacitor local notifications
// as the workout reminder (lib/mobile.js syncReminder), on an id range of their own. Times are India
// time: D3 on its dose Sundays at 20:30, omega-3 at 10:15, isabgol at 23:45, magnesium at 00:45 (the
// night after, still the same health day). The next week is queued; every open of the Supplements
// screen or Home replaces it, and a dose already marked taken or skipped is not reminded.
import { MOBILE } from './mobile.js'
import { addDays, atIST, minutesOf, DAY_ROLLOVER_MIN } from './ist.js'
import { dueOn } from './supplements.js'

export const SUPP_ID_BASE = 4000
export const SUPP_WINDOW_DAYS = 7
const PER_DAY = 20

/** The notifications to queue from `today` (a health day) at instant `now`. Pure. */
export function buildSupplementNotifications(list, log, today, now = new Date()) {
  const out = []
  const active = (list || []).filter(s => s.active !== false && s.remind)
  for (let offset = 0; offset < SUPP_WINDOW_DAYS; offset++) {
    const day = addDays(today, offset)
    active.forEach((s, i) => {
      if (i >= PER_DAY || !dueOn(s, day) || log?.[day]?.[s.id]) return
      // 00:45 belongs to the health day before: its clock day is the next one
      const at = atIST(minutesOf(s.remind) < DAY_ROLLOVER_MIN ? addDays(day, 1) : day, s.remind)
      if (at <= now) return
      out.push({
        id: SUPP_ID_BASE + offset * PER_DAY + i,
        title: s.schedule?.kind === 'phase' ? 'Vitamin D3 tonight' : s.name,
        body: [s.dose, s.requiresFat ? 'Take it with a meal that has fat.' : '', s.warning || ''].filter(Boolean).join(' '),
        schedule: { at, allowWhileIdle: true },
      })
    })
  }
  return out
}

/** Replace the queued supplement reminders. No-op off the phone. `interactive` may ask permission. */
export async function syncSupplementReminders(list, log, today, interactive = false) {
  if (!MOBILE) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: Array.from({ length: SUPP_WINDOW_DAYS * PER_DAY }, (_, k) => ({ id: SUPP_ID_BASE + k })) }).catch(() => {})
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    const notifications = buildSupplementNotifications(list, log, today)
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    return true
  } catch { return false }
}
