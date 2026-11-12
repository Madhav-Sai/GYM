import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildWaterNotifications, awakeWindows, reminderMinutes, expectedBy, untilOf, waterSettingsOf, waterMessage,
  isWaterNotification, WATER_ID_BASE, WATER_ID_LAST, WATER_MAX_PENDING, WATER_DAYS,
} from './water-reminders.js'
import { SCHED_ID_LAST } from './schedule-reminders.js'
import { BODY_ID_BASE, BODY_ID_COUNT } from './body-reminders.js'
import { defaultSchedule, planFor, timeOf, editRow } from './day-schedule.js'
import { atIST } from './ist.js'

// The phone's notifications plugin, for syncWaterReminders below (the pure builders ignore MOBILE).
const ln = vi.hoisted(() => ({ cancel: vi.fn(() => Promise.resolve()), schedule: vi.fn(() => Promise.resolve()), checkPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })), requestPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })), addListener: vi.fn() }))
vi.mock('./mobile.js', () => ({ MOBILE: true }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }))

const S = (w = {}, extra = {}) => ({ waterReminders: { on: true, ...w }, ...extra })
const hhmm = n => timeOf(n)
// Tuesday 10 November 2026 is a gym day on the default plan.
const TUE = '2026-11-10'
const gymPlan = () => planFor(defaultSchedule(), TUE)
const todays = (list, day = TUE) => list.filter(n => n.schedule.at < atIST(day, '04:00').getTime() + 86400000)

describe('the setting', () => {
  it('is off by default, every 90 minutes, quiet during the gym', () => {
    expect(waterSettingsOf({})).toEqual({ on: false, every: 90, quietGym: true })
    expect(waterSettingsOf({ waterReminders: { on: true, every: 60, quietGym: false } })).toEqual({ on: true, every: 60, quietGym: false })
    expect(waterSettingsOf({ waterReminders: { on: true, every: 45 } }).every).toBe(90)
  })
  it('nothing is planned while it is off', () => {
    expect(buildWaterNotifications({}, 0, TUE, atIST(TUE, '05:00'))).toEqual([])
  })
})

describe('awake hours from the timing plan', () => {
  it('reads the end of a block from its note', () => {
    expect(untilOf('Until 1 pm. Dark room', 510)).toBe(780)
    expect(untilOf('Until 07:15', 360)).toBe(435)
    expect(untilOf('Until 12 am', 1300)).toBe(1440)
    expect(untilOf('nothing here', 0)).toBe(null)
    expect(untilOf('Until 5 am', 600)).toBe(null)   // before the start: ignored
  })
  it('the 6 am gym day: 05:15 to 23:45, without the gym and the 08:30 to 13:00 sleep', () => {
    const w = awakeWindows(gymPlan())
    expect(w.wake).toBe(5 * 60 + 15)
    expect(w.end).toBe(23 * 60 + 45)
    expect(w.drink.map(s => s.map(hhmm))).toEqual([['05:15', '08:30'], ['13:00', '23:45']])
    expect(w.remind.map(s => s.map(hhmm))).toEqual([['05:15', '06:00'], ['07:15', '08:30'], ['13:00', '23:45']])
  })
  it('keeps the gym when quiet during the gym is off', () => {
    const w = awakeWindows(gymPlan(), { quietGym: false })
    expect(w.remind).toEqual(w.drink)
  })
  it('every 90 minutes from 15 minutes into each stretch, never in sleep or the gym, never after 23:45', () => {
    const times = reminderMinutes(awakeWindows(gymPlan()), 90).map(hhmm)
    expect(times).toEqual(['05:30', '07:30', '13:15', '14:45', '16:15', '17:45', '19:15', '20:45', '22:15', '23:45'])
  })
  it('a sleep block without a note ends at the next row', () => {
    const plan = editRow(defaultSchedule(), 'shift', 'r6', { note: '' }).plans[0]
    const w = awakeWindows(plan)
    expect(w.drink.map(s => s.map(hhmm))).toEqual([['05:15', '08:30'], ['13:15', '23:45']])
  })
  it('the pace spreads the target over the awake minutes', () => {
    const w = awakeWindows(gymPlan())
    expect(expectedBy(w, w.wake)).toBe(0)
    expect(expectedBy(w, w.end)).toBe(3000)
    // 08:30 to 13:00 asleep: no water is due then
    expect(expectedBy(w, 8 * 60 + 30)).toBe(expectedBy(w, 13 * 60))
    expect(expectedBy(w, 8 * 60 + 30)).toBe(Math.round(3000 * 195 / 840))
  })
})

