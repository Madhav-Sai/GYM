import { describe, it, expect } from 'vitest'
import { smartDay, dayKind, smartDayOn, keptOn, withKept } from './smart-day.js'
import { mergeStates, stampEdits } from './sync-merge.js'

const lift = { id: 'r1', name: 'Lower A', planKey: 'lower-a', ex: [{ id: 'squat' }] }
const own = { id: 'r2', name: 'Push', ex: [{ id: 'bench' }] }
const steady = { id: 'r3', name: 'Steady cardio', planKey: 'steady', ex: [{ id: 'treadmill' }] }

describe('smart day', () => {
  it('reads the kind of day from the plan', () => {
    expect(dayKind([lift])).toBe('lift')
    expect(dayKind([own])).toBe('lift')
    expect(dayKind([steady])).toBe('cardio')
    expect(dayKind([])).toBe('rest')
    expect(dayKind([{ id: 'e', ex: [] }])).toBe('rest')
  })
  it('red on a lifting day: offer a rest-day diet, the easy cardio and keeping the plan', () => {
    const s = smartDay({ band: 'red', routines: [lift], dayType: 'training' })
    expect(s).toMatchObject({ band: 'red', kind: 'lift', lift: 'keep', dietDayType: 'rest', cardioKey: 'postLift', actions: ['diet', 'cardio', 'keep'] })
    expect(s.text).toMatch(/keep last week's weights/)
  })
  it('red with the diet already a rest day: no diet button', () => {
    expect(smartDay({ band: 'red', routines: [lift], dayType: 'rest' }).actions).toEqual(['cardio', 'keep'])
    expect(smartDay({ band: 'red', routines: [], dayType: 'rest' }).actions).toEqual(['keep'])
    expect(smartDay({ band: 'red', routines: [steady], dayType: 'cardio' }).actions).toEqual(['diet', 'cardio', 'keep'])
  })
  it('yellow: start, keep last week\'s weights; green: start, try a PR; neither changes the diet', () => {
    const y = smartDay({ band: 'yellow', routines: [lift], dayType: 'training' })
    expect(y).toMatchObject({ lift: 'hold', dietDayType: null, note: "Keep last week's weights", actions: ['start', 'keep'] })
    expect(y.text).toMatch(/no new weight/)
    const g = smartDay({ band: 'green', routines: [lift], dayType: 'training' })
    expect(g).toMatchObject({ lift: 'progress', note: 'Try a PR today', actions: ['start', 'keep'] })
    expect(g.text).toMatch(/progression/)
    expect(smartDay({ band: 'green', routines: [], dayType: 'rest' })).toMatchObject({ lift: null, note: null, actions: ['keep'] })
    // a cardio day starts too, with no lifting note
    expect(smartDay({ band: 'yellow', routines: [steady], dayType: 'cardio' })).toMatchObject({ note: null, actions: ['start', 'keep'] })
    // red never offers a start, and has no note
    expect(smartDay({ band: 'red', routines: [lift], dayType: 'training' })).toMatchObject({ note: null })
  })
  it('nothing without a band, when off, or once kept for today', () => {
    expect(smartDay({ band: null, routines: [lift] })).toBeNull()
    expect(smartDay({ band: 'purple', routines: [lift] })).toBeNull()
    expect(smartDay({ band: 'red', routines: [lift], on: false })).toBeNull()
    expect(smartDay({ band: 'red', routines: [lift], kept: true })).toBeNull()
  })
  it('the setting is on unless turned off', () => {
    expect(smartDayOn({})).toBe(true)
    expect(smartDayOn({ smartDay: true })).toBe(true)
    expect(smartDayOn({ smartDay: false })).toBe(false)
  })
  it('keeps a day, dropping days older than two weeks and junk', () => {
    const m = withKept({ '2026-10-01': true, '2026-11-05': true, junk: true, '2026-11-06': 'x' }, '2026-11-11')
    expect(m).toEqual({ '2026-11-05': true, '2026-11-11': true })
    expect(keptOn({ smartDayKept: m }, '2026-11-11')).toBe(true)
    expect(keptOn({ smartDayKept: m }, '2026-11-12')).toBe(false)
    expect(keptOn({}, '2026-11-11')).toBe(false)
    expect(withKept(null, '2026-11-11')).toEqual({ '2026-11-11': true })
  })
  it('the switch and the kept days sync as settings, the newest edit wins', () => {
    const a = { _ts: 1, smartDay: true, smartDayKept: {}, edited: {} }
    const phone = structuredClone(a)
    phone.smartDayKept = { '2026-11-11': true }
    stampEdits(a, phone, 100)
    const laptop = structuredClone(a)
    laptop.smartDay = false
    stampEdits(a, laptop, 200)
    const m = mergeStates(phone, laptop)
    expect(m.smartDayKept).toEqual({ '2026-11-11': true })
    expect(m.smartDay).toBe(false)
  })
})
