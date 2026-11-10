import { describe, it, expect } from 'vitest'
import { buildScheduleNotifications, SCHED_ID_BASE, SCHED_ID_LAST } from './schedule-reminders.js'
import { SUPP_ID_BASE, SUPP_WINDOW_DAYS } from './supp-reminders.js'
import { defaultSchedule, editRow } from './day-schedule.js'
import { atIST } from './ist.js'

describe('timing plan reminders', () => {
  const on = { ...defaultSchedule(), remind: true }
  it('nothing while the switch is off', () => {
    expect(buildScheduleNotifications(defaultSchedule(), '2026-11-10', atIST('2026-11-10', '05:00'))).toEqual([])
  })
  it('a week of rows, India time, after-midnight rows on the next clock day, past ones skipped', () => {
    const n = buildScheduleNotifications(on, '2026-11-10', atIST('2026-11-10', '11:30'))
    // day 0 keeps the 9 rows after 11:30 (12:30 onwards, 01:30 included), then 6 full days of 12
    expect(n).toHaveLength(9 + 6 * 12)
    expect(n[0]).toMatchObject({ title: 'Post-gym protein' })
    expect(+n[0].schedule.at).toBe(+atIST('2026-11-10', '12:30'))
    const sleep = n.find(x => x.title === 'Sleep')
    expect(+sleep.schedule.at).toBe(+atIST('2026-11-11', '01:30'))
  })
  it('a row can opt out', () => {
    const s = editRow(on, on.plans[0].id, 'r12', { remind: false })
    expect(buildScheduleNotifications(s, '2026-11-10', atIST('2026-11-10', '05:00')).some(x => x.title === 'Sleep')).toBe(false)
  })
  it('ids stay in 5000 to 5199, clear of the supplement range', () => {
    const n = buildScheduleNotifications(on, '2026-11-10', atIST('2026-11-10', '05:00'))
    expect(Math.min(...n.map(x => x.id))).toBeGreaterThanOrEqual(SCHED_ID_BASE)
    expect(Math.max(...n.map(x => x.id))).toBeLessThanOrEqual(SCHED_ID_LAST)
    expect(SCHED_ID_LAST).toBeLessThanOrEqual(5199)
    expect(SUPP_ID_BASE + SUPP_WINDOW_DAYS * 20).toBeLessThanOrEqual(SCHED_ID_BASE)
    expect(new Set(n.map(x => x.id)).size).toBe(n.length)
  })
})