describe('the notifications', () => {
  it('the example message', () => {
    expect(waterMessage(1200, 1400)).toBe('Water: 1.2 of 3 L so far. Drink a glass (250 ml) now.')
    expect(waterMessage(500, 1100)).toBe('Water: 0.5 of 3 L so far. Drink 3 glasses (750 ml) now.')
    expect(waterMessage(0, 2900)).toMatch(/3 glasses \(750 ml\)/)   // never more than three at once
    expect(waterMessage(null, 1500)).toBe('Water: aim for 1.5 of 3 L by now. Drink a glass (250 ml) if you are behind.')
  })
  it('today from the total logged, then two more days, India time', () => {
    const n = buildWaterNotifications(S(), 0, TUE, atIST(TUE, '05:00'))
    const today = todays(n)
    expect(today.map(x => x.schedule.at.getTime())).toEqual(['05:30', '07:30', '13:15', '14:45', '16:15', '17:45', '19:15', '20:45', '22:15', '23:45'].map(h => +atIST(TUE, h)))
    expect(today[0].body).toBe('Water: 0 of 3 L so far. Drink a glass (250 ml) now.')
    expect(today[0].extra).toEqual({ water: true, to: '/diet' })
    // the next days have no total yet: they say what to aim for
    expect(n.at(-1).body).toMatch(/^Water: aim for/)
    expect(n.length).toBeLessThanOrEqual(WATER_MAX_PENDING)
    expect(WATER_DAYS).toBe(3)
    expect(+n.at(-1).schedule.at).toBeLessThan(+atIST('2026-11-13', '04:00'))
  })
  it('a reminder never asks for water already drunk: on pace means no reminder yet', () => {
    // 1.5 L by 13:00 is ahead of the pace until mid afternoon
    const n = todays(buildWaterNotifications(S(), 1500, TUE, atIST(TUE, '13:00')))
    const w = awakeWindows(gymPlan())
    for (const x of n) {
      const mins = Math.round((x.schedule.at - atIST(TUE, '00:00')) / 60000)
      expect(expectedBy(w, mins)).toBeGreaterThan(1500)
      expect(x.body).toMatch(/^Water: 1\.5 of 3 L so far/)
    }
    expect(n[0].schedule.at.getTime()).toBe(+atIST(TUE, '17:45'))
  })
  it('stops today once the target is reached', () => {
    const n = buildWaterNotifications(S(), 3000, TUE, atIST(TUE, '15:00'))
    expect(todays(n)).toEqual([])
    expect(n.length).toBeGreaterThan(0)   // tomorrow's are still there
  })
  it('past times are left out; after-midnight days land on the right clock day', () => {
    const n = buildWaterNotifications(S(), 250, TUE, atIST(TUE, '16:00'))
    expect(+n[0].schedule.at).toBe(+atIST(TUE, '16:15'))
    const wed = n.find(x => x.body.startsWith('Water: aim'))
    expect(+wed.schedule.at).toBe(+atIST('2026-11-11', '05:30'))
  })
  it('the interval and the gym switch change the times', () => {
    const every60 = todays(buildWaterNotifications(S({ every: 60 }), 0, TUE, atIST(TUE, '05:00')))
    expect(every60.length).toBeGreaterThan(10)
    const gym = todays(buildWaterNotifications(S({ quietGym: false }), 0, TUE, atIST(TUE, '05:00')))
    expect(gym.map(x => +x.schedule.at)).toContain(+atIST(TUE, '07:00'))
    const quiet = todays(buildWaterNotifications(S(), 0, TUE, atIST(TUE, '05:00')))
    for (const x of quiet) expect(x.schedule.at >= atIST(TUE, '06:00') && x.schedule.at < atIST(TUE, '07:15')).toBe(false)
  })
  it('never while asleep', () => {
    const n = buildWaterNotifications(S({ every: 60, quietGym: false }), 0, TUE, atIST(TUE, '04:30'))
    for (const x of n) {
      const clock = new Date(+x.schedule.at + 330 * 60000)
      const m = clock.getUTCHours() * 60 + clock.getUTCMinutes()
      expect(m > 8 * 60 + 30 && m < 13 * 60).toBe(false)   // the nap
      expect(m > 23 * 60 + 45 || m < 5 * 60 + 15).toBe(false)   // the night
    }
  })
  it('ids in 7000 to 7199, clear of every other reminder range, and unique', () => {
    const n = buildWaterNotifications(S({ every: 60, quietGym: false }), 0, TUE, atIST(TUE, '04:30'))
    expect(n).toHaveLength(WATER_MAX_PENDING)
    expect(new Set(n.map(x => x.id)).size).toBe(n.length)
    expect(Math.min(...n.map(x => x.id))).toBe(WATER_ID_BASE)
    expect(Math.max(...n.map(x => x.id))).toBeLessThanOrEqual(WATER_ID_LAST)
    expect(WATER_ID_LAST).toBe(7199)
    expect(SCHED_ID_LAST).toBeLessThan(WATER_ID_BASE)
    expect(BODY_ID_BASE + BODY_ID_COUNT).toBeLessThanOrEqual(WATER_ID_BASE)
  })
  it('a profile with its own plan uses it', () => {
    const own = { plans: [{ id: 'p', name: 'Day', days: [0, 1, 2, 3, 4, 5, 6], rows: [
      { id: 'a', time: '07:00', label: 'Up', kind: 'wake' },
      { id: 'b', time: '12:00', label: 'Lunch', kind: 'meal' },
      { id: 'c', time: '22:00', label: 'Bed', kind: 'sleep' },
    ] }] }
    const n = todays(buildWaterNotifications(S({ every: 120 }, { daySchedule: own }), 0, TUE, atIST(TUE, '05:00')))
    // an hour before bed when the last row is long before it
    expect(n.map(x => +x.schedule.at)).toEqual(['07:15', '09:15', '11:15', '13:15', '15:15', '17:15', '19:15'].map(h => +atIST(TUE, h)))
  })
  it('a tap is recognised by id or by its extra', () => {
    expect(isWaterNotification({ id: 7005 })).toBe(true)
    expect(isWaterNotification({ id: 9, extra: { water: true } })).toBe(true)
    expect(isWaterNotification({ id: 4001 })).toBe(false)
    expect(isWaterNotification(null)).toBe(false)
  })
})

