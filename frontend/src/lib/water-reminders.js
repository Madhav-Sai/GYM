// Water reminders on the phone (this fork): a nudge to drink every 60, 90 or 120 minutes while you
// are awake, through the same Capacitor local notifications as the supplement and timing-plan
// reminders (lib/supp-reminders.js, lib/schedule-reminders.js), on an id range of their own: 7000 to
// 7199 (the workout reminder uses 1000 up, nudges 2000, supplements 4000, the timing plan 5000 to
// 5199, the monthly body check 6000 to 6099).
//
//   S.waterReminders = { on, every: 60 | 90 | 120, quietGym }   a plain synced setting, off by default
//
// The awake hours come from the daily timing plan (lib/day-schedule.js): from the wake row to the
// last row before the night's sleep row (or an hour before bed, when that row is earlier still), minus any sleep block in between (the 08:30 nap runs to its
// "Until 1 pm" note, else to the next row) and, while quietGym is on, the gym row (to "Until 07:15",
// else the next row). Each stretch gets its first reminder 15 minutes in, then one every interval.
//
// Pace: the day's target (lib/diet-plan.js TARGETS.waterMax, 3 L) spread evenly over the awake
// minutes, so by any time you "should" have drunk that share. Today's reminders are built from what
// is logged now: one where you are already on pace is left out, and none at all once the target is
// reached. Every water log and every open of the app rebuilds them (syncWaterReminders), so a
// reminder never asks for water already drunk. The next days, not logged yet, say what to aim for.
//
// iOS keeps only 64 pending notifications for the whole app, so this plans 3 days and at most 24.
import { MOBILE } from './mobile.js'
import { addDays, atIST, healthDay, healthMinutes, DAY_ROLLOVER_MIN } from './ist.js'
import { planFor, sortRows, dayMinutes, scheduleOf } from './day-schedule.js'
import { TARGETS } from './diet-plan.js'

export const WATER_ID_BASE = 7000
export const WATER_ID_COUNT = 200
export const WATER_ID_LAST = WATER_ID_BASE + WATER_ID_COUNT - 1
export const WATER_DAYS = 3
export const WATER_MAX_PENDING = 24
export const WATER_EVERY = [60, 90, 120]
export const WATER_EVERY_DEFAULT = 90
export const WATER_TARGET_ML = TARGETS.waterMax
export const GLASS_ML = 250
export const FIRST_AFTER_MIN = 15
const MAX_GLASSES = 3
const WIND_DOWN_MIN = 60
const MIN = 60000

/** The setting with its defaults: off, every 90 minutes, quiet during the gym. */
export function waterSettingsOf(S) {
  const w = S && typeof S.waterReminders === 'object' && S.waterReminders ? S.waterReminders : {}
  return { on: w.on === true, every: WATER_EVERY.includes(w.every) ? w.every : WATER_EVERY_DEFAULT, quietGym: w.quietGym !== false }
}

/**
 * The end a row's note gives ("Until 1 pm", "Until 07:15"), on the plan-day axis, or null. Only an
 * end after `start` counts.
 */
export function untilOf(note, start) {
  const m = /until\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(String(note || ''))
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] || 0)
  if (h > 23 || min > 59) return null
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0) }
  let v = h * 60 + min
  if (v < DAY_ROLLOVER_MIN) v += 1440
  return v > start ? v : null
}

// [a, b] intervals minus [c, d] intervals.
function subtract(spans, cuts) {
  let out = spans
  for (const [c, d] of cuts) {
    const next = []
    for (const [a, b] of out) {
      if (d <= a || c >= b) { next.push([a, b]); continue }
      if (c > a) next.push([a, c])
      if (d < b) next.push([d, b])
    }
    out = next
  }
  return out
}

/**
 * The awake hours of a plan, on the plan-day axis (minutes, after-midnight past 1440):
 * { wake, end, drink: [[a, b]], remind: [[a, b]] }. `drink` is every awake minute (the pace is spread
 * over it); `remind` leaves out the gym too while `quietGym` is on. Null for a plan with no rows.
 */
export function awakeWindows(plan, { quietGym = true } = {}) {
  const rows = sortRows(plan?.rows || []).map(r => ({ ...r, at: dayMinutes(r.time) })).filter(r => Number.isFinite(r.at))
  if (!rows.length) return null
  const wakeRow = rows.find(r => r.kind === 'wake') || rows[0]
  const wake = wakeRow.at
  const after = rows.filter(r => r.at > wake)
  // The night's sleep: the last sleep row of the day. The day ends at the row before it.
  let nightIdx = -1
  after.forEach((r, i) => { if (r.kind === 'sleep') nightIdx = i })
  let end
  if (nightIdx >= 0) {
    // The last row before bed, or an hour before bed when that row is long before it (a sparse plan).
    const bed = after[nightIdx].at
    const before = after.slice(0, nightIdx).filter(r => r.kind !== 'sleep')
    end = Math.max(before.length ? before[before.length - 1].at : wake, bed - WIND_DOWN_MIN)
    end = Math.min(end, bed)
  } else end = after.length ? after[after.length - 1].at : wake
  if (end <= wake) return null
  const blockOf = r => {
    const next = after.find(x => x.at > r.at)
    const stop = untilOf(r.note, r.at) ?? (next ? next.at : end)
    return [r.at, Math.min(stop, end)]
  }
  const inDay = r => r.at > wake && r.at < end
  const sleeps = after.filter((r, i) => r.kind === 'sleep' && i !== nightIdx && inDay(r)).map(blockOf)
  const gyms = quietGym ? rows.filter(r => r.kind === 'gym' && r.at >= wake && r.at < end).map(blockOf) : []
  const drink = subtract([[wake, end]], sleeps)
  return { wake, end, drink, remind: subtract(drink, gyms) }
}

