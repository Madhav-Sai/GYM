// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// myGym's health widgets (ios/App/OpenGymWidgets/MyGymWidgets.swift): the diet, supplements and
// "my day" blocks of the widget snapshot, and the Whoop block's week arrays. Anything unknown is
// null (a dash on the widget), never 0.
const h = vi.hoisted(() => { vi.stubEnv('VITE_MOBILE', '1'); return { calls: [], answers: {} } })
vi.mock('./mobile.js', () => ({ MOBILE: true, nativePlatform: async () => 'ios' }))
vi.mock('./api.js', () => ({
  api: async path => {
    h.calls.push(path)
    const key = Object.keys(h.answers).find(k => path.startsWith(k))
    const a = key ? h.answers[key] : undefined
    if (a instanceof Error || a === undefined) throw a || new Error('HTTP 404')
    return a
  },
}))

const { dietWidgetBlock, supplementsWidgetBlock, dayWidgetBlock, whoopWidgetBlock, buildWidgetSnapshot, startWidgetSync, _setWidgetPluginForTest, _resetWidgets } = await import('./widgets.js')

const totals = (o = {}) => ({ kcal: 1200, protein: 95.5, carbs: 100, fat: 40, fiber: 18, satFat: 0, omega3: 0, unknown: { satFat: 0, omega3: 0 }, ...o })

describe('dietWidgetBlock', () => {
  it('is null for anything that is not a day view', () => {
    for (const v of [null, undefined, 42, {}, { day: '2026-11-08' }, { totals: null }]) expect(dietWidgetBlock(v)).toBeNull()
  })

  it('has eaten and targets, water and protein left', () => {
    const b = dietWidgetBlock({ day: '2026-11-08', entries: [{}, {}], water: 1250, dayType: null, totals: totals() })
    expect(b).toMatchObject({
      day: '2026-11-08', dayType: 'rest',
      kcal: 1200, kcalTarget: 1800, protein: 95.5, proteinTarget: 160, proteinLeft: 65,
      fiber: 18, fiberTarget: 30, water: 1250, waterTarget: 2500, waterMax: 3000, entries: 2,
    })
  })

  it('keeps an unknown number null, and protein left never below 0', () => {
    const b = dietWidgetBlock({ day: '2026-11-09', totals: totals({ protein: 'x', fiber: undefined, kcal: NaN }) })
    expect(b.protein).toBeNull()
    expect(b.proteinLeft).toBeNull()
    expect(b.fiber).toBeNull()
    expect(b.kcal).toBeNull()
    expect(b.water).toBeNull()
    expect(b.entries).toBeNull()
    expect(b.dayType).toBe('training')
    expect(dietWidgetBlock({ day: '2026-11-09', totals: totals({ protein: 190 }) }).proteinLeft).toBe(0)
  })
})

describe('supplementsWidgetBlock', () => {
  const base = { active: true, createdDay: '2026-11-01' }
  const list = [
    { ...base, id: 'd3', name: 'Uprise-D3 60K', dose: '1 capsule', schedule: { kind: 'phase', start: '2026-10-04', weeklyDoses: 8, everyDays: 28, dow: 0 }, remind: '20:30' },
    { ...base, id: 'omega3', name: 'Omega 3', dose: '1 capsule', schedule: { kind: 'daily' }, remind: '10:15' },
    { ...base, id: 'isabgol', name: 'Isabgol', dose: '1 tsp', schedule: { kind: 'daily' }, remind: '23:45' },
    { ...base, id: 'whey', name: 'Whey', dose: '1 scoop', schedule: { kind: 'daily' }, remind: null, doseByDayType: { training: '2 scoops' } },
    { ...base, id: 'mag', name: 'Magnesium', dose: '1 tablet', schedule: { kind: 'daily' }, remind: '00:45' },
    { ...base, id: 'off', name: 'Old one', schedule: { kind: 'daily' }, remind: '09:00', active: false },
  ]

  it('is null for anything that is not a list', () => {
    expect(supplementsWidgetBlock(null, { day: '2026-11-08', minutes: 600 })).toBeNull()
    expect(supplementsWidgetBlock({ list: 'x' }, { day: '2026-11-08', minutes: 600 })).toBeNull()
  })

  it('lists today in health-day order, the next one due, pending and the D3 Sunday', () => {
    // 2026-11-08 is a Sunday, inside the weekly D3 phase (start 2026-10-04, 8 weekly doses).
    const log = { '2026-11-08': { omega3: { status: 'taken' }, isabgol: { status: 'skipped' } } }
    const b = supplementsWidgetBlock({ list, log }, { day: '2026-11-08', minutes: 12 * 60 })
    expect(b.items.map(i => i.id)).toEqual(['omega3', 'd3', 'isabgol', 'mag', 'whey'])
    expect(b.items[0]).toMatchObject({ name: 'Omega 3', time: '10:15', taken: true, skipped: false, d3: false })
    expect(b.items[2]).toMatchObject({ skipped: true, taken: false })
    expect(b.total).toBe(5)
    expect(b.pending).toBe(3)
    expect(b.next).toEqual({ name: 'Uprise-D3 60K', time: '20:30', overdue: false })
    expect(b.d3Due).toBe(true)
    expect(b.d3Taken).toBe(false)
  })

  it('on a day without D3, after the last timed one, points at what is still open', () => {
    const b = supplementsWidgetBlock({ list, log: {} }, { day: '2026-11-09', minutes: 25 * 60 })
    expect(b.d3Due).toBe(false)
    expect(b.d3Taken).toBeNull()
    expect(b.items.some(i => i.id === 'd3')).toBe(false)
    expect(b.next).toEqual({ name: 'Omega 3', time: '10:15', overdue: true })
    expect(b.items.find(i => i.id === 'whey').dose).toBe('2 scoops')
  })

  it('has no next when everything is done', () => {
    const log = { '2026-11-09': Object.fromEntries(['omega3', 'isabgol', 'whey', 'mag'].map(id => [id, { status: 'taken' }])) }
    const b = supplementsWidgetBlock({ list, log }, { day: '2026-11-09', minutes: 600 })
    expect(b.pending).toBe(0)
    expect(b.next).toBeNull()
  })
})

