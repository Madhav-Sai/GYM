import { describe, expect, test } from 'vitest'
import { cleanCode, localFoodFor, scannedFood, scannedEntry, missingRequired, gramsOf, displayName, customForCode, adminFoodFromCustom } from './diet-barcode.js'
import { amountLabel, sumMacros } from './diet-foods.js'

// What GET /api/health/foods/barcode answers (api/health/barcode.js mapProduct), per 100 g.
const nutella = { id: 'bc-3017620422003', code: '3017620422003', name: 'Nutella', brand: 'Ferrero', unit: 'g', per: 100,
  kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: null, satFat: 10.6, omega3: null, serving: { g: 15, label: '15 g' }, source: 'openfoodfacts' }

describe('barcode food logging', () => {
  test('a code is 8 to 14 digits, spaces and dashes dropped', () => {
    expect(cleanCode('3017620422003')).toBe('3017620422003')
    expect(cleanCode(' 4006381-333931 ')).toBe('4006381333931')
    expect(cleanCode('1234567')).toBe(null)
    expect(cleanCode('123456789012345')).toBe(null)
    expect(cleanCode('https://x.example/1234')).toBe(null)
    expect(cleanCode(null)).toBe(null)
  })

  test('grams: macros scale from per 100 g, an unknown stays null', () => {
    const e = scannedEntry(nutella, { amount: 30, by: 'g', slot: 'snack1' })
    expect(e).toMatchObject({ foodId: 'bc-3017620422003', name: 'Nutella (Ferrero)', qty: 30, unit: 'g', slot: 'snack1' })
    expect(e.kcal).toBe(161.7)
    expect(e.protein).toBe(1.9)
    expect(e.fiber).toBe(null)
    expect(e.satFat).toBe(3.2)
    expect(e.omega3).toBe(null)
    expect(sumMacros([e]).unknown.fiber).toBe(1)
  })

  test('servings turn into grams by the label serving', () => {
    const e = scannedEntry(nutella, { amount: 2, by: 'serving' })
    expect(e.qty).toBe(30)
    expect(e.kcal).toBe(161.7)
    expect(gramsOf(nutella, 1.5, 'serving')).toBe(22.5)
    expect(gramsOf({ ...nutella, serving: null }, 2, 'serving')).toBe(0)
    expect(amountLabel(scannedFood(nutella), 30)).toBe('2 servings (30 g)')
  })

  test('a missing kcal, protein, carbs or fat blocks the entry until it is filled in', () => {
    const bare = { ...nutella, kcal: null, protein: null }
    expect(missingRequired(bare)).toEqual(['kcal', 'protein'])
    expect(scannedEntry(bare, { amount: 50 })).toBe(null)
    const e = scannedEntry(bare, { amount: 50, fill: { kcal: 500, protein: 5 } })
    expect(e.kcal).toBe(250)
    expect(e.protein).toBe(2.5)
    expect(scannedEntry(nutella, { amount: 0 })).toBe(null)
  })

  test('the name carries the brand once', () => {
    expect(displayName(nutella)).toBe('Nutella (Ferrero)')
    expect(displayName({ name: 'Amul Butter', brand: 'Amul' })).toBe('Amul Butter')
    expect(displayName({ name: 'Oats', brand: null })).toBe('Oats')
  })

  test('a food added from an earlier unknown scan is found by its code', () => {
    const foods = [{ id: 'egg' }, { id: 'x-bar', barcode: '89012345' }]
    expect(localFoodFor(foods, '89012345').id).toBe('x-bar')
    expect(localFoodFor(foods, '11111111')).toBe(null)
  })

  test('"Add it yourself": the custom amount becomes the admin food\'s per, with its code', () => {
    const c = { ...customForCode('89012345'), name: 'Protein bar', qty: 60, kcal: 220, protein: 20, carbs: 18, fat: 7, fiber: 3 }
    const f = adminFoodFromCustom(c, { veg: true })
    expect(f).toMatchObject({ name: 'Protein bar', unit: 'g', per: 60, kcal: 220, protein: 20, fiber: 3, satFat: null, veg: true, barcode: '89012345', note: 'Barcode 89012345' })
    expect(adminFoodFromCustom({ ...c, name: ' ' })).toBe(null)
    expect(adminFoodFromCustom({ ...c, qty: 0 })).toBe(null)
  })
})