describe('syncWaterReminders on the phone', () => {
  let mod
  beforeEach(async () => {
    mod = await import('./water-reminders.js')
    mod._resetWaterReminders()
    Object.values(ln).forEach(f => f.mockClear())
  })
  it('cancels the whole range and queues the new set; the same set is not queued twice', async () => {
    const now = atIST(TUE, '13:00')
    expect(await mod.syncWaterReminders(S(), 500, { now })).toBe(true)
    expect(ln.cancel.mock.calls[0][0].notifications).toHaveLength(200)
    const first = ln.schedule.mock.calls[0][0].notifications
    expect(first[0].body).toMatch(/^Water: 0\.5 of 3 L/)
    await mod.syncWaterReminders(S(), 500, { now })
    expect(ln.schedule).toHaveBeenCalledTimes(1)
    // a glass logged: rebuilt from the new total
    await mod.syncWaterReminders(S(), 750, { now })
    expect(ln.schedule).toHaveBeenCalledTimes(2)
    expect(ln.schedule.mock.calls[1][0].notifications[0].body).toMatch(/^Water: 0\.8 of 3 L/)
  })
  it('remembers the day total for a sync that has none (the Settings switch)', async () => {
    const now = atIST(TUE, '13:00')
    await mod.syncWaterReminders({}, 1000, { now })
    expect(mod.knownWater(TUE)).toBe(1000)
    await mod.syncWaterReminders(S(), null, { now, interactive: true })
    expect(ln.schedule.mock.calls[0][0].notifications[0].body).toMatch(/^Water: 1 of 3 L/)
  })
  it('off clears them and queues nothing', async () => {
    await mod.syncWaterReminders({ waterReminders: { on: false } }, 0, { now: atIST(TUE, '13:00') })
    expect(ln.cancel).toHaveBeenCalled()
    expect(ln.schedule).not.toHaveBeenCalled()
  })
  it('asks permission only when interactive', async () => {
    ln.checkPermissions.mockImplementationOnce(() => Promise.resolve({ display: 'prompt' }))
    expect(await mod.syncWaterReminders(S(), 0, { now: atIST(TUE, '13:00') })).toBe(false)
    expect(ln.requestPermissions).not.toHaveBeenCalled()
    ln.checkPermissions.mockImplementationOnce(() => Promise.resolve({ display: 'prompt' }))
    expect(await mod.syncWaterReminders(S(), 0, { now: atIST(TUE, '13:00'), interactive: true })).toBe(true)
    expect(ln.requestPermissions).toHaveBeenCalled()
  })
})