describe('dayWidgetBlock', () => {
  it('has the schedule only when the profile has one, sorted and cleaned', () => {
    expect(dayWidgetBlock({}, null)).toEqual({ workout: null })
    const S = { daySchedule: [{ time: '14:00', label: 'Shift' }, { time: '07:30', label: ' Gym ' }, { time: '25:00', label: 'bad' }, { time: '08:00', label: '' }, null, { time: '01:00', label: 'Sleep' }] }
    expect(dayWidgetBlock(S, null).schedule).toEqual([{ time: '07:30', label: 'Gym' }, { time: '14:00', label: 'Shift' }, { time: '01:00', label: 'Sleep' }])
  })

  it('has today’s workout with its first four lifts', () => {
    const ex = Array.from({ length: 6 }, (_, i) => ({ name: 'Lift ' + i, line: '3 × 5 · 60 kg' }))
    const b = dayWidgetBlock({}, { iso: '2026-11-10', name: 'Push', count: 6, ids: ['r1'], exercises: ex, done: false })
    expect(b.workout).toMatchObject({ name: 'Push', count: 6, done: false, ids: ['r1'] })
    expect(b.workout.lifts.map(l => l.name)).toEqual(['Lift 0', 'Lift 1', 'Lift 2', 'Lift 3'])
  })

  it('rides along in the snapshot', () => {
    const r = { id: 'r1', name: 'Push', ex: [{ id: 'c1', name: 'Cable thing', sets: 2, reps: 12, weight: 20 }] }
    const snap = buildWidgetSnapshot({ unit: 'kg', routines: [r], week: { 2: ['r1'] }, dayPlan: {}, workouts: [], bodyweight: [], daySchedule: [{ time: '10:00', label: 'Gym' }] }, { today: '2026-11-10' })
    expect(snap.day.schedule).toEqual([{ time: '10:00', label: 'Gym' }])
    expect(snap.day.workout).toMatchObject({ name: 'Push', count: 1 })
    expect(snap.day.workout.lifts[0].line).toMatch(/20 kg/)
  })
})

describe('whoopWidgetBlock week arrays', () => {
  it('carries hrv, rhr, sleep, steps and SpO2 for the last 7 days, null where Whoop sent none', () => {
    const days = Array.from({ length: 9 }, (_, i) => ({ day: '2026-11-0' + (i + 1), recovery: 50, hrv: 40 + i, rhr: 55, sleepMin: i === 8 ? null : 420, steps: 8000 + i, spo2: 97 }))
    const b = whoopWidgetBlock({ connected: true, today: { day: '2026-11-09' }, days })
    expect(b.hrvWeek).toEqual([42, 43, 44, 45, 46, 47, 48])
    expect(b.rhrWeek).toHaveLength(7)
    expect(b.sleepWeek[6]).toBeNull()
    expect(b.stepsWeek[0]).toBe(8002)
    expect(b.spo2Week[3]).toBe(97)
  })
})

describe('startWidgetSync health polling', () => {
  let state, subs, writes
  const useStore = { getState: () => state, subscribe: fn => { subs.push(fn); return () => {} } }
  beforeEach(() => {
    subs = []; writes = []; h.calls = []; h.answers = {}
    _setWidgetPluginForTest({ write: async ({ json }) => { writes.push(JSON.parse(json)) } })
  })
  afterEach(() => { vi.useRealTimers(); _resetWidgets() })
  const settle = async () => { for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1100) }

  it('asks nothing while signed out', async () => {
    vi.useFakeTimers()
    state = { S: { workouts: [] }, user: null }
    const stop = await startWidgetSync({ useStore })
    await settle()
    expect(h.calls).toEqual([])
    expect(writes.at(-1).diet).toBeUndefined()
    stop()
  })

  it('adds diet and supplements when signed in, and keeps them when a later pull fails', async () => {
    vi.useFakeTimers()
    state = { S: { workouts: [] }, user: { id: 'u1' }, config: {} }
    h.answers['/api/health/diet'] = { day: '2026-11-10', entries: [], water: 500, totals: totals({ protein: 40 }) }
    h.answers['/api/health/supplements'] = { list: [{ id: 'a', name: 'Omega 3', schedule: { kind: 'daily' }, remind: '10:15', active: true }], log: {} }
    const stop = await startWidgetSync({ useStore })
    await settle()
    expect(h.calls.some(p => p.startsWith('/api/health/diet?day='))).toBe(true)
    expect(h.calls).toContain('/api/health/supplements')
    expect(h.calls.some(p => p.startsWith('/api/whoop'))).toBe(false)
    const last = writes.at(-1)
    expect(last.diet).toMatchObject({ protein: 40, proteinLeft: 120, water: 500 })
    expect(last.supps.items[0].name).toBe('Omega 3')
    // offline: the next poll fails, the widget keeps the last numbers
    h.answers = {}
    const n = writes.length
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 2000)
    expect(writes.length).toBe(n)
    stop()
  })
})
