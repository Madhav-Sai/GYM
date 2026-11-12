import { describe, it, expect } from 'vitest'
import {
  defaultSchedule, scheduleOf, dayMinutes, timeOf, sortRows, planFor, nowRow, nextRow, whereNow, fmtLeft,
  addRow, editRow, removeRow, moveRow, duplicatePlan, renamePlan, assignDays, toggleDay, removePlan, uncoveredDays,
  planDay, DEFAULT_PLAN_NAME,
} from './day-schedule.js'
import { atIST } from './ist.js'

const labels = p => p.rows.map(r => r.label)

describe('the default plan', () => {
  it('is the 6 am gym day with split sleep: gym, cardio and rest plans, wake to sleep in plan-day order', () => {
    const s = defaultSchedule()
    expect(s.plans.map(p => [p.id, p.days])).toEqual([['shift', [1, 2, 4, 5]], ['cardio', [3, 6]], ['rest', [0]]])
    expect(s.plans[0].name).toBe(DEFAULT_PLAN_NAME)
    expect(uncoveredDays(s)).toEqual([])
    expect(s.plans[0].rows.map(r => r.time)).toEqual(['05:15', '05:30', '06:00', '07:15', '07:30', '08:30', '13:15', '14:00', '17:00', '19:30', '22:00', '23:00', '23:45', '00:30'])
    expect(s.plans[0].rows.map(r => r.label).slice(0, 4)).toEqual(['Wake, 1 tsp soaked methi seeds + water', 'Black coffee (no food)', 'Gym', 'Post-gym whey'])
    expect(s.plans[0].rows.find(r => r.kind === 'gym')).toMatchObject({ time: '06:00', note: 'Until 07:15' })
    // two sleep blocks, both with the Whoop note
    const sleeps = s.plans[0].rows.filter(r => r.kind === 'sleep')
    expect(sleeps.map(r => r.time)).toEqual(['08:30', '00:30'])
    for (const r of sleeps) expect(r.note).toContain("Whoop's sleep consistency will read low; watch HRV and RHR instead")
    expect(s.plans[0].rows.find(r => r.time === '23:45').label).toBe('Isabgol + whey + magnesium')
    expect(s.plans[1].rows.find(r => r.kind === 'gym').label).toBe('Cardio')
    // the rest day: no gym, the whey with breakfast, the same meal times
    expect(s.plans[2].rows.some(r => r.kind === 'gym')).toBe(false)
    expect(s.plans[2].rows.find(r => r.time === '07:30').label).toBe('Breakfast, whey and omega-3')
    expect(planFor(s, '2026-11-08').id).toBe('rest')
    expect(planFor(s, '2026-11-11').id).toBe('cardio')
  })
  it('shows for a profile with none, or a broken one, and writes nothing', () => {
    expect(scheduleOf({})).toEqual(defaultSchedule())
    expect(scheduleOf({ daySchedule: 'x' })).toEqual(defaultSchedule())
    expect(scheduleOf({ daySchedule: { plans: [null, 4] } })).toEqual(defaultSchedule())
  })
  it('cleans a stored one: bad rows out, unknown kind to other, rows sorted, duplicate plan ids dropped', () => {
    const s = scheduleOf({ daySchedule: { plans: [
      { id: 'a', name: 'A', days: [1, 1, 9, 'x', 2], rows: [{ id: '1', time: '01:00', label: 'Sleep', kind: 'sleep' }, { id: '2', time: '25:00' }, { id: '3', time: '09:00', label: 'Up', kind: 'nap' }] },
      { id: 'a', name: 'dup', days: [], rows: [] },
    ], remind: true } })
    expect(s.plans).toHaveLength(1)
    expect(s.plans[0].days).toEqual([1, 2])
    expect(labels(s.plans[0])).toEqual(['Up', 'Sleep'])
    expect(s.plans[0].rows[0].kind).toBe('other')
    expect(s.remind).toBe(true)
  })
})

describe('plan-day time', () => {
  it('a day runs 04:00 to 04:00: after midnight sorts last', () => {
    expect(dayMinutes('04:00')).toBe(240)
    expect(dayMinutes('03:59')).toBe(1440 + 239)
    expect(dayMinutes('01:30')).toBeGreaterThan(dayMinutes('23:45'))
    expect(dayMinutes('nope')).toBe(Infinity)
    expect(timeOf(dayMinutes('01:30'))).toBe('01:30')
    expect(sortRows([{ time: '01:30' }, { time: '10:00' }, { time: '23:00' }]).map(r => r.time)).toEqual(['10:00', '23:00', '01:30'])
  })
  it('the plan day rolls over at 04:00 India time', () => {
    expect(planDay(atIST('2026-11-10', '03:59'))).toBe('2026-11-09')
    expect(planDay(atIST('2026-11-10', '04:00'))).toBe('2026-11-10')
  })
})

