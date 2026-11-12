// Omega-3 with what (our addition): the plan's three main meals (07:30 breakfast, 13:15 lunch, 23:00
// dinner) each carry one fish-oil capsule. It needs fat in the same meal to be absorbed, so each of
// those meals says which of its own items carry that fat, and how much fat the meal has. The owner
// takes fish oil on both tracks (his choice); the veg track only gets an optional algal note
// (diet-track.js ALGAL_NOTE).
import { foodById, macrosFor } from './diet-foods.js'

export const OMEGA_SLOTS = ['post', 'lunch', 'dinner']
export const CAPSULE_TEXT = 'Omega-3 (fish oil): take 1 capsule with this meal'
export const LOW_FAT_ADD = 'add 10 almonds or 1 tsp peanut butter'
// Under this the meal is too lean to carry the capsule.
export const MIN_FAT_G = 5
// An item counts as a fat carrier from this much fat; the meal names at most MAX_CARRIERS of them.
export const CARRIER_MIN_G = 3
export const MAX_CARRIERS = 4

// The plain name of each food as the line says it ("with the almonds, walnuts and pumpkin seeds").
export const CARRIER_NAMES = {
  almonds: 'almonds', walnuts: 'walnuts', 'pumpkin-seeds': 'pumpkin seeds', 'peanut-butter': 'peanut butter',
  egg: 'eggs', chicken: 'chicken', mackerel: 'mackerel', sardine: 'sardine', rohu: 'rohu', tilapia: 'tilapia',
  paneer: 'paneer', tofu: 'tofu', soya: 'soya chunks', curd: 'curd', 'sids-curd': 'curd', 'sids-milk': 'milk',
  'greek-yogurt': 'Greek yogurt', 'mustard-oil': 'cooking oil', 'olive-oil': 'olive oil', chapati: 'chapati',
  kabuli: 'chana', 'chana-dal': 'chana dal', 'roasted-chana': 'roasted chana', guava: 'guava', whey: 'whey',
}

const r0 = v => Math.round(v)

/**
 * The omega-3 line of one meal: { slot, fat (g, whole), carriers: [names, most fat first], low }.
 * `items` are the meal's plan items ({ foodId, qty }) or logged entries (with their own `fat`).
 * Null for a slot that does not carry the capsule.
 */
export function omegaForMeal(slot, items) {
  if (!OMEGA_SLOTS.includes(slot)) return null
  const rows = []
  for (const x of items || []) {
    const food = foodById(x.foodId)
    const fat = typeof x.fat === 'number' ? x.fat : food ? macrosFor(food, x.qty).fat || 0 : 0
    rows.push({ id: x.foodId, name: CARRIER_NAMES[x.foodId] || (food ? food.name.toLowerCase() : String(x.name || '').toLowerCase()), fat })
  }
  const fat = rows.reduce((n, x) => n + x.fat, 0)
  // one name per food, its fat summed (two curds read as "curd" once)
  const by = new Map()
  for (const x of rows) by.set(x.name, (by.get(x.name) || 0) + x.fat)
  const carriers = [...by].filter(([, g]) => g >= CARRIER_MIN_G).sort((a, b) => b[1] - a[1]).slice(0, MAX_CARRIERS).map(([n]) => n)
  return { slot, fat: r0(fat), carriers, low: fat < MIN_FAT_G }
}

/** The omega-3 lines of a day's plan ({ slot: items }), by slot. */
export function omegaForPlan(plan) {
  return Object.fromEntries(OMEGA_SLOTS.map(s => [s, omegaForMeal(s, plan?.[s] || [])]))
}

/** "a", "a and b", "a, b and c". `and` is the joining word (translated by the caller). */
export function joinNames(list, and = 'and') {
  if (list.length <= 1) return list.join('')
  return list.slice(0, -1).join(', ') + ' ' + and + ' ' + list[list.length - 1]
}

/** The English line, for tests and anything without i18n: the capsule, then what carries the fat. */
export function omegaText(o) {
  if (!o) return ''
  if (o.low || !o.carriers.length) return `${CAPSULE_TEXT}. This meal has about ${o.fat} g fat: ${LOW_FAT_ADD}.`
  return `${CAPSULE_TEXT}, with the ${joinNames(o.carriers)} (about ${o.fat} g fat).`
}
