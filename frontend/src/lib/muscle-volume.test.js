import { describe, it, expect } from 'vitest'
import { muscleVolumeByWeek, muscleVolumeOf, weekKeysBack, defaultPick, shownMuscles, weekBreakdown } from './muscle-volume.js'
import { SUNDAY } from './format.js'

const bench = { muscleWeights: { chest: 1, triceps: 0.4 } }
const row = { muscleWeights: { 'upper-back': 1, biceps: 0.4 } }
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const wk = (d, entries) => ({ d, start: Date.parse(d + 'T10:00:00'), entries })

describe('weekKeysBack', () => {
  it('lists the eight week starts ending with this week, oldest first', () => {
    const k = weekKeysBack('2026-11-11', 8)   // a Wednesday
    expect(k).toHaveLength(8)
    expect(k[7]).toBe('2026-11-09')
    expect(k[0]).toBe('2026-09-21')
  })
  it('follows a Sunday week start', () => {
    expect(weekKeysBack('2026-11-11', 2, SUNDAY)).toEqual(['2026-11-01', '2026-11-08'])
  })
})

describe('muscleVolumeByWeek', () => {
  it('counts weight x reps of ticked work sets, shared out by muscle weight', () => {
    const v = muscleVolumeByWeek([
      wk('2026-11-10', [{ id: 'x-bench', exercise: bench, sets: [set(100, 5), set(100, 5), set(100, 5, { done: false })] }]),
    ], { today: '2026-11-11' })
    expect(v.byMuscle.chest[7]).toBe(1000)
    expect(v.byMuscle.triceps[7]).toBe(400)
    expect(v.totals).toEqual({ chest: 1000, triceps: 400 })
    expect(v.ranked).toEqual(['chest', 'triceps'])
  })

  it('puts each workout in its own week and drops anything outside the window', () => {
    const v = muscleVolumeByWeek([
      wk('2026-11-02', [{ id: 'x-row', exercise: row, sets: [set(50, 10)] }]),
      wk('2026-11-09', [{ id: 'x-row', exercise: row, sets: [set(60, 10)] }]),
      wk('2026-01-05', [{ id: 'x-row', exercise: row, sets: [set(999, 10)] }]),
    ], { today: '2026-11-11' })
    expect(v.byMuscle['upper-back'].slice(-2)).toEqual([500, 600])
    expect(v.totals['upper-back']).toBe(1100)
  })

  it('leaves out warm-ups unless asked, and workouts without sets', () => {
    const w = wk('2026-11-10', [{ id: 'x-bench', exercise: bench, sets: [set(40, 10, { warmup: true }), set(100, 1)] }])
    const plain = muscleVolumeByWeek([w, { d: '2026-11-10', whoop: true }], { today: '2026-11-11' })
    expect(plain.totals.chest).toBe(100)
    const all = muscleVolumeByWeek([w], { today: '2026-11-11', warmups: true })
    expect(all.totals.chest).toBeGreaterThan(100)
  })

  it('ranks by volume and returns nothing for an empty history', () => {
    const v = muscleVolumeByWeek([
      wk('2026-11-10', [
        { id: 'x-row', exercise: row, sets: [set(100, 10)] },
        { id: 'x-bench', exercise: bench, sets: [set(50, 10)] },
      ]),
    ], { today: '2026-11-11' })
    expect(v.ranked).toEqual(['upper-back', 'chest', 'biceps', 'triceps'])
    const none = muscleVolumeByWeek([], { today: '2026-11-11' })
    expect(none.ranked).toEqual([])
    expect(none.weeks).toHaveLength(8)
  })

  it('reads a profile through muscleVolumeOf', () => {
    const S = { workouts: [wk('2026-11-10', [{ id: 'x-bench', exercise: bench, sets: [set(20, 10)] }])] }
    expect(muscleVolumeOf(S, { today: '2026-11-11' }).totals.chest).toBe(200)
  })
})

describe('picking muscles', () => {
  const vol = { weeks: ['a', 'b'], ranked: ['chest', 'upper-back', 'quadriceps', 'triceps', 'biceps', 'calves'], byMuscle: { chest: [10, 20], triceps: [0, 4] }, totals: {} }
  it('defaults to the top five', () => {
    expect(defaultPick(vol)).toEqual(['chest', 'upper-back', 'quadriceps', 'triceps', 'biceps'])
    expect(shownMuscles(vol, null)).toEqual(defaultPick(vol))
  })
  it('keeps a pick in ranked order and falls back when it has no volume', () => {
    expect(shownMuscles(vol, ['calves', 'chest'])).toEqual(['chest', 'calves'])
    expect(shownMuscles(vol, ['abs'])).toEqual(defaultPick(vol))
  })
  it('gives one week\'s numbers for a tap', () => {
    expect(weekBreakdown(vol, 1, ['chest', 'triceps'])).toEqual({ week: 'b', rows: [{ m: 'chest', v: 20 }, { m: 'triceps', v: 4 }], total: 24 })
  })
})
