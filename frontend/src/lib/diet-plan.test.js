import { describe, expect, test } from 'vitest'
import { planFor, planTotals, dayTypeOf, TARGETS, SLOTS, nonNegotiables, DAY_TARGETS, DAY_TYPES, TRACKS, DAL_ROTATION, slotsFor, dayNotes } from './diet-plan.js'
import { FOODS, foodById, macrosFor, amountLabel, entryFor, sumMacros } from './diet-foods.js'

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
    expect(foodById('black-coffee')).toMatchObject({ unit: 'ml', kcal: 0, approx: true })
    expect(amountLabel(foodById('methi-seeds'), 4)).toBe('1 tsp (4 g)')
    for (const id of ['cauliflower', 'bottle-gourd', 'ridge-gourd', 'brinjal', 'tomato']) expect(foodById(id)).toMatchObject({ cat: 'veg', veg: true })
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

// The week used below: 2026-11-08 is a Sunday.
const WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-08']
const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const all = plan => Object.values(plan).flat()


// The real totals of every weekday and track with the trimmed portions of diet-plan.js (Nov 2026).
// A change to the foods or portions has to update this table on purpose.
//
//   track   day   kcal    protein  carbs  fat   fibre  sat fat
//   nonveg  Mon   1926.0  189.1    126.6  77.5  31.5   19.2
//   nonveg  Tue   1910.5  182.0    127.9  79.2  33.6   18.9
//   nonveg  Wed   1915.0  191.0    120.6  79.4  32.1   19.4
//   nonveg  Thu   1946.5  194.0    123.5  79.0  38.0   17.5
//   nonveg  Fri   1932.0  188.8    128.1  77.7  31.8   19.2
//   nonveg  Sat   1923.6  186.4    127.4  78.8  34.7   18.7
//   nonveg  Sun   1935.0  193.0    125.0  78.4  36.9   19.5
//   veg     Mon   1801.2  165.6    129.0  75.7  31.7   25.3
//   veg     Tue   1783.9  165.0    126.1  77.6  30.8   20.7
//   veg     Wed   1843.4  173.6    126.0  79.3  31.6   25.7
//   veg     Thu   1786.9  166.7    125.7  77.7  33.2   20.7
//   veg     Fri   1797.4  161.8    128.9  76.3  31.7   27.8
//   veg     Sat   1788.4  166.3    123.6  78.7  30.9   20.9
//   veg     Sun   1848.2  172.5    128.8  79.0  35.8   25.9
//
// Non-veg meets every bound. Veg meets protein (at least 160 g), carbs, fat and fibre, but NOT the
// 1900 kcal floor: with carbs at their 130 g ceiling and fat at 80 g there is no veg protein food left
// that adds energy without carbs (Greek yogurt, soya, tofu and dal all carry them), so veg lands on
// 1784 to 1848 kcal. [kcal, protein, carbs, fat, fibre, satFat]
const REAL = {
  nonveg: {
    Mon: [1926, 189.1, 126.6, 77.5, 31.5, 19.2], Tue: [1910.5, 182, 127.9, 79.2, 33.6, 18.9], Wed: [1915, 191, 120.6, 79.4, 32.1, 19.4],
    Thu: [1946.5, 194, 123.5, 79, 38, 17.5], Fri: [1932, 188.8, 128.1, 77.7, 31.8, 19.2], Sat: [1923.6, 186.4, 127.4, 78.8, 34.7, 18.7],
    Sun: [1935, 193, 125, 78.4, 36.9, 19.5],
  },
  veg: {
    Mon: [1801.2, 165.6, 129, 75.7, 31.7, 25.3], Tue: [1783.9, 165, 126.1, 77.6, 30.8, 20.7], Wed: [1843.4, 173.6, 126, 79.3, 31.6, 25.7],
    Thu: [1786.9, 166.7, 125.7, 77.7, 33.2, 20.7], Fri: [1797.4, 161.8, 128.9, 76.3, 31.7, 27.8], Sat: [1788.4, 166.3, 123.6, 78.7, 30.9, 20.9],
    Sun: [1848.2, 172.5, 128.8, 79, 35.8, 25.9],
  },
}

describe('the default plan: targets', () => {
  test('the same targets for every day type: 2000 kcal, 165 g protein, carbs under 130 g, 80 g fat, 35 g fibre', () => {
    expect(TARGETS).toMatchObject({ kcal: 2000, protein: 165, carbs: 130, carbsMax: true, fat: 80, fiber: 35, waterMin: 2500, waterMax: 3000 })
    for (const type of DAY_TYPES) expect(DAY_TARGETS[type]).toEqual({ kcal: 2000, carbs: 130 })
  })
})

