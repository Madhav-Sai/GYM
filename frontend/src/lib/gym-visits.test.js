import { describe, it, expect } from 'vitest'
import { canCheckIn, visitOn, visitDays, withVisit, visitOf, withVisitDetails, checkInDay, monthVisits, recentCentres } from './gym-visits.js'
import { mergeStates, stampEdits, stampChange } from './sync-merge.js'
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

describe('which Cult centre, and a note', () => {
  it('details check the day in, and empty text clears one', () => {
    const m = withVisitDetails({}, TODAY, { centre: ' Cult Indiranagar ', note: 'Leg day, packed' }, 10, TODAY)
    expect(visitOf({ gymVisits: m }, TODAY)).toEqual({ on: true, centre: 'Cult Indiranagar', note: 'Leg day, packed' })
    const m2 = withVisitDetails(m, TODAY, { centre: 'Cult Indiranagar', note: '' }, 11, TODAY)
    expect(visitOf({ gymVisits: m2 }, TODAY)).toEqual({ on: true, centre: 'Cult Indiranagar' })
    expect(withVisitDetails(m, '2026-12-01', { centre: 'x' }, 12, TODAY)).toBe(m)
  })
  it('checking in again keeps the details; taking it back drops them', () => {
    const m = withVisitDetails({}, TODAY, { centre: 'Cult HSR' }, 10, TODAY)
    expect(withVisit(m, TODAY, true, 20, TODAY)[TODAY]).toEqual({ on: true, centre: 'Cult HSR', _ts: 20 })
    const off = withVisit(m, TODAY, false, 30, TODAY)
    expect(off[TODAY]).toEqual({ _ts: 30 })
    expect(visitOf({ gymVisits: off }, TODAY)).toBe(null)
    expect(withVisit(off, TODAY, true, 40, TODAY)[TODAY]).toEqual({ on: true, _ts: 40 })
  })
  it('suggests recent centres, newest first, each once', () => {
    const S = { gymVisits: {
      '2026-11-01': { on: true, centre: 'Cult HSR', _ts: 1 }, '2026-11-03': { on: true, centre: 'cult hsr', _ts: 1 },
      '2026-11-05': { on: true, centre: 'Cult Koramangala', _ts: 1 }, '2026-11-06': { _ts: 2, centre: 'Old' },
    } }
    expect(recentCentres(S)).toEqual(['Cult Koramangala', 'cult hsr'])
  })
})

describe('the check-in day rolls over at 04:00', () => {
  it('a check-in at 01:30 is still the evening before', () => {
    expect(checkInDay(new Date(2026, 10, 10, 1, 30))).toBe('2026-11-09')
    expect(checkInDay(new Date(2026, 10, 10, 4, 0))).toBe('2026-11-10')
    expect(checkInDay(new Date(2026, 10, 10, 23, 59))).toBe('2026-11-10')
  })
})

describe('visits this month', () => {
  it('check-ins and logged workouts, each day once, this month only, nothing after today', () => {
    const S = {
      workouts: [{ d: '2026-11-02' }, { d: '2026-11-03' }, { d: '2026-10-30' }],
      gymVisits: { '2026-11-03': { on: true, _ts: 1 }, '2026-11-05': { on: true, _ts: 1 }, '2026-11-06': { _ts: 1 }, '2026-11-20': { on: true, _ts: 1 } },
    }
    expect(monthVisits(S, TODAY)).toEqual({ days: 3, checkIns: 2 })
    expect(monthVisits({}, TODAY)).toEqual({ days: 0, checkIns: 0 })
  })
})

describe('a check-in survives reload and sync', () => {
  // A device's change goes through the store the way useStore.update does it: stampEdits + stampChange.
  const change = (prev, fn, wall) => {
    const next = JSON.parse(JSON.stringify(prev))
    fn(next)
    stampEdits(prev, next, wall)
    stampChange(prev, next, wall)
    return next
  }
  const base = { weekStart: 1, workouts: [], gymVisits: {}, _ts: 1 }
  it('a reload (the stored JSON) reads the same', () => {
    const a = change(base, s => { s.gymVisits = withVisitDetails(s.gymVisits, TODAY, { centre: 'Cult HSR' }, 100, TODAY) }, 100)
    const back = JSON.parse(JSON.stringify(a))
    expect(visitOf(back, TODAY)).toEqual({ on: true, centre: 'Cult HSR' })
    expect(streakInfo(back, TODAY).thisWeekDone).toBe(true)
  })
  it('two devices: each keeps the other\'s day, and the later undo of the same day wins', () => {
    const phone = change(base, s => { s.gymVisits = withVisit(s.gymVisits, TODAY, true, 100, TODAY) }, 100)
    const laptop = change(base, s => { s.gymVisits = withVisit(s.gymVisits, '2026-11-07', true, 150, TODAY) }, 150)
    const m = mergeStates(phone, laptop)
    expect(visitDays(m)).toEqual(['2026-11-07', TODAY])
    const undone = change(laptop, s => { s.gymVisits = withVisit(s.gymVisits, TODAY, false, 300, TODAY) }, 300)
    const m2 = mergeStates(phone, undone)
    expect(visitOn(m2, TODAY)).toBe(false)
    expect(visitOn(m2, '2026-11-07')).toBe(true)
    expect(visitOn(mergeStates(undone, phone), TODAY)).toBe(false)
  })
  it('a back-dated day merges like any other', () => {
    const a = change(base, s => { s.gymVisits = withVisitDetails(s.gymVisits, '2026-11-04', { note: 'forgot to tap' }, 100, TODAY) }, 100)
    const m = mergeStates(base, a)
    expect(visitOf(m, '2026-11-04')).toEqual({ on: true, note: 'forgot to tap' })
  })
})
