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

// The real totals of the plan's own meals (Diet-Plan-7-Days on the 6 am day of Daily-Plan-6am), with
// the portions stated at the top of diet-plan.js. They do NOT meet the plan's 2000 kcal or its 130 g
// carb ceiling on any day, and we do not invent food to make them: this table records them, and a
// change to the foods or portions has to update it on purpose. [kcal, protein, carbs, fat, fibre]
const REAL = {
  nonveg: {
    Mon: [2959.7, 247.3, 218.7, 128.3, 50], Tue: [3126.7, 218.8, 225, 160.7, 55.6], Wed: [2956.7, 251.2, 210.7, 133.4, 56.6],
    Thu: [3072.7, 232.5, 212.6, 151.4, 64], Fri: [2965.7, 247, 220.2, 128.5, 50.3], Sat: [3223.7, 220.1, 232.5, 167, 60.7],
    Sun: [2976.7, 256.3, 215.1, 129.6, 62.9],
  },
  veg: {
    Mon: [3370.7, 239.7, 240.9, 170.2, 57.8], Tue: [3457.2, 237, 230.8, 188.8, 56.1], Wed: [3367.7, 243.6, 232.9, 175.3, 64.4],
    Thu: [3427.2, 235.7, 224.4, 188.7, 61.5], Fri: [3376.7, 239.4, 242.4, 170.4, 58.1], Sat: [3554.2, 238.3, 238.3, 195.1, 61.2],
    Sun: [3520.2, 257.7, 237.9, 182, 70.7],
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
    test.each(WEEK.map((d, i) => [NAMES[i], d]))(`${track} %s: the recorded totals; protein and fibre on target`, (name, day) => {
      const type = dayTypeOf(day)
      const t = planTotals(planFor(type, { veg: track === 'veg', day }))
      const [kcal, protein, carbs, fat, fiber] = REAL[track][name]
      expect([t.kcal, t.protein, t.carbs, t.fat, t.fiber]).toEqual([kcal, protein, carbs, fat, fiber])
      // what the plan does meet
      expect(t.protein).toBeGreaterThanOrEqual(150)
      expect(t.fiber).toBeGreaterThanOrEqual(30)
      // what it does not: recorded honestly, more than 10 % over 2000 kcal and over 140 g carbs
      expect(Math.abs(t.kcal - TARGETS.kcal) <= TARGETS.kcal * 0.1).toBe(false)
      expect(t.carbs).toBeGreaterThan(140)
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
    for (const veg of [false, true]) {
      const p = planFor(type, { veg })
      expect(p.pre.map(x => x.foodId)).toEqual(['black-coffee'])
      expect(p.post[0]).toMatchObject({ foodId: 'whey', qty: 1, note: 'post-gym' })
      expect(p.bed.map(x => x.foodId)).toEqual(['isabgol', 'whey'])
      expect(all(p).filter(x => x.foodId === 'whey').reduce((n, x) => n + x.qty, 0)).toBe(2)
      expect(p.wake).toEqual([{ foodId: 'methi-seeds', qty: 4, key: 'wake:0' }])
    }
  })

  test('track A: fish on Tue, Thu, Sat, chicken on the other days, at lunch and dinner; 5 eggs', () => {
    const meat = WEEK.map(day => planFor(dayTypeOf(day), { day }).lunch[2].foodId)
    expect(meat).toEqual(['chicken', 'mackerel', 'chicken', 'sardine', 'chicken', 'mackerel', 'chicken'])
    for (const day of WEEK) {
      const p = planFor(dayTypeOf(day), { day })
      expect(p.dinner[1].foodId).toBe(p.lunch[2].foodId)
      expect(all(p).filter(x => x.foodId === 'egg').reduce((n, x) => n + x.qty, 0)).toBe(250)
    }
  })

  test('the dal rotation: Mon toor, Tue rajma, Wed chana, Thu moong, Fri toor, Sat kabuli, Sun masoor', () => {
    expect(WEEK.map(day => planFor(dayTypeOf(day), { day }).dinner[2].foodId)).toEqual(['toor', 'rajma', 'chana-dal', 'moong', 'toor', 'kabuli', 'masoor'])
    expect(DAL_ROTATION).toHaveLength(7)
  })

  test('track B: no egg, fish or chicken; the veg protein rotation at lunch and dinner', () => {
    const rot = WEEK.map(day => { const p = planFor(dayTypeOf(day), { veg: true, day }); return [p.lunch[2].foodId, p.lunch[2].note, p.dinner[1].foodId, p.dinner[1].note] })
    expect(rot).toEqual([
      ['soya', 'Soya chunks', 'paneer', 'Paneer bhurji'],
      ['paneer', 'Paneer curry', 'tofu', 'Tofu stir fry'],
      ['soya', 'Soya chunks', 'paneer', 'Paneer tikka'],
      ['paneer', 'Rajma + paneer', 'tofu', 'Tofu bhurji'],
      ['soya', 'Soya chunks', 'paneer', 'Paneer curry'],
      ['paneer', 'Chana + paneer', 'tofu', 'Tofu curry'],
      ['paneer', 'Paneer', 'soya', 'Soya chunks'],
    ])
    for (const day of WEEK) for (const x of all(planFor(dayTypeOf(day), { veg: true, day }))) expect(foodById(x.foodId).veg, x.foodId).toBe(true)
    // Thursday's "rajma + paneer": the lunch dal is rajma, dinner keeps the day's moong
    const thu = planFor('training', { veg: true, day: '2026-11-12' })
    expect([thu.lunch[1].foodId, thu.dinner[2].foodId]).toEqual(['rajma', 'moong'])
    expect(planFor('training', { veg: true }).lunch[2]).toMatchObject({ foodId: 'soya', qty: 60 })
  })

  test('portions: 60 g rice, 150 g dal, curd and chicken, 2 x 100 g vegetables, 150 g fruit (never banana), 32 g nuts twice', () => {
    const p = planFor('training', { day: '2026-11-09' })
    expect(p.lunch.slice(0, 2).map(x => x.qty)).toEqual([60, 150])
    expect(p.lunch.filter(x => foodById(x.foodId).cat === 'veg').map(x => x.qty)).toEqual([100, 100])
    expect(p.dinner.filter(x => ['cucumber', 'lettuce'].includes(x.foodId)).map(x => x.qty)).toEqual([50, 50])
    expect(p.snack1[0]).toMatchObject({ qty: 150 })
    for (const day of WEEK) expect(['guava', 'apple']).toContain(planFor(dayTypeOf(day), { day }).snack1[0].foodId)
    expect(all(p).some(x => x.foodId === 'banana')).toBe(false)
    expect(all(p).filter(x => x.foodId === 'almonds' || x.foodId === 'walnuts').reduce((n, x) => n + x.qty, 0)).toBe(64)
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
    expect(lunchOnly.lunch[2].swappedFrom).toEqual({ foodId: 'chicken', qty: 150 })
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
