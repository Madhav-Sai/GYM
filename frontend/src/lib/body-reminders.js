// Monthly body check-ins on Home (our addition): what is due of the three readings that tell fat loss
// from muscle gain. A progress photo when none was taken in 30 days, an InBody scan when the last one
// (GET /api/medical, `inbody`) is older than 30 days, and a waist measurement when none was logged in
// 14 days (lib/measurements.js). Pure, except syncBodyReminders, which queues an optional phone
// notification on the 1st of each month at 10:30 India time on ids 6000 to 6099 (the supplements
// use 4000 up, lib/supp-reminders.js).
import { MOBILE } from './mobile.js'
import { atIST, daysBetween } from './ist.js'
import { workoutMediaOf } from './media-refs.js'
import { dayPhotosOf } from './day-photos.js'
import { measurementValue } from './measurements.js'

export const PHOTO_DAYS = 30
export const INBODY_DAYS = 30
export const WAIST_DAYS = 14
export const BODY_ID_BASE = 6000
export const BODY_ID_COUNT = 100
export const BODY_MONTHS_AHEAD = 2
export const BODY_REMIND_AT = '10:30'
export const WAIST_NOTE = 'Waist + weight is how the app tells fat loss from muscle gain'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const latest = days => days.filter(d => typeof d === 'string' && ISO.test(d)).sort().at(-1) || null

/** The newest day with a progress photo: a still on a logged workout, or one filed under a day. */
export function lastPhotoDay(S) {
  const days = []
  for (const w of (S && S.workouts) || []) if (workoutMediaOf(w).some(m => m.kind !== 'video')) days.push(w.d)
  for (const p of dayPhotosOf(S)) if (p.m.kind !== 'video') days.push(p.d)
  return latest(days)
}

/** The newest InBody scan's date, or null. */
export const lastInbodyDay = inbody => latest((Array.isArray(inbody) ? inbody : []).map(s => s && s.date))

/** The newest day with a waist reading, or null. */
export function lastWaistDay(S) {
  const days = []
  for (const e of (S && Array.isArray(S.measurements) ? S.measurements : [])) if (measurementValue(e, 'waist') != null) days.push(e.d)
  return latest(days)
}

/**
 * What is due today, in a fixed order. `inbody` is the medical record's scan list; undefined (not
 * signed in, not loaded yet) leaves the InBody item out rather than nag about a record we cannot see.
 * Each item: { id, title, to, last, days, note? } with `days` since the last one (null for never).
 */
export function bodyReminders({ S, inbody, today }) {
  const out = []
  const item = (id, title, to, last, limit, extra = {}) => {
    const days = last ? daysBetween(last, today) : null
    if (days == null || days >= limit) out.push({ id, title, to, last, days, ...extra })
  }
  item('photo', 'Progress photo', '/progress-photos', lastPhotoDay(S), PHOTO_DAYS)
  if (inbody !== undefined) item('inbody', 'InBody scan', '/medical/inbody', lastInbodyDay(inbody), INBODY_DAYS)
  item('waist', 'Waist measurement', '/measurements', lastWaistDay(S), WAIST_DAYS, { note: WAIST_NOTE })
  return out
}

/** The 1st of each of the next `months` months (this month's too while 10:30 has not passed), 10:30 India time. */
export function buildBodyReminderNotifications(now = new Date(), months = BODY_MONTHS_AHEAD) {
  const out = []
  const ist = new Date(+now + 330 * 60000)
  let y = ist.getUTCFullYear(), m = ist.getUTCMonth()
  for (let k = 0; out.length < months && k <= months; k++) {
    const day = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const at = atIST(day, BODY_REMIND_AT)
    if (at > now) {
      out.push({
        id: BODY_ID_BASE + out.length,
        title: 'Monthly body check',
        body: `Progress photo, InBody scan and waist. ${WAIST_NOTE}.`,
        schedule: { at, allowWhileIdle: true },
      })
    }
    if (++m > 11) { m = 0; y++ }
  }
  return out
}

/** Queue (on) or clear (off) the monthly notifications. No-op off the phone. `interactive` may ask permission. */
export async function syncBodyReminders(on, interactive = false) {
  if (!MOBILE) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: Array.from({ length: BODY_ID_COUNT }, (_, k) => ({ id: BODY_ID_BASE + k })) }).catch(() => {})
    if (!on) return true
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    await LocalNotifications.schedule({ notifications: buildBodyReminderNotifications() })
    return true
  } catch { return false }
}