/** The reminder minutes of a day: 15 minutes into each awake stretch, then every `every` minutes. */
export function reminderMinutes(win, every = WATER_EVERY_DEFAULT) {
  if (!win) return []
  const out = []
  for (const [a, b] of win.remind) {
    // The last stretch may end on its row (23:45 with the isabgol); one cut by sleep or the gym stops before it.
    const last = b === win.end ? b : b - 1
    for (let t = a + FIRST_AFTER_MIN; t <= last; t += every) out.push(t)
  }
  return out
}

/** How much of `target` you should have drunk by `t`: the share of the awake minutes gone by. */
export function expectedBy(win, t, target = WATER_TARGET_ML) {
  if (!win) return 0
  let total = 0, gone = 0
  for (const [a, b] of win.drink) { total += b - a; gone += Math.max(0, Math.min(b, t) - a) }
  return total ? Math.round(target * gone / total) : 0
}

const litres = ml => String(Math.round(Math.max(0, ml) / 100) / 10)
const glasses = ml => {
  const n = Math.min(MAX_GLASSES, Math.max(1, Math.ceil(ml / GLASS_ML)))
  return n === 1 ? `a glass (${GLASS_ML} ml)` : `${n} glasses (${n * GLASS_ML} ml)`
}

/** A reminder's text for `logged` ml so far (null: not known, a day not started) at the pace `expected`. */
export function waterMessage(logged, expected, target = WATER_TARGET_ML) {
  if (logged == null) return `Water: aim for ${litres(expected)} of ${litres(target)} L by now. Drink ${glasses(GLASS_ML)} if you are behind.`
  return `Water: ${litres(logged)} of ${litres(target)} L so far. Drink ${glasses(expected - logged)} now.`
}

/**
 * The notifications to queue from plan day `today` at instant `now`, with `water` ml logged today
 * (null when not known). Pure. Off, or with `S.waterReminders.on` false, nothing.
 */
export function buildWaterNotifications(S, water, today = healthDay(), now = new Date(), { target = WATER_TARGET_ML } = {}) {
  const set = waterSettingsOf(S)
  if (!set.on) return []
  const schedule = scheduleOf(S)
  const logged = typeof water === 'number' && Number.isFinite(water) ? Math.max(0, water) : null
  const out = []
  for (let offset = 0; offset < WATER_DAYS && out.length < WATER_MAX_PENDING; offset++) {
    const day = addDays(today, offset)
    const isToday = offset === 0
    // Today's target already reached: nothing more today.
    if (isToday && logged != null && logged >= target) continue
    const win = awakeWindows(planFor(schedule, day), set)
    const midnight = +atIST(day, '00:00')
    const nowMin = isToday ? healthMinutes(now) : -1
    for (const t of reminderMinutes(win, set.every)) {
      if (out.length >= WATER_MAX_PENDING) break
      const at = new Date(midnight + t * MIN)
      if (at <= now || (isToday && t <= nowMin)) continue
      const expected = expectedBy(win, t, target)
      const have = isToday ? logged : null
      // Already on pace for that time: no reminder.
      if (have != null && have >= expected) continue
      out.push({
        id: WATER_ID_BASE + out.length,
        title: 'Time to drink water',
        body: waterMessage(have, expected, target),
        schedule: { at, allowWhileIdle: true },
        extra: { water: true, to: '/diet' },
      })
    }
  }
  return out
}

/* ---------- the phone side ---------- */

let lastKey = null
let known = null   // { day, ml }: today's total from the last sync that had one

/** Today's water as the last sync saw it, or null. */
export function knownWater(day = healthDay()) { return known && known.day === day ? known.ml : null }

/**
 * Replace the queued water reminders from today's total. No-op off the phone. `interactive` may ask
 * permission (the switch turning on). Answers whether reminders are allowed.
 */
export async function syncWaterReminders(S, water, { interactive = false, now = new Date() } = {}) {
  const today = healthDay(now)
  if (typeof water === 'number' && Number.isFinite(water)) known = { day: today, ml: water }
  else water = knownWater(today)
  if (!MOBILE) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const notifications = buildWaterNotifications(S, water, today, now)
    const key = JSON.stringify(notifications.map(n => [n.id, +n.schedule.at, n.body]))
    if (key === lastKey && !interactive) return true
    await LocalNotifications.cancel({ notifications: Array.from({ length: WATER_ID_COUNT }, (_, k) => ({ id: WATER_ID_BASE + k })) }).catch(() => {})
    lastKey = null
    if (!waterSettingsOf(S).on) { lastKey = key; return true }
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && interactive) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return false
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    lastKey = key
    return true
  } catch { return false }
}

/** Whether a tapped notification is one of these. */
export const isWaterNotification = n => !!n && ((n.id >= WATER_ID_BASE && n.id <= WATER_ID_LAST) || n.extra?.water === true)

/** Calls cb() when a water reminder is tapped (the app then opens Diet). Returns a function that stops listening. */
export function onWaterReminderOpen(cb) {
  if (!MOBILE) return () => {}
  let handle = null
  let gone = false
  import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    Promise.resolve(LocalNotifications.addListener('localNotificationActionPerformed', e => {
      if (e?.actionId === 'dismiss' || !isWaterNotification(e?.notification)) return
      cb()
    })).then(h => { if (gone) h?.remove?.(); else handle = h })
  ).catch(() => {})
  return () => { gone = true; try { handle?.remove?.() } catch { /* gone already */ } }
}

export function _resetWaterReminders() { lastKey = null; known = null }
