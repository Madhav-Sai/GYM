import { describe, expect, test } from 'vitest'
import { planFor, planTotals, dayTypeOf, TARGETS, SLOTS, nonNegotiables } from './diet-plan.js'
import { FOODS, foodById, macrosFor, amountLabel, entryFor, sumMacros } from './diet-foods.js'

const within = (v, target, pct = 0.05) => Math.abs(v - target) <= target * pct

describe('the food database', () => {
  test('the seed values are exactly as given', () => {
    const c = foodById('chicken')
    expect([c.kcal, c.protein, c.carbs, c.fat, c.fiber]).toEqual([165, 31, 0, 3.6, 0])
    expect(foodById('mackerel').omega3).toBe(2600)
    expect(foodById('walnuts').omega3).toBe(9000)
    expect(foodById('chapati')).toMatchObject({ unit: 'piece', per: 1, kcal: 104 })
    expect(foodById('bread')).toMatchObject({ unit: 'slice', kcal: 80 })
    expect(foodById('sids-milk')).toMatchObject({ unit: 'ml', kcal: 54, protein: 4.4 })
    expect(foodById('isabgol')).toMatchObject({ unit: 'tsp', kcal: 0, fiber: 4 })
    expect(foodById('soya')).toMatchObject({ kcal: 345, protein: 52, fiber: 13, veg: true })
    expect(new Set(FOODS.map(f => f.id)).size).toBe(FOODS.length)
  })

  test('macros scale with the amount, unknowns stay null', () => {
    expect(macrosFor(foodById('chicken'), 150)).toMatchObject({ kcal: 247.5, protein: 46.5 })
    expect(macrosFor(foodById('chapati'), 2)).toMatchObject({ kcal: 208, protein: 6, satFat: null })
    const e = entryFor(foodById('egg'), 150, 'pre', 'pre:2')
    expect(e).toMatchObject({ foodId: 'egg', qty: 150, unit: 'g', slot: 'pre', planKey: 'pre:2', protein: 19.5 })
    const t = sumMacros([e, entryFor(foodById('chapati'), 1, 'dinner')])
    expect(t.unknown.satFat).toBe(1)
  })

  test('amounts read naturally', () => {
    expect(amountLabel(foodById('egg'), 150)).toBe('3 eggs (150 g)')
    expect(amountLabel(foodById('chicken'), 150)).toBe('150 g')
    expect(amountLabel(foodById('chapati'), 2)).toBe('2 pieces')
    expect(amountLabel(foodById('isabgol'), 1)).toBe('1 tsp')
  })
})

describe('the default plan', () => {
  test.each(['training', 'cardio', 'rest'])('%s hits about 2050 kcal and 160 g protein (within 5 %%)', type => {
    const t = planTotals(planFor(type))
    expect(within(t.kcal, TARGETS.kcal), `${type} kcal ${t.kcal}`).toBe(true)
    expect(within(t.protein, TARGETS.protein), `${type} protein ${t.protein}`).toBe(true)
    expect(t.fiber).toBeGreaterThanOrEqual(TARGETS.fiber)
    expect(t.satFat).toBeLessThanOrEqual(TARGETS.satFatMax)
  })

  test('training days have two scoops of whey, cardio and rest one', () => {
    const scoops = type => Object.values(planFor(type)).flat().filter(x => x.foodId === 'whey').reduce((n, x) => n + x.qty, 0)
    expect(scoops('training')).toBe(2)
    expect(scoops('cardio')).toBe(1)
    expect(scoops('rest')).toBe(1)
  })

  test('the plan meets its own non-negotiables', () => {
    const entries = Object.values(planFor('training')).flat().map(x => entryFor(foodById(x.foodId), x.qty, 'other'))
    const n = nonNegotiables(entries, 2750)
    expect(n.filter(x => !x.done).map(x => x.id)).toEqual([])
    expect(nonNegotiables([], 0).every(x => !x.done)).toBe(true)
  })

  test('veg: every item is veg, protein stays matched; per meal only touches that meal', () => {
    const veg = planFor('training', { veg: true })
    for (const x of Object.values(veg).flat()) expect(foodById(x.foodId).veg, x.foodId).toBe(true)
    expect(Math.abs(planTotals(veg).protein - planTotals(planFor('training')).protein)).toBeLessThan(2)
    const lunchOnly = planFor('training', { vegMeals: { lunch: true } })
    expect(lunchOnly.lunch.some(x => x.foodId === 'chicken')).toBe(false)
    expect(lunchOnly.pre.some(x => x.foodId === 'egg')).toBe(true)
    // a meal can opt out of the global veg switch
    expect(planFor('training', { veg: true, vegMeals: { lunch: false } }).lunch.some(x => x.foodId === 'chicken')).toBe(true)
  })

  test('every slot has a key per item, in schedule order', () => {
    const p = planFor('training')
    expect(SLOTS.map(s => s.time)).toEqual(['10:15', '12:30', '13:00', '17:00', '20:00', '22:00', '23:45'])
    expect(p.lunch.map(x => x.key)).toEqual(p.lunch.map((_, i) => `lunch:${i}`))
  })
})

describe('day type by weekday', () => {
  test('Mon Tue Thu Fri training, Wed Sat cardio, Sun rest', () => {
    // 2026-11-08 is a Sunday
    const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map(d => dayTypeOf(d))
    expect(week).toEqual(['rest', 'training', 'training', 'cardio', 'training', 'training', 'cardio'])
  })
  test('a day override wins; anything else falls back to the weekday', () => {
    expect(dayTypeOf('2026-11-08', 'training')).toBe('training')
    expect(dayTypeOf('2026-11-08', 'bogus')).toBe('rest')
  })
})
