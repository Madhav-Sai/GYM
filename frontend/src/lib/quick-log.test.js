import { describe, it, expect } from 'vitest'
import { fillFromLast, lastTimeDiffers, completeLikeLast, repeatTarget, repeatPrevious, lastWorkRows, openWorkRows, copyNumbers } from './quick-log.js'
import { makeSideSet } from './workout-model.js'

const last = { d: '2026-11-04', sets: [{ w: 20, r: 8, done: true, phase: 'warmup' }, { w: 40, r: 10, done: true }, { w: 42.5, r: 8, done: true }] }

describe('same as last time', () => {
  it('fills every open work set from the same set last time, ticking nothing', () => {
    const today = [{ w: 20, r: 6, done: false, phase: 'warmup' }, { w: 45, r: 10, done: false }, { w: 45, r: 10, done: false }, { w: 45, r: 10, done: false }]
    const out = fillFromLast(today, last, 'reps')
    expect(out[0]).toEqual(today[0])
    expect(out.slice(1).map(s => [s.w, s.r, s.done])).toEqual([[40, 10, false], [42.5, 8, false], [42.5, 8, false]])
    expect(out[1].weightOrigin).toBe('manual')
  })
  it('leaves a set already ticked alone, and still counts it', () => {
    const today = [{ w: 50, r: 9, done: true, at: 5 }, { w: 45, r: 10, done: false }]
    const out = fillFromLast(today, last, 'reps')
    expect(out[0]).toEqual(today[0])
    expect([out[1].w, out[1].r]).toEqual([42.5, 8])
  })
  it('nothing to copy: rows unchanged', () => {
    const today = [{ w: 45, r: 10, done: false }]
    expect(fillFromLast(today, null, 'reps')).toEqual(today)
    expect(fillFromLast(today, { sets: [{ w: 30, r: 0 }] }, 'reps')).toEqual(today)
    expect(lastWorkRows({ sets: [{ sec: 30 }] }, 'reps')).toEqual([])
  })
  it('a hold copies seconds and weight, a run minutes, speed and incline', () => {
    expect(fillFromLast([{ sec: 30, w: 0, done: false, planSec: 30 }], { sets: [{ sec: 45, w: 5 }] }, 'time')[0]).toEqual({ sec: 45, w: 5, done: false })
    expect(fillFromLast([{ min: 20, speed: 5, done: false }], { sets: [{ min: 25, speed: 5.5, incline: 6 }] }, 'cardio')[0]).toEqual({ min: 25, speed: 5.5, incline: 6, done: false })
  })
  it('a per-side set keeps each side last time logged, or splits a plain one', () => {
    const side = makeSideSet({ w: 10, r: 20 })
    const lastSide = { sets: [{ ...makeSideSet({ w: 12, r: 16 }), sides: { L: { w: 12, r: 8, done: true }, R: { w: 14, r: 7, done: true } } }] }
    const a = fillFromLast([side], lastSide, 'reps')[0]
    expect([a.sides.L.w, a.sides.L.r, a.sides.R.w, a.sides.R.r, a.r, a.w, a.done]).toEqual([12, 8, 14, 7, 15, 14, false])
    const b = fillFromLast([side], { sets: [{ w: 11, r: 12 }] }, 'reps')[0]
    expect([b.sides.L.r, b.sides.R.r, b.w]).toEqual([6, 6, 11])
    expect(copyNumbers({ w: 1, r: 1 }, lastSide.sets[0], 'reps')).toMatchObject({ w: 14, r: 15 })
  })
  it('tells whether the button would change anything', () => {
    expect(lastTimeDiffers([{ w: 40, r: 10, done: false }, { w: 42.5, r: 8, done: false }], last, 'reps')).toBe(false)
    expect(lastTimeDiffers([{ w: 45, r: 10, done: false }], last, 'reps')).toBe(true)
    expect(lastTimeDiffers([{ w: 45, r: 10, done: true }], last, 'reps')).toBe(false)
  })
})

describe('do all sets like last time', () => {
  it('ticks every open work set but the last, which the screen ticks itself', () => {
    const today = [{ w: 20, r: 6, done: false, phase: 'warmup' }, { w: 45, r: 10, done: true, at: 1 }, { w: 45, r: 10, done: false }, { w: 45, r: 10, done: false }]
    const { sets, lastOpen } = completeLikeLast(today, last, 'reps', 99)
    expect(lastOpen).toBe(3)
    expect(sets.map(s => s.done)).toEqual([false, true, true, false])
    expect(sets[2]).toMatchObject({ w: 42.5, r: 8, at: 99 })
    expect(sets[1].at).toBe(1)
    expect(sets[3]).toMatchObject({ w: 42.5, r: 8, done: false })
  })
  it('per-side rows are ticked on both sides', () => {
    const { sets } = completeLikeLast([makeSideSet({ w: 10, r: 20 }), makeSideSet({ w: 10, r: 20 })], last, 'reps', 5)
    expect([sets[0].done, sets[0].sides.L.done, sets[0].sides.R.done]).toEqual([true, true, true])
  })
  it('does nothing without last time or with nothing open', () => {
    expect(completeLikeLast([{ w: 1, r: 1, done: false }], null, 'reps').lastOpen).toBe(-1)
    expect(completeLikeLast([{ w: 1, r: 1, done: true }], last, 'reps').lastOpen).toBe(-1)
    expect(openWorkRows([{ done: true }, { phase: 'warmup' }, { w: 1 }])).toEqual([2])
  })
})

describe('repeat previous set', () => {
  it('copies the set just done into the next open one', () => {
    const today = [{ w: 40, r: 10, done: true, at: 3, restSec: 90 }, { w: 45, r: 10, done: false, note: 'x' }, { w: 45, r: 10, done: false }]
    expect(repeatTarget(today)).toEqual({ at: 1, from: 0 })
    const out = repeatPrevious(today, 'reps')
    expect(out[1]).toEqual({ w: 40, r: 10, done: false, note: 'x', weightOrigin: 'manual' })
    expect(out[0]).toBe(today[0])
    expect(out[2]).toBe(today[2])
  })
  it('only within a phase, and not before the first set is done', () => {
    expect(repeatTarget([{ w: 20, r: 8, done: true, phase: 'warmup' }, { w: 40, r: 8, done: false }])).toBeNull()
    expect(repeatTarget([{ w: 40, r: 8, done: false }, { w: 40, r: 8, done: false }])).toBeNull()
    expect(repeatTarget([{ w: 40, r: 8, done: true }, { w: 40, r: 8, done: true }])).toBeNull()
    const none = [{ w: 40, r: 8, done: false }]
    expect(repeatPrevious(none, 'reps')).toBe(none)
  })
})
