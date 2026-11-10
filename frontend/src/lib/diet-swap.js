// Veg swaps for the Diet screen (our addition). A swap is PROTEIN-MATCHED: the veg food's amount is
// whatever carries the same grams of protein, and the kcal and protein (and fat) it changes are shown
// as they are, not rounded away. 150 g chicken (46.5 g protein) is about 89 g dry soya chunks or 258 g
// paneer; the paneer is some 437 kcal more, and that is what the screen says.
import { foodById, macrosFor } from './diet-foods.js'

// Each non-veg food and its veg alternatives, the first being the default.
export const VEG_ALTS = {
  chicken: ['soya', 'paneer'],
  mackerel: ['paneer', 'tofu'],
  sardine: ['paneer', 'tofu'],
  rohu: ['paneer', 'tofu'],
  tilapia: ['paneer', 'tofu'],
  egg: ['paneer', 'greek-yogurt'],
  'egg-white': ['greek-yogurt', 'paneer'],
  prawns: ['tofu'],
}

export const altsFor = foodId => VEG_ALTS[foodId] || []

const r1 = v => Math.round(v * 10) / 10

/**
 * The protein-matched amount of `altId` for `qty` of `foodId`, with the honest deltas
 * (alternative minus original). Null when there is nothing to swap or the alternative has no protein.
 */
export function proteinSwap(foodId, qty, altId) {
  const from = foodById(foodId), to = foodById(altId)
  if (!from || !to || !to.protein) return null
  const a = macrosFor(from, qty)
  // the amount of the alternative carrying the same protein, to a gram (or a tenth of a piece)
  const exact = (a.protein / to.protein) * to.per
  const altQty = to.unit === 'g' || to.unit === 'ml' ? Math.round(exact) : r1(exact)
  const b = macrosFor(to, altQty)
  return {
    from: { food: from, qty, ...a },
    to: { food: to, qty: altQty, ...b },
    delta: {
      kcal: r1(b.kcal - a.kcal), protein: r1(b.protein - a.protein), fat: r1(b.fat - a.fat),
      satFat: a.satFat == null || b.satFat == null ? null : r1(b.satFat - a.satFat),
    },
  }
}

/** The veg swap of a plan item (the default alternative, or `altId`), or the item itself when it is veg. */
export function vegItem(item, altId) {
  const food = foodById(item.foodId)
  if (!food || food.veg) return item
  const alt = altId || altsFor(item.foodId)[0]
  const s = alt && proteinSwap(item.foodId, item.qty, alt)
  return s ? { ...item, foodId: alt, qty: s.to.qty, swappedFrom: { foodId: item.foodId, qty: item.qty }, delta: s.delta } : item
}

/** Signed text for a delta: "+61", "-3.2", "0"; a dash when unknown. */
export const signed = v => (v == null ? '–' : v > 0 ? '+' + v : String(v))
