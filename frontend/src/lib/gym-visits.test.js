import { describe, it, expect } from 'vitest'
import { canCheckIn, visitOn, visitDays, withVisit } from './gym-visits.js'
import { streakInfo } from './streak.js'

const TODAY = '2026-11-09' // a Monday

describe('which days can be checked in', () => {
  it('today and earlier, real dates only', () => {
    expect(canCheckIn('2026-11-09', TODAY)).toBe(true)
    expect(canCheckIn('2026-11-01', TODAY)).toBe(true)
    expect(canCheckIn('2026-11-10', TODAY)).toBe(false) // a check-in says you went
    expect(canCheckIn('nope', TODAY)).toBe(false)
    expect(canCheckIn(undefined, TODAY)).toBe(false)
  })
})

describe('check in and take it back', () => {
  it('sets, reads back and clears with a stamp (a delete would return from the other device)', () => {
    const a = withVisit({}, TODAY, true, 100, TODAY)
    expect(a[TODAY]).toEqual({ on: true, _ts: 100 })
    expect(visitOn({ gymVisits: a }, TODAY)).toBe(true)
    const b = withVisit(a, TODAY, false, 200, TODAY)
    expect(b[TODAY]).toEqual({ _ts: 200 })
    expect(TODAY in b).toBe(true)
    expect(visitOn({ gymVisits: b }, TODAY)).toBe(false)
  })
  it('refuses a future day and does not mutate its input', () => {
    const m = { '2026-11-01': { on: true, _ts: 1 } }
    const out = withVisit(m, '2026-12-01', true, 5, TODAY)
    expect(out).toBe(m)
    const out2 = withVisit(m, TODAY, true, 5, TODAY)
    expect(m).toEqual({ '2026-11-01': { on: true, _ts: 1 } })
    expect(Object.keys(out2)).toHaveLength(2)
  })
  it('tolerates a missing or junk map', () => {
    expect(visitOn({}, TODAY)).toBe(false)
    expect(visitOn({ gymVisits: [] }, TODAY)).toBe(false)
    expect(visitOn({ gymVisits: { [TODAY]: 'yes' } }, TODAY)).toBe(false)
    expect(visitDays({ gymVisits: { 'junk': { on: true }, [TODAY]: { on: true, _ts: 1 }, '2026-11-02': { _ts: 2 } } })).toEqual([TODAY])
    expect(withVisit(null, TODAY, true, 1, TODAY)[TODAY].on).toBe(true)
  })
})

describe('a check-in counts towards the streak', () => {
  const W = d => ({ id: d, d, start: 1, end: 2, name: 'x', exercises: [] })
  const base = { weekStart: 1, workouts: [] }
  it('a week with only a check-in is a trained week', () => {
    const none = streakInfo({ ...base }, TODAY)
    expect(none.current).toBe(0)
    const S = { ...base, gymVisits: { [TODAY]: { on: true, _ts: 1 } } }
    const info = streakInfo(S, TODAY)
    expect(info.current).toBe(1)
    expect(info.thisWeekDone).toBe(true)
  })
  it('check-ins and workouts in different weeks make one run', () => {
    const S = { ...base, workouts: [W('2026-11-03')], gymVisits: { [TODAY]: { on: true, _ts: 1 }, '2026-10-27': { on: true, _ts: 1 } } }
    expect(streakInfo(S, TODAY).current).toBe(3) // weeks of 27 Oct, 3 Nov, 9 Nov
  })
  it('a cleared check-in no longer counts', () => {
    const S = { ...base, gymVisits: { [TODAY]: { _ts: 9 } } }
    expect(streakInfo(S, TODAY).current).toBe(0)
  })
  it('a check-in in a week that has not started yet cannot count (and cannot be made)', () => {
    const S = { ...base, gymVisits: { '2026-11-20': { on: true, _ts: 1 } } }
    expect(streakInfo(S, TODAY).current).toBe(0)
  })
})