describe('the default plan: real totals per weekday and track', () => {
  for (const track of TRACKS) {
    test.each(WEEK.map((d, i) => [NAMES[i], d]))(`${track} %s: the recorded totals, inside the bounds`, (name, day) => {
      const t = planTotals(planFor(dayTypeOf(day), { track, day }))
      expect([t.kcal, t.protein, t.carbs, t.fat, t.fiber, t.satFat]).toEqual(REAL[track][name])
      expect(t.carbs).toBeLessThanOrEqual(130)
      expect(t.fat).toBeLessThanOrEqual(80)
      expect(t.fiber).toBeGreaterThanOrEqual(30)
      expect(t.kcal).toBeLessThanOrEqual(2100)
      if (track === 'nonveg') {
        expect(t.kcal).toBeGreaterThanOrEqual(1900)
        expect(t.protein).toBeGreaterThanOrEqual(160)
        expect(t.satFat).toBeLessThanOrEqual(TARGETS.satFatMax)
      } else {
        // veg: protein reaches 160 g every day; the 1900 kcal floor is out of reach (see the table)
        expect(t.protein).toBeGreaterThanOrEqual(160)
        expect(t.kcal).toBeGreaterThanOrEqual(1780)
        expect(t.kcal).toBeLessThan(1900)
      }
    })
  }
})

