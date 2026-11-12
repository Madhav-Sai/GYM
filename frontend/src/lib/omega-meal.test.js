import { describe, expect, test } from 'vitest'
import { omegaForMeal, omegaForPlan, omegaText, joinNames, CAPSULE_TEXT, OMEGA_SLOTS, CAPSULE_SLOTS } from './omega-meal.js'
import { planFor, dayTypeOf, SLOTS } from './diet-plan.js'

const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-08']

describe('omega-3 with what', () => {
  test('the capsule slots are the plan\'s pill slots: 07:30, 13:15 and 23:00', () => {
    expect(OMEGA_SLOTS).toEqual(SLOTS.filter(s => s.pill).map(s => s.id))
    expect(omegaForMeal('snack1', [{ foodId: 'almonds', qty: 20 }])).toBeNull()
    expect(CAPSULE_TEXT).toBe('Omega-3 (fish oil): take 1 capsule with this meal')
  })

  test('1 capsule a day since 12 Nov 2026: only breakfast carries it unless all three are asked for', () => {
    expect(CAPSULE_SLOTS).toEqual(['post'])
    const plan = planFor('training', { track: 'veg', day: '2026-11-09' })
    expect(Object.keys(omegaForPlan(plan))).toEqual(['post'])
    expect(omegaForMeal('lunch', plan.lunch)).toBeNull()
    expect(omegaForMeal('lunch', plan.lunch, OMEGA_SLOTS)).toMatchObject({ slot: 'lunch' })
  })

  test('veg Monday: breakfast nuts and seeds, lunch oil and curd, dinner paneer and oil, with the meal\'s fat', () => {
    const o = omegaForPlan(planFor('training', { track: 'veg', day: '2026-11-09' }), OMEGA_SLOTS)
    expect(o.post).toEqual({ slot: 'post', fat: 25, carriers: ['almonds', 'walnuts', 'pumpkin seeds'], low: false })
    expect(o.lunch).toEqual({ slot: 'lunch', fat: 9, carriers: ['cooking oil', 'curd'], low: false })
    expect(o.dinner).toEqual({ slot: 'dinner', fat: 34, carriers: ['paneer', 'cooking oil'], low: false })
    expect(omegaText(o.post)).toBe('Omega-3 (fish oil): take 1 capsule with this meal, with the almonds, walnuts and pumpkin seeds (about 25 g fat).')
  })

  test('veg Tuesday: the paneer curry and curd at lunch, the tofu and oil at dinner', () => {
    const o = omegaForPlan(planFor('training', { track: 'veg', day: '2026-11-10' }), OMEGA_SLOTS)
    expect(o.lunch).toMatchObject({ fat: 24, carriers: ['paneer', 'cooking oil', 'curd'] })
    expect(o.dinner).toMatchObject({ fat: 15, carriers: ['tofu', 'cooking oil'] })
  })

  test('non-veg: eggs at breakfast, the fish at lunch on a fish day, chicken and oil at dinner', () => {
    const o = omegaForPlan(planFor('training', { track: 'nonveg', day: '2026-11-10' }), OMEGA_SLOTS)
    expect(o.post).toMatchObject({ fat: 35, carriers: ['eggs', 'almonds', 'walnuts', 'pumpkin seeds'] })
    expect(o.lunch).toMatchObject({ fat: 23, carriers: ['mackerel', 'cooking oil', 'curd'] })
    expect(o.dinner).toMatchObject({ fat: 15, carriers: ['chicken', 'cooking oil'] })
  })

  test('every main meal of every day and track has at least 5 g fat and names its carriers', () => {
    for (const track of ['veg', 'nonveg']) for (const day of WEEK) {
      for (const o of Object.values(omegaForPlan(planFor(dayTypeOf(day), { track, day }), OMEGA_SLOTS))) {
        expect(o.low, `${track} ${day} ${o.slot}`).toBe(false)
        expect(o.fat).toBeGreaterThanOrEqual(5)
        expect(o.carriers.length).toBeGreaterThan(0)
        if (track === 'veg') for (const c of o.carriers) expect(c).not.toMatch(/egg|fish|chicken|mackerel|sardine/)
      }
    }
  })

  test('a lean meal says what to add; logged entries count with their own fat', () => {
    const o = omegaForMeal('lunch', [{ foodId: 'rice', qty: 100 }, { foodId: 'palak', qty: 100 }], OMEGA_SLOTS)
    expect(o).toEqual({ slot: 'lunch', fat: 1, carriers: [], low: true })
    expect(omegaText(o)).toBe('Omega-3 (fish oil): take 1 capsule with this meal. This meal has about 1 g fat: add 10 almonds or 1 tsp peanut butter.')
    expect(omegaForMeal('dinner', [{ name: 'Home curry', fat: 12 }], OMEGA_SLOTS)).toMatchObject({ fat: 12, carriers: ['home curry'], low: false })
  })

  test('names join the way a sentence does', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['a'])).toBe('a')
    expect(joinNames(['a', 'b'])).toBe('a and b')
    expect(joinNames(['a', 'b', 'c'], 'y')).toBe('a, b y c')
  })
})
