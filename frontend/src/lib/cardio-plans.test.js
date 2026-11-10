import { describe, it, expect } from 'vitest'
import { cardioPlan, intervalSegments, planWeek, intervalRounds, cardioForWeekday, cardioForRoutine, overCeiling, topHr, HR_CEILING, CARDIO_KEYS } from './cardio-plans.js'

const contiguous = segs => segs.every((s, i) => s.to > s.from && (i === 0 ? s.from === 0 : s.from === segs[i - 1].to))

describe('the segment tables', () => {
  it('every table runs from minute 0 without gaps and never asks for more than 175 bpm', () => {
    for (const key of CARDIO_KEYS) for (const week of [1, 3]) {
      const p = cardioPlan(key, { week })
      expect(contiguous(p.segments), key).toBe(true)
      expect(p.segments[p.segments.length - 1].to).toBe(p.min)
      expect(topHr(p.segments)).toBeLessThanOrEqual(HR_CEILING)
    }
  })

  it('Wednesday is 35 minutes, 20 of them at 6 km/h on 9 %', () => {
    const p = cardioPlan('steady')
    expect(p.min).toBe(35)
    expect(p.segments[2]).toMatchObject({ from: 5, to: 25, speed: 6, incline: 9, hr: { lo: 145, hi: 160 } })
    expect(p.segments[5]).toMatchObject({ from: 33, to: 35, speed: 4, incline: 0, hr: { max: 120 } })
  })

  it('the walk after lifting is 20 minutes with 15 at 5.5 km/h on 5 %', () => {
    const p = cardioPlan('postLift')
    expect(p.segments.map(s => [s.from, s.to, s.speed, s.incline])).toEqual([[0, 2, 4, 0], [2, 17, 5.5, 5], [17, 20, 4, 0]])
    expect(p.segments[1].hr).toEqual({ lo: 120, hi: 140 })
  })

  it('Saturday is three hard rounds and a 10 minute cool-down from 4.0 to 3.5 km/h', () => {
    const segs = intervalSegments(3)
    expect(segs.map(s => [s.from, s.to, s.kind])).toEqual([
      [0, 3, 'warm'], [3, 5, null], [5, 8, 'hard'], [8, 11, 'recover'], [11, 14, 'hard'],
      [14, 17, 'recover'], [17, 20, 'hard'], [20, 30, 'cool']
    ])
    expect(segs[2]).toMatchObject({ speed: 6, incline: 12, hr: { lo: 165, hi: 175 } })
    expect(segs[3].hr).toEqual({ max: 135 })
    expect(segs[7]).toMatchObject({ speed: 4, speedTo: 3.5, incline: 0 })
  })

  it('a fourth round goes in before the cool-down, which stays 10 minutes', () => {
    const segs = intervalSegments(4)
    expect(segs.filter(s => s.kind === 'hard')).toHaveLength(4)
    expect(segs.slice(-3).map(s => [s.from, s.to, s.kind])).toEqual([[20, 23, 'recover'], [23, 26, 'hard'], [26, 36, 'cool']])
  })
})

describe('the fourth round unlocks from week 3', () => {
  it('counts plan weeks from the day it was loaded', () => {
    expect(planWeek('2026-11-02', '2026-11-02')).toBe(1)
    expect(planWeek('2026-11-02', '2026-11-08')).toBe(1)
    expect(planWeek('2026-11-02', '2026-11-09')).toBe(2)
    expect(planWeek('2026-11-02', '2026-11-16')).toBe(3)
    expect(planWeek(null, '2026-11-16')).toBe(null)
  })

  it('asks for 3 rounds in weeks 1 and 2, then 4', () => {
    expect([null, 1, 2, 3, 9].map(intervalRounds)).toEqual([3, 3, 3, 4, 4])
    expect(cardioPlan('intervals', { week: 2 })).toMatchObject({ rounds: 3, min: 30 })
    expect(cardioPlan('intervals', { week: 3 })).toMatchObject({ rounds: 4, min: 36 })
  })
})

describe('which session belongs to a day', () => {
  it('maps the week and the plan routines', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(cardioForWeekday)).toEqual([null, 'postLift', 'postLift', 'steady', 'postLift', 'postLift', 'intervals'])
    expect(cardioForRoutine({ planKey: 'lower-b' })).toBe('postLift')
    expect(cardioForRoutine({ planKey: 'intervals' })).toBe('intervals')
    expect(cardioForRoutine({ name: 'Upper A' })).toBe(null)
    expect(cardioPlan('nope')).toBe(null)
  })

  it('flags anything above 175 bpm', () => {
    expect(overCeiling(175)).toBe(false)
    expect(overCeiling(176)).toBe(true)
    expect(overCeiling(null)).toBe(false)
  })
})