describe('the default plan: meals and rotations', () => {
  test('slots follow the 6 am day, in order, with the omega-3 marker on breakfast, lunch and dinner', () => {
    expect(SLOTS.map(s => [s.id, s.time])).toEqual([['wake', '05:15'], ['pre', '05:30'], ['post', '07:30'], ['lunch', '13:15'], ['snack1', '17:00'], ['snack2', '19:30'], ['dinner', '23:00'], ['bed', '23:45']])
    expect(SLOTS.filter(s => s.pill).map(s => s.id)).toEqual(['post', 'lunch', 'dinner'])
    expect(slotsFor('training').find(s => s.id === 'post').title).toBe('Breakfast (post-workout)')
    expect(slotsFor('rest').find(s => s.id === 'post').title).toBe('Breakfast')
    expect(slotsFor('rest').map(s => s.id)).toEqual(SLOTS.map(s => s.id))
    expect(slotsFor('cardio').find(s => s.id === 'bed').title).toBe('Isabgol + whey + magnesium')
  })

  test.each(['training', 'cardio', 'rest'])('%s: black coffee only before the gym, whey after it and at bedtime (2 scoops)', type => {
    for (const track of TRACKS) {
      const p = planFor(type, { track })
      expect(p.pre.map(x => x.foodId)).toEqual(['black-coffee'])
      expect(p.post[0]).toMatchObject({ foodId: 'whey', qty: 1, note: 'post-gym' })
      expect(p.bed.map(x => x.foodId)).toEqual(['isabgol', 'whey'])
      expect(all(p).filter(x => x.foodId === 'whey').reduce((n, x) => n + x.qty, 0)).toBe(2)
      expect(p.wake).toEqual([{ foodId: 'methi-seeds', qty: 4, key: 'wake:0' }])
    }
  })

  test('track A: fish at lunch on Tue, Thu, Sat, chicken the other days; chicken at dinner; eggs 4 a day, 2 on fish days', () => {
    const lunch = WEEK.map(day => [planFor(dayTypeOf(day), { day }).lunch[2].foodId, planFor(dayTypeOf(day), { day }).lunch[2].qty])
    expect(lunch).toEqual([['chicken', 100], ['mackerel', 100], ['chicken', 100], ['sardine', 125], ['chicken', 100], ['mackerel', 75], ['chicken', 100]])
    expect(WEEK.map(day => planFor(dayTypeOf(day), { day }).dinner[1])).toEqual(
      [150, 200, 150, 200, 150, 225, 150].map(qty => ({ foodId: 'chicken', qty, key: 'dinner:1' })))
    expect(WEEK.map(day => all(planFor(dayTypeOf(day), { day })).filter(x => x.foodId === 'egg').reduce((n, x) => n + x.qty, 0)))
      .toEqual([200, 100, 200, 100, 200, 100, 200])
  })

  test('the dal rotation, one bowl a day at lunch: Mon toor, Tue rajma, Wed chana, Thu moong, Fri toor, Sat kabuli, Sun masoor', () => {
    expect(WEEK.map(day => planFor(dayTypeOf(day), { day }).lunch[1].foodId)).toEqual(['toor', 'rajma', 'chana-dal', 'moong', 'toor', 'kabuli', 'masoor'])
    expect(DAL_ROTATION).toHaveLength(7)
    for (const track of TRACKS) for (const day of WEEK) {
      expect(all(planFor(dayTypeOf(day), { track, day })).filter(x => foodById(x.foodId).cat === 'dal')).toHaveLength(1)
    }
  })

  test('track B: no egg, fish or chicken, not even in a note; the veg protein rotation; paneer at most 150 g, soya at most once a day', () => {
    const rot = WEEK.map(day => { const p = planFor(dayTypeOf(day), { track: 'veg', day }); return [p.lunch[2].foodId, p.lunch[2].qty, p.dinner[1].foodId, p.dinner[1].qty] })
    expect(rot).toEqual([
      ['soya', 25, 'paneer', 125], ['paneer', 75, 'tofu', 150], ['soya', 30, 'paneer', 125], ['paneer', 75, 'tofu', 150],
      ['soya', 25, 'paneer', 150], ['paneer', 75, 'tofu', 150], ['paneer', 125, 'soya', 25],
    ])
    for (const day of WEEK) {
      const items = all(planFor(dayTypeOf(day), { track: 'veg', day }))
      for (const x of items) {
        expect(foodById(x.foodId).veg, x.foodId).toBe(true)
        expect(x.note || '', x.note).not.toMatch(/egg|fish|chicken|mackerel|sardine/i)
      }
      expect(items.filter(x => x.foodId === 'paneer').reduce((n, x) => n + x.qty, 0)).toBeLessThanOrEqual(150)
      expect(items.filter(x => x.foodId === 'soya').length).toBeLessThanOrEqual(1)
      expect(items.filter(x => x.foodId === 'curd').length).toBeLessThanOrEqual(2)
    }
    // Thursday's "rajma + paneer": the lunch dal is rajma
    expect(planFor('training', { track: 'veg', day: '2026-11-12' }).lunch[1].foodId).toBe('rajma')
    // the old veg flag still picks track B
    expect(planFor('training', { veg: true, day: '2026-11-12' })).toEqual(planFor('training', { track: 'veg', day: '2026-11-12' }))
  })

  test('portions: rice small, 2 x 100 g vegetables, 100 g fruit (never banana), nuts once at breakfast, 10 g pumpkin seeds, 1 tsp oil a meal', () => {
    for (const track of TRACKS) for (const day of WEEK) {
      const p = planFor(dayTypeOf(day), { track, day })
      expect(p.lunch[0]).toMatchObject({ foodId: 'rice', qty: track === 'veg' ? 30 : 50 })
      expect(p.lunch.filter(x => foodById(x.foodId).cat === 'veg').map(x => x.qty)).toEqual([100, 100])
      expect(p.dinner.filter(x => ['cucumber', 'lettuce'].includes(x.foodId)).map(x => x.qty)).toEqual([50, 50])
      expect(p.snack1[0]).toMatchObject({ qty: 100 })
      expect(['guava', 'apple']).toContain(p.snack1[0].foodId)
      expect(all(p).some(x => x.foodId === 'banana')).toBe(false)
      const nuts = all(p).filter(x => x.foodId === 'almonds' || x.foodId === 'walnuts')
      expect(nuts.map(x => [x.key.split(':')[0], x.qty])).toEqual([['post', 20], ['post', 12]])
      expect(all(p).filter(x => x.foodId === 'pumpkin-seeds').map(x => x.qty)).toEqual([10])
      expect(all(p).filter(x => x.foodId === 'mustard-oil').map(x => [x.key.split(':')[0], x.qty])).toEqual([['lunch', 4.5], ['dinner', 4.5]])
      expect(all(p).filter(x => x.foodId === 'curd').length).toBeLessThanOrEqual(2)
      expect(p.dinner[0]).toMatchObject({ foodId: 'chapati', qty: 1 })
    }
  })
  test('the rest day notes: weigh-in and the monthly D3', () => {
    expect(dayNotes('rest')).toEqual(['Weigh in and measure waist this morning', 'D3 with dinner on the first Sunday of the month'])
    expect(dayNotes('training')).toEqual([])
  })

  test.each([false, true])('veg %s: the plan meets its own non-negotiables', veg => {
    for (const day of WEEK) {
      const entries = all(planFor(dayTypeOf(day), { veg, day })).map(x => entryFor(foodById(x.foodId), x.qty, 'other'))
      const n = nonNegotiables(entries, 2750, { veg })
      expect(n.filter(x => !x.done).map(x => x.id), day).toEqual([])
    }
    expect(nonNegotiables([], 0, { veg }).every(x => !x.done)).toBe(true)
  })

  test('track A per-meal veg swap still works; track B ignores it', () => {
    const lunchOnly = planFor('training', { vegMeals: { lunch: true } })
    expect(lunchOnly.lunch.some(x => x.foodId === 'chicken')).toBe(false)
    expect(lunchOnly.lunch[2].swappedFrom).toEqual({ foodId: 'chicken', qty: 100 })
    expect(lunchOnly.post.some(x => x.foodId === 'egg')).toBe(true)
    const b = planFor('training', { veg: true, vegMeals: { lunch: true } })
    expect(b.lunch.some(x => x.swappedFrom)).toBe(false)
  })

  test('every slot has a key per item', () => {
    const p = planFor('training')
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
