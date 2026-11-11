// Barcode food logging (our addition): the pure half of the Diet screen's "Scan barcode". The server
// looks a code up on Open Food Facts (GET /api/health/foods/barcode, api/health/barcode.js) and
// answers a food per 100 g; this turns what the user picked (grams or servings) into a log entry the
// way lib/diet-foods.js entryFor does, and builds the "Add it yourself" food or entry when the code
// is unknown. A value the label does not give stays null, never 0.
import { macrosFor } from './diet-foods.js'

// The macros a log entry cannot do without (api/health/diet.js): fibre, saturated fat and omega-3
// may be unknown, these may not.
export const REQUIRED = ['kcal', 'protein', 'carbs', 'fat']

/** The digits of a scanned or typed code, or null when it is not an 8 to 14 digit EAN/UPC. */
export function cleanCode(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\s-]/g, '')
  return /^\d{8,14}$/.test(s) ? s : null
}

/** A food the instance already has for this code (one added from an earlier unknown scan), or null. */
export function localFoodFor(foods, code) {
  return (foods || []).find(f => f && f.barcode && f.barcode === code) || null
}

/**
 * A scanned product as a food lib/diet-foods.js understands: per 100 g, `each` from its serving so
 * amountLabel reads "2 servings (30 g)", and the missing required macros filled from `fill` (per
 * 100 g, what the user typed in). Unknown fibre and saturated fat stay null.
 */
export function scannedFood(food, fill = {}) {
  if (!food) return null
  const out = { ...food, unit: 'g', per: 100, omega3: food.omega3 ?? null, cat: food.cat || 'other' }
  for (const k of REQUIRED) if (out[k] == null && typeof fill[k] === 'number' && fill[k] >= 0) out[k] = fill[k]
  if (food.serving && food.serving.g > 0) out.each = { g: food.serving.g, label: 'serving' }
  out.name = displayName(food)
  return out
}

/** "Nutella (Ferrero)", unless the brand is already in the name. */
export function displayName(food) {
  const name = String(food?.name || '').trim()
  const brand = String(food?.brand || '').trim()
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name.slice(0, 80)
  return `${name} (${brand})`.slice(0, 80)
}

/** Which required macros the product has no value for (the sheet asks for them). */
export const missingRequired = food => REQUIRED.filter(k => food?.[k] == null)

/** Grams for an amount in grams or in servings. 0 when it cannot be worked out. */
export function gramsOf(food, amount, by = 'g') {
  const a = Number(amount)
  if (!(a > 0)) return 0
  if (by === 'serving') return food?.serving?.g > 0 ? Math.round(a * food.serving.g * 10) / 10 : 0
  return a
}

/**
 * The log entry (POST /api/health/diet/log) for `amount` grams or servings of a scanned food, or
 * null while a required macro is still unknown or the amount is 0.
 */
export function scannedEntry(food, { amount, by = 'g', slot = 'other', fill } = {}) {
  const f = scannedFood(food, fill)
  if (!f || missingRequired(f).length) return null
  const qty = gramsOf(food, amount, by)
  if (!qty) return null
  return { foodId: f.id, name: f.name, qty, unit: 'g', slot, ...macrosFor(f, qty) }
}

/** The custom form's starting point for a code nobody knows. */
export const customForCode = code => ({ name: '', qty: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, satFat: null, barcode: code || null })

/**
 * POST /api/admin/foods/save's food for a custom one the admin keeps: the numbers are for the whole
 * amount (c.qty grams), so that amount becomes the food's `per`.
 */
export function adminFoodFromCustom(c, { veg = true } = {}) {
  const name = String(c?.name || '').trim().slice(0, 80)
  const per = Number(c?.qty)
  if (!name || !(per > 0) || per > 1000) return null
  const n = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const food = { name, unit: 'g', per, kcal: n(c.kcal) ?? 0, protein: n(c.protein) ?? 0, carbs: n(c.carbs) ?? 0, fat: n(c.fat) ?? 0,
    fiber: n(c.fiber) ?? 0, satFat: n(c.satFat), omega3: null, veg: !!veg, cat: 'other', note: c.barcode ? `Barcode ${c.barcode}` : null }
  if (c.barcode) food.barcode = c.barcode
  return food
}
