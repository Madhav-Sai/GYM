import { describe, it, expect } from 'vitest'
import { defaultSchedule, scheduleOf, planFor, isOldPlan, isOldTimetable, offerSixAm, applySixAmTimetable, editRow } from './day-schedule.js'

// The old default (before November 2026): one "Shift 2pm-11pm" plan on every day.
const OLD_ROWS = [
  ['10:00', 'Wake up', 'wake'], ['10:15', 'Pre-gym meal, coffee and omega-3', 'meal'], ['11:00', 'Gym', 'gym'],
  ['12:30', 'Post-gym protein', 'meal'], ['13:00', 'Lunch', 'meal'], ['14:00', 'Shift starts', 'work'],
  ['17:00', 'Snack 1', 'meal'], ['20:00', 'Dinner (packed)', 'meal'], ['22:00', 'Snack 2', 'meal'],
  ['23:00', 'Shift ends', 'work'], ['23:45', 'Isabgol and protein', 'supp'], ['01:30', 'Sleep', 'sleep'],
]
const oldPlan = (id = 'shift', days = [0, 1, 2, 3, 4, 5, 6]) => ({
  id, name: 'Shift 2pm-11pm', days, rows: OLD_ROWS.map(([time, label, kind], i) => ({ id: 'r' + (i + 1), time, label, kind, note: '' })),
})
const extra = { id: 'pX', name: 'Night shift', days: [0], rows: [{ id: 'a', time: '18:00', label: 'Up', kind: 'wake', note: '' }, { id: 'b', time: '02:00', label: 'Bed', kind: 'sleep', note: '' }] }
const sixAmIds = s => s.plans.map(p => p.id)

describe('the old 11 am timetable', () => {
  it('is found in a stored schedule, edited or not', () => {
    expect(isOldTimetable({ daySchedule: { plans: [oldPlan()], remind: false } })).toBe(true)
    const edited = { plans: [{ ...oldPlan(), rows: oldPlan().rows.filter(r => r.kind !== 'wake') }] }
    expect(isOldTimetable({ daySchedule: edited })).toBe(true)   // the 11:00 gym is enough
  })
  it('is not the default shown before any edit, nor the 6 am plans', () => {
    expect(isOldTimetable({})).toBe(false)
    expect(isOldTimetable({ daySchedule: null })).toBe(false)
    expect(isOldTimetable({ daySchedule: defaultSchedule() })).toBe(false)
    // a 05:15 wake means the plan was already moved by hand
    const moved = { ...oldPlan(), rows: [...oldPlan().rows, { id: 'w', time: '05:15', label: 'Wake', kind: 'wake', note: '' }] }
    expect(isOldPlan(moved)).toBe(false)
    expect(isOldPlan(extra)).toBe(false)
  })
  it('is offered until Not now', () => {
    const S = { daySchedule: { plans: [oldPlan()] } }
    expect(offerSixAm(S)).toBe(true)
    expect(offerSixAm({ ...S, sixAmDismissed: true })).toBe(false)
    expect(offerSixAm({})).toBe(false)
  })
})

describe('switching to the 6 am timetable', () => {
  it('replaces the old plan with the gym, cardio and rest plans', () => {
    const next = applySixAmTimetable({ daySchedule: { plans: [oldPlan()], remind: true } })
    expect(sixAmIds(next)).toEqual(['shift', 'cardio', 'rest'])
    expect(next.plans.map(p => p.days)).toEqual([[1, 2, 4, 5], [3, 6], [0]])
    expect(next.remind).toBe(true)
    expect(planFor(next, '2026-11-10').rows[0]).toMatchObject({ time: '05:15', kind: 'wake' })
    expect(isOldTimetable({ daySchedule: next })).toBe(false)
  })
  it('keeps a plan the user made, on its own days, and drops copies of the old one', () => {
    const S = { daySchedule: { plans: [oldPlan(), oldPlan('pCopy', []), extra] } }
    const next = applySixAmTimetable(S)
    expect(sixAmIds(next)).toEqual(['shift', 'cardio', 'rest', 'pX'])
    expect(next.plans[3]).toEqual(extra)
    // Sunday is the user's night-shift plan now, taken off the rest plan
    expect(next.plans[2].days).toEqual([])
    expect(planFor(next, 0).id).toBe('pX')
    expect(S.daySchedule.plans).toHaveLength(3)   // the input is not changed
  })
  it('gives the same schedule when applied again', () => {
    const once = applySixAmTimetable({ daySchedule: { plans: [oldPlan(), extra], remind: false } })
    const twice = applySixAmTimetable({ daySchedule: once })
    expect(twice).toEqual(once)
    expect(scheduleOf({ daySchedule: JSON.parse(JSON.stringify(once)) })).toEqual(once)
  })
  it('a profile that never edited gets the default', () => {
    expect(applySixAmTimetable({})).toEqual(defaultSchedule())
  })
  it('a 6 am plan the user edited is reset to the default rows', () => {
    const s = editRow(defaultSchedule(), 'shift', 'r1', { time: '05:30' })
    expect(applySixAmTimetable({ daySchedule: s })).toEqual(defaultSchedule())
  })
})
