// The default diet plan (our addition): meal slots from the owner's day (shift 2pm to 11pm, gym in
// the morning), a day type by weekday, and one seeded plan per day type that lands on about 2050 kcal
// and 160 g protein from the food database (diet-plan.test.js holds each within 5 %).
import { foodById, sumMacros } from './diet-foods.js'
import { vegItem } from './diet-swap.js'
import { weekdayOf } from './ist.js'

export const TARGETS = Object.freeze({
  kcal: 2050, protein: 160, carbs: 210, fat: 70, fiber: 30,
  // "minimise": a ceiling, under 10 % of the day's energy
  satFatMax: 20,
  waterMin: 2500, waterMax: 3000,
})

// Flags (diet-flags.js) look at these by 20:00 India time.
export const FLAG_AT = '20:00'

export const SLOTS = [
  { id: 'pre', time: '10:15', title: 'Pre-gym meal', note: 'With coffee and the omega-3' },
  { id: 'post', time: '12:30', title: 'Post-gym protein' },
  { id: 'lunch', time: '13:00', title: 'Lunch' },
  { id: 'snack1', time: '17:00', title: 'Snack 1' },
  { id: 'dinner', time: '20:00', title: 'Dinner', note: 'Packed' },
  { id: 'snack2', time: '22:00', title: 'Snack 2' },
  { id: 'bed', time: '23:45', title: 'Isabgol and protein' },
]

export const DAY_TYPES = ['training', 'cardio', 'rest']
// Mon Tue Thu Fri training, Wed Sat cardio, Sun rest. Index 0 is Sunday.
const BY_WEEKDAY = ['rest', 'training', 'training', 'cardio', 'training', 'training', 'cardio']

/** The day type of a day: the day's own override, else by weekday. */
export const dayTypeOf = (day, override) => (DAY_TYPES.includes(override) ? override : BY_WEEKDAY[weekdayOf(day)])

const it = (foodId, qty) => ({ foodId, qty })

// One plan per day type, each with its own energy and carbs (protein stays about the same, from body
// weight): training days carry the carbs around the gym (oats, banana, rice), cardio days a little
// less, rest days are low-carb (no oats or banana, one chapati at lunch, Greek yogurt at bedtime).
// Every day keeps the non-negotiables: 2 dals, 2 vegetables, 32 g almonds + walnuts, curd, 3 eggs,
// 150 g chicken or fish.
const PLANS = {
  training: {
    pre: [it('oats', 30), it('sids-milk', 100), it('banana', 100), it('egg', 150)],
    post: [it('whey', 1)],
    lunch: [it('rice', 125), it('toor', 100), it('chicken', 150), it('bhindi', 150), it('cucumber', 100), it('mustard-oil', 5)],
    snack1: [it('almonds', 20), it('walnuts', 12), it('guava', 100)],
    dinner: [it('chapati', 2), it('moong', 80), it('cabbage', 150), it('mustard-oil', 5)],
    snack2: [it('curd', 150)],
    bed: [it('isabgol', 1), it('whey', 1)],
  },
  cardio: {
    pre: [it('oats', 20), it('sids-milk', 150), it('egg', 150)],
    post: [it('whey', 1), it('apple', 150)],
    lunch: [it('rice', 100), it('masoor', 120), it('rohu', 200), it('palak', 150), it('cucumber', 100), it('mustard-oil', 5)],
    snack1: [it('almonds', 20), it('walnuts', 12)],
    dinner: [it('chapati', 2), it('moong', 120), it('beans', 150), it('mustard-oil', 5)],
    snack2: [it('curd', 150)],
    bed: [it('isabgol', 1), it('greek-yogurt', 200)],
  },
  rest: {
    pre: [it('egg', 150), it('sids-milk', 150), it('guava', 150)],
    post: [it('whey', 1)],
    lunch: [it('chapati', 1), it('toor', 120), it('chicken', 150), it('palak', 150), it('cucumber', 100), it('mustard-oil', 5)],
    snack1: [it('almonds', 20), it('walnuts', 12), it('apple', 100)],
    dinner: [it('moong', 120), it('cabbage', 150), it('capsicum', 100), it('mustard-oil', 5)],
    snack2: [it('curd', 150)],
    bed: [it('isabgol', 1), it('greek-yogurt', 200)],
  },
}

/** Energy and carbs by day type; protein comes from body weight (diet-targets.js). */
export const DAY_TARGETS = Object.freeze({
  training: { kcal: 2050, carbs: 210 },
  cardio: { kcal: 1950, carbs: 195 },
  rest: { kcal: 1800, carbs: 155 },
})

/** The meal slots of a day type: same ids and times, named for the day (no "pre-gym" on a rest day). */
const SLOT_NAMES = {
  training: { pre: ['Pre-gym meal', 'With coffee and the omega-3'], post: ['Post-gym protein'] },
  cardio: { pre: ['Pre-cardio meal', 'With coffee and the omega-3'], post: ['After cardio'] },
  rest: { pre: ['Breakfast', 'With coffee and the omega-3'], post: ['Mid-morning protein'] },
}
export function slotsFor(dayType) {
  const names = SLOT_NAMES[dayType] || SLOT_NAMES.training
  return SLOTS.map(s => names[s.id] ? { ...s, title: names[s.id][0], note: names[s.id][1] } : s)
}

/**
 * The plan of a day type as { slot: [{ foodId, qty, key }] }. `veg` true (or per-slot in `vegMeals`)
 * swaps each non-veg item for its protein-matched veg alternative (diet-swap.js).
 */
export function planFor(dayType, { veg = false, vegMeals = {} } = {}) {
  const plan = PLANS[dayType] || PLANS.training
  const out = {}
  for (const s of SLOTS) {
    const v = vegMeals[s.id] ?? veg
    out[s.id] = (plan[s.id] || []).map((x, i) => {
      const item = { ...x, key: `${s.id}:${i}` }
      return v ? vegItem(item) : item
    })
  }
  return out
}

/** Totals of a plan (sumMacros over its items). */
export function planTotals(plan) {
  return sumMacros(Object.values(plan).flat().map(x => ({ food: foodById(x.foodId), qty: x.qty })))
}

/** The non-negotiables, checked against a day's entries. Water in ml. */
export function nonNegotiables(entries, water) {
  const sum = pred => (entries || []).filter(e => pred(foodById(e.foodId) || {}, e)).reduce((n, e) => n + (e.qty || 0), 0)
  const count = pred => (entries || []).filter(e => pred(foodById(e.foodId) || {}, e)).length
  return [
    { id: 'dal', label: '2 bowls dal (60 g raw)', done: count(f => f.cat === 'dal') >= 2 },
    { id: 'veg', label: 'Vegetables x2', done: count(f => f.cat === 'veg' && f.id !== 'cucumber' && f.id !== 'lettuce') >= 2 },
    { id: 'nuts', label: '32 g almonds + walnuts', done: sum(f => f.id === 'almonds' || f.id === 'walnuts') >= 32 },
    { id: 'curd', label: '1 bowl curd', done: count(f => f.id === 'curd' || f.id === 'sids-curd') >= 1 },
    { id: 'eggs', label: '3 eggs', done: sum(f => f.id === 'egg') >= 150 },
    { id: 'meat', label: '150 g chicken or fish', done: sum(f => ['chicken', 'mackerel', 'sardine', 'rohu', 'tilapia', 'prawns'].includes(f.id)) >= 150 },
    { id: 'water', label: '2.5 to 3 L water', done: (water || 0) >= TARGETS.waterMin },
  ]
}
