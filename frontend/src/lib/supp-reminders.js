// Supplement reminders on the phone (our addition), through the same Capacitor local notifications
// as the workout reminder (lib/mobile.js syncReminder), on an id range of their own. Times are India
// time, as each supplement's `remind` (the 6 am training plan, api/health/supplements.js round 2):
// D3 on its first Sunday at 23:00 with dinner, omega-3 with each meal at 07:30, 13:15 and 23:00 (three
// items, three reminders), whey at 07:15 after the gym, isabgol and magnesium at 23:45. A time before
// 04:00 belongs to the health day before (DAY_ROLLOVER_MIN). The next two days are queued (iOS keeps only 64 pending
// notifications per app), plus the next date of each weekly or monthly dose; every open of the Supplements
// screen or Home replaces it, and a dose already marked taken or skipped is not reminded.
import { MOBILE } from './mobile.js'
import { addDays, atIST, minutesOf, DAY_ROLLOVER_MIN } from './ist.js'
import { dueOn } from './supplements.js'

export const SUPP_ID_BASE = 4000
// iOS keeps only 64 pending notifications per app; every reminder kind replans on each open, so a short window is enough.
export const SUPP_WINDOW_DAYS = 2
const PER_DAY = 20
// A weekly or monthly dose (D3 on the first Sunday) is too rare for a two-day window: its next date,
// up to LONG_LOOKAHEAD days out, is queued on ids of its own after the daily ones.
const LONG_LOOKAHEAD = 40
// Builds before the window shrank queued up to 7 days on these ids; clearing them all removes stale ones.
const CANCEL_IDS = 7 * PER_DAY

const note = (s, at, id) => ({
  id,
  title: s.schedule?.kind === 'phase' ? 'Vitamin D3 tonight' : s.name,
  body: [s.dose, s.requiresFat ? 'Take it with a meal that has fat.' : '', s.warning || ''].filter(Boolean).join(' '),
  schedule: { at, allowWhileIdle: true },
})
const atFor = (s, day) => atIST(minutesOf(s.remind) < DAY_ROLLOVER_MIN ? addDays(day, 1) : day, s.remind)
const isDaily = s => !s.schedule || s.schedule.kind === 'daily'

/** The notifications to queue from `today` (a health day) at instant `now`. Pure. */
export function buildSupplementNotifications(list, log, today, now = new Date()) {
  const out = []
  const active = (list || []).filter(s => s.active !== false && s.remind)
  for (let offset = 0; offset < SUPP_WINDOW_DAYS; offset++) {
    const day = addDays(today, offset)
    active.forEach((s, i) => {
      if (i >= PER_DAY || !isDaily(s) || !dueOn(s, day) || log?.[day]?.[s.id]) return
      // 00:45 belongs to the health day before: its clock day is the next one
      const at = atFor(s, day)
      if (at > now) out.push(note(s, at, SUPP_ID_BASE + offset * PER_DAY + i))
    })
  }
  active.forEach((s, i) => {
    if (i >= PER_DAY || isDaily(s)) return
    for (let offset = 0; offset < LONG_LOOKAHEAD; offset++) {
      const day = addDays(today, offset)
      if (!dueOn(s, day) || log?.[day]?.[s.id]) continue
      const at = atFor(s, day)
      if (at <= now) continue
      out.push(note(s, at, SUPP_ID_BASE + SUPP_WINDOW_DAYS * PER_DAY + i))
      return
    }
  })
  return out
}

/** Replace the queued supplement reminders. No-op off the phone. `interactive` may ask permission. */
export async function syncSupplementReminders(list, log, today, interactive = false) {
  if (!MOBILE) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: Array.from({ length: CANCEL_IDS }, (_, k) => ({ id: SUPP_ID_BASE + k })) }).catch(() => {})
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    const notifications = buildSupplementNotifications(list, log, today)
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    return true
  } catch { return false }
}
