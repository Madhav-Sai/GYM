import { describe, expect, test } from 'vitest'
import { dietTargets, latestWeightKg, proteinTarget, proteinFloor, proteinBasis, gPerKgOf, round5 } from './diet-targets.js'
import { dietFlags } from './diet-flags.js'
import { TARGETS } from './diet-plan.js'

describe('protein from body weight', () => {
  test('2.2 g/kg x 72.9 kg is 160 g, the floor 1.9 g/kg is 140 g', () => {
    expect(proteinTarget(72.9, 2.2)).toBe(160)
    expect(proteinFloor(72.9)).toBe(140)
  })
  test('rounded to 5 g', () => {
    expect(round5(162.4)).toBe(160)
    expect(round5(162.5)).toBe(165)
    expect(proteinTarget(80, 2.0)).toBe(160)
    expect(proteinTarget(85, 1.6)).toBe(135)
  })
  test('no weight: the plan\'s 160 g and the 140 g floor', () => {
    expect(proteinTarget(null)).toBe(160)
    expect(proteinFloor(undefined)).toBe(140)
    const t = dietTargets({ prefs: {}, weight: null })
    expect(t.protein).toBe(160)
    expect(t.proteinFloor).toBe(140)
    expect(proteinBasis(t)).toBe(null)
  })
  test('g/kg: default 2.2, clamped to 1.6..2.6', () => {
    expect(gPerKgOf({})).toBe(2.2)
    expect(gPerKgOf({ proteinPerKg: 1.8 })).toBe(1.8)
    expect(gPerKgOf({ proteinPerKg: 9 })).toBe(2.6)
    expect(gPerKgOf({ proteinPerKg: 1 })).toBe(1.6)
    expect(gPerKgOf({ proteinPerKg: '2' })).toBe(2.2)
  })
})

describe('latest weight', () => {
  test('the newest of the weigh-ins and the InBody scans', () => {
    expect(latestWeightKg([{ d: '2026-11-01', w: 73.4 }], 'kg', [{ date: '2026-11-05', weight: 72.9 }])).toEqual({ kg: 72.9, date: '2026-11-05', source: 'inbody' })
    expect(latestWeightKg([{ d: '2026-11-08', w: 72.5 }], 'kg', [{ date: '2026-11-05', weight: 72.9 }])).toEqual({ kg: 72.5, date: '2026-11-08', source: 'weigh-in' })
  })
  test('a weigh-in in lb is turned into kg', () => {
    expect(latestWeightKg([{ d: '2026-11-08', w: 160.7 }], 'lb', []).kg).toBe(72.9)
  })
  test('nothing known is null; junk is ignored', () => {
    expect(latestWeightKg([], 'kg', [])).toBe(null)
    expect(latestWeightKg([null, { d: '2026-11-01', w: 'x' }, { d: '2026-11-02', w: 0 }], 'kg', undefined)).toBe(null)
  })
})

describe('dietTargets', () => {
  const weight = { kg: 72.9, date: '2026-11-05', source: 'inbody' }
  test('protein, floor and the line the Diet screen shows', () => {
    const t = dietTargets({ prefs: { veg: false }, weight })
    expect(t.protein).toBe(160)
    expect(t.proteinFloor).toBe(140)
    expect(t.kcal).toBe(TARGETS.kcal)
    expect(t.kcalOwn).toBe(false)
    expect(t.fiber).toBe(TARGETS.fiber)
    expect(proteinBasis(t)).toBe('160 g = 2.2 g/kg x 72.9 kg')
  })
  test('the user\'s own g/kg and kcal target', () => {
    const t = dietTargets({ prefs: { proteinPerKg: 2.0, kcalTarget: 2300 }, weight })
    expect(t.protein).toBe(145)
    expect(t.kcal).toBe(2300)
    expect(t.kcalOwn).toBe(true)
    expect(proteinBasis(t)).toBe('145 g = 2.0 g/kg x 72.9 kg')
  })
  test('the evening flag uses the weight-based floor', () => {
    const heavy = dietTargets({ prefs: {}, weight: { kg: 90 } })
    expect(heavy.proteinFloor).toBe(170)
    expect(dietFlags({ fiber: 30, protein: 150 }, 20 * 60, heavy).map(f => f.need)).toEqual([170])
    expect(dietFlags({ fiber: 30, protein: 150 }, 20 * 60)).toEqual([])
  })
})