describe('now and next', () => {
  const plan = defaultSchedule().plans[0]
  it('the row that has started and the one after it', () => {
    expect(nowRow(plan, dayMinutes('06:30')).label).toBe('Gym')
    expect(nextRow(plan, dayMinutes('06:30')).label).toBe('Post-gym whey')
    expect(nowRow(plan, dayMinutes('06:00')).label).toBe('Gym')
    expect(nowRow(plan, dayMinutes('04:30'))).toBe(null)
    expect(nextRow(plan, dayMinutes('04:30')).label).toBe('Wake, 1 tsp soaked methi seeds + water')
    expect(nowRow(plan, dayMinutes('00:15')).label).toBe('Isabgol + whey + magnesium')
    expect(nextRow(plan, dayMinutes('00:15')).label).toBe('Sleep block 1')
  })
  it('whereNow reads the India clock and wraps to the next day after the last row', () => {
    const s = defaultSchedule()
    const a = whereNow(s, atIST('2026-11-10', '13:40'))
    expect(a.day).toBe('2026-11-10')
    expect(a.now.label).toBe('Lunch and omega-3')
    expect(a.next.label).toBe('Shift starts')
    expect(a.minutesLeft).toBe(20)
    const b = whereNow(s, atIST('2026-11-11', '02:00')) // still the 10th's plan day
    expect(b.day).toBe('2026-11-10')
    expect(b.now.label).toBe('Sleep block 1')
    expect(b.tomorrow).toBe(true)
    expect(b.next.label).toBe('Wake, 1 tsp soaked methi seeds + water')
    expect(b.minutesLeft).toBe(3 * 60 + 15)
  })
  it('formats the time left', () => {
    expect(fmtLeft(135)).toBe('2h 15m')
    expect(fmtLeft(120)).toBe('2h')
    expect(fmtLeft(45)).toBe('45m')
    expect(fmtLeft(null)).toBe('')
  })
})

describe('editing rows', () => {
  const s0 = defaultSchedule(), P = s0.plans[0].id
  it('adds in time order and refuses a bad time', () => {
    const s = addRow(s0, P, { time: '15:30', label: 'Tea', kind: 'meal' }, 'new')
    expect(labels(s.plans[0]).indexOf('Tea')).toBe(labels(s.plans[0]).indexOf('Shift starts') + 1)
    expect(addRow(s0, P, { time: '7pm' })).toBe(s0)
    expect(s0.plans[0].rows).toHaveLength(14) // input untouched
  })
  it('edits a row, re-sorting on a new time, and keeps the old time when the new one is bad', () => {
    const s = editRow(s0, P, 'r1', { time: '05:00', label: 'Alarm' })
    expect(s.plans[0].rows[0]).toMatchObject({ id: 'r1', time: '05:00', label: 'Alarm', kind: 'wake' })
    const late = editRow(s0, P, 'r1', { time: '23:50' })
    expect(labels(late.plans[0]).at(-2)).toBe('Wake, 1 tsp soaked methi seeds + water')
    expect(editRow(s0, P, 'r1', { time: 'x' }).plans[0].rows[0].time).toBe('05:15')
    expect(editRow(s0, P, 'r1', { remind: false }).plans[0].rows[0].remind).toBe(false)
  })
  it('removes a row', () => {
    expect(labels(removeRow(s0, P, 'r3').plans[0])).not.toContain('Gym')
  })
  it('moves a row into the neighbouring time slot', () => {
    const s = moveRow(s0, P, 'r5', -1) // Breakfast up
    const rows = s.plans[0].rows
    expect(rows[3]).toMatchObject({ label: 'Breakfast and omega-3', time: '07:15' })
    expect(rows[4]).toMatchObject({ label: 'Post-gym whey', time: '07:30' })
    expect(moveRow(s0, P, 'r1', -1).plans[0].rows).toEqual(s0.plans[0].rows)
  })
})

describe('several plans and their weekdays', () => {
  // one plan on every day, to start from
  const base = defaultSchedule()
  const s0 = { ...base, plans: [{ ...base.plans[0], days: [0, 1, 2, 3, 4, 5, 6] }] }, P = s0.plans[0].id
  it('duplicates a plan with no days, then gives it Sunday (taken off the first)', () => {
    const { schedule: d, id } = duplicatePlan(s0, P, 'Rest day', 'sun')
    expect(id).toBe('sun')
    expect(d.plans.map(p => p.name)).toEqual([DEFAULT_PLAN_NAME, 'Rest day'])
    expect(d.plans[1].days).toEqual([])
    expect(d.plans[1].rows).toEqual(d.plans[0].rows)
    const s = assignDays(d, 'sun', [0])
    expect(s.plans[0].days).toEqual([1, 2, 3, 4, 5, 6])
    expect(planFor(s, '2026-11-08').name).toBe('Rest day') // a Sunday
    expect(planFor(s, '2026-11-09').name).toBe(DEFAULT_PLAN_NAME)
    expect(planFor(s, 0).id).toBe('sun')
  })
  it('a weekday no plan lists falls back to the first plan', () => {
    const s = toggleDay(s0, P, 3)
    expect(uncoveredDays(s)).toEqual([3])
    expect(planFor(s, 3).id).toBe(P)
    expect(toggleDay(s, P, 3).plans[0].days).toContain(3)
  })
  it('renames, and keeps the last plan', () => {
    expect(renamePlan(s0, P, '  Morning shift ').plans[0].name).toBe('Morning shift')
    expect(renamePlan(s0, P, '').plans[0].name).toBe(DEFAULT_PLAN_NAME)
    expect(removePlan(s0, P)).toBe(s0)
    const { schedule: d } = duplicatePlan(s0, P, 'B', 'b')
    expect(removePlan(d, 'b').plans).toHaveLength(1)
  })
  it('round-trips through scheduleOf unchanged once stored', () => {
    const { schedule: d } = duplicatePlan(s0, P, 'B', 'b')
    const s = assignDays(d, 'b', [0, 6])
    expect(scheduleOf({ daySchedule: JSON.parse(JSON.stringify(s)) })).toEqual(s)
  })
})
