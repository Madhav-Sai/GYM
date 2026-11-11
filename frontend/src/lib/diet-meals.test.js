import { describe, expect, test } from 'vitest'
import { mealItems, mealFromEntries, mealEntries, copySlot, mealTotals, MAX_MEAL_ITEMS } from './diet-meals.js'

const chicken = { id: 'chicken', name: 'Chicken breast cooked', per: 100, unit: 'g', kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, satFat: 1, omega3: null }
const foods = id => (id === 'chicken' ? chicken : null)
const logged = [
  { id: 'a1', at: '2026-11-07T07:00:00Z', slot: 'lunch', planKey: 'lunch:2', foodId: 'chicken', name: 'Chicken breast cooked', qty: 150, unit: 'g', kcal: 247.5, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, satFat: 1.5, omega3: null },
  { id: 'a2', at: '2026-11-07T07:01:00Z', slot: 'lunch', name: 'Home dal', qty: 200, unit: 'g', kcal: 230, protein: 12, carbs: 30, fat: 6, fiber: 8, satFat: null, omega3: null },
  { id: 'a3', at: '2026-11-07T19:00:00Z', slot: 'dinner', name: 'Roti', qty: 80, unit: 'g', kcal: 240, protein: 7, carbs: 45, fat: 3, fiber: 5, satFat: null, omega3: null },
]

describe('saved meals', () => {
  test('a meal keeps the food and amounts, never the day-only fields', () => {
    const m = mealFromEntries('  Lunch at work ', logged.slice(0, 2))
    expect(m.name).toBe('Lunch at work')
    expect(m.items).toHaveLength(2)
    for (const it of m.items) for (const k of ['id', 'at', 'slot', 'planKey']) expect(it).not.toHaveProperty(k)
    expect(m.items[0]).toMatchObject({ foodId: 'chicken', qty: 150, protein: 46.5 })
    expect(mealFromEntries('x'.repeat(99), logged).name).toHaveLength(60)
    expect(mealItems(Array(40).fill(logged[1]))).toHaveLength(MAX_MEAL_ITEMS)
    expect(mealItems([{ name: '', qty: 1 }, { name: 'zero', qty: 0 }])).toEqual([])
  })

  test('logging a meal: list foods are worked out again, custom ones keep their numbers, all in the chosen slot', () => {
    const items = mealItems(logged.slice(0, 2)).map((it, i) => (i === 0 ? { ...it, protein: 1 } : it))
    const out = mealEntries(items, 'dinner', foods)
    expect(out[0]).toMatchObject({ foodId: 'chicken', qty: 150, slot: 'dinner', protein: 46.5, kcal: 247.5 })
    expect(out[0]).not.toHaveProperty('planKey')
    expect(out[1]).toMatchObject({ name: 'Home dal', slot: 'dinner', kcal: 230, satFat: null })
    // A food since removed from the list falls back to what was saved.
    expect(mealEntries([{ foodId: 'gone', name: 'Old food', qty: 10, unit: 'g', kcal: 5, protein: 1, carbs: 0, fat: 0 }], 'pre', foods)[0])
      .toMatchObject({ name: 'Old food', kcal: 5, fiber: null, slot: 'pre' })
  })

  test('copy yesterday: only that slot, as new entries', () => {
    const out = copySlot(logged, 'lunch', foods)
    expect(out.map(e => e.name)).toEqual(['Chicken breast cooked', 'Home dal'])
    expect(out.every(e => e.slot === 'lunch' && !e.id && !e.at && !e.planKey)).toBe(true)
    expect(copySlot(logged, 'snack1', foods)).toEqual([])
  })

  test('totals for the list row', () => {
    expect(mealTotals(logged.slice(0, 2))).toEqual({ kcal: 478, protein: 58.5 })
    expect(mealTotals([])).toEqual({ kcal: 0, protein: 0 })
  })
})
