// Saved meals and "copy yesterday's lunch" on the Diet screen (our addition). The server keeps a
// meal's items as they were saved (api/health/meals.js); logging one again turns each item back into
// a diet entry for the chosen slot, through the same POST /api/health/diet/log as a single food.
import { foodById as dbFood, entryFor, MACRO_KEYS } from './diet-foods.js'

export const MEAL_NAME_MAX = 60
export const MAX_MEAL_ITEMS = 30

// What a logged entry carries that belongs to its day, not to the food.
const DAY_ONLY = ['id', 'at', 'slot', 'planKey']
const strip = e => Object.fromEntries(Object.entries(e || {}).filter(([k]) => !DAY_ONLY.includes(k)))

/** The items a meal is saved from: a slot's logged entries, without their day-only fields. */
export function mealItems(entries) {
  return (entries || []).filter(e => e && e.name && e.qty > 0).slice(0, MAX_MEAL_ITEMS).map(strip)
}

/** The body of POST /api/health/meals/save for a slot's entries. */
export function mealFromEntries(name, entries) {
  return { name: String(name || '').trim().slice(0, MEAL_NAME_MAX), items: mealItems(entries) }
}

/**
 * Diet entries for logging a meal (or a copied slot) into `slot`. An item from the food list is
 * worked out again from today's food list, so a corrected food counts as it is now; a custom one
 * (or a food since removed) keeps the numbers it was saved with.
 */
export function mealEntries(items, slot, foodById = dbFood) {
  return (items || []).slice(0, MAX_MEAL_ITEMS).map(it => {
    const food = it.foodId ? foodById(it.foodId) : null
    if (food && food.unit === it.unit) return entryFor(food, it.qty, slot)
    const e = { ...strip(it), slot }
    for (const k of MACRO_KEYS) if (e[k] === undefined) e[k] = null
    return e
  })
}

/** A slot's entries of another day (yesterday), ready to log again today in the same slot. */
export const copySlot = (entries, slot, foodById = dbFood) =>
  mealEntries((entries || []).filter(e => e.slot === slot), slot, foodById)

/** kcal and protein of a meal, for its row in the list. Unknowns count as 0. */
export function mealTotals(items) {
  let kcal = 0, protein = 0
  for (const it of items || []) { kcal += Number(it.kcal) || 0; protein += Number(it.protein) || 0 }
  return { kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10 }
}

