// The food database for the Diet screen (our addition). Values are per `per` of `unit`: per 100 g
// (or 100 ml) for most foods, per piece for a chapati, per slice for bread, per teaspoon for isabgol,
// per scoop for whey. omega3 is in mg and null where no value was given. satFat is a value we are
// confident about (USDA-style references; dairy fat is about two thirds saturated), else null: an
// unknown is drawn as a dash and marks the day's total as partial, it is never read as 0.

const f = (id, name, unit, per, kcal, protein, carbs, fat, fiber, satFat, omega3, veg, cat, extra = {}) =>
  ({ id, name, unit, per, kcal, protein, carbs, fat, fiber, satFat, omega3, veg, cat, ...extra })

export const FOODS = [
  // protein, non-veg
  f('chicken', 'Chicken breast cooked', 'g', 100, 165, 31, 0, 3.6, 0, 1.0, null, false, 'protein'),
  f('egg', 'Egg whole boiled', 'g', 100, 155, 13, 1, 11, 0, 3.3, null, false, 'protein', { each: { g: 50, label: 'egg' } }),
  f('egg-white', 'Egg white', 'g', 100, 52, 11, 0.7, 0.2, 0, 0, null, false, 'protein', { each: { g: 33, label: 'white' } }),
  f('mackerel', 'Mackerel (bangda)', 'g', 100, 205, 19, 0, 14, 0, 3.3, 2600, false, 'protein'),
  f('sardine', 'Sardine', 'g', 100, 208, 25, 0, 11, 0, 1.5, 1480, false, 'protein'),
  f('rohu', 'Rohu', 'g', 100, 97, 17, 0, 3, 0, null, 300, false, 'protein'),
  f('tilapia', 'Tilapia', 'g', 100, 129, 26, 0, 3, 0, 0.9, 240, false, 'protein'),
  f('prawns', 'Prawns', 'g', 100, 99, 24, 0.2, 0.3, 0, 0.1, null, false, 'protein'),
  // protein, veg
  f('paneer', 'Paneer', 'g', 100, 265, 18, 1.2, 21, 0, 13, null, true, 'protein'),
  f('tofu', 'Tofu', 'g', 100, 76, 8, 1.9, 4.8, 0.3, 0.7, null, true, 'protein'),
  f('soya', 'Soya chunks dry', 'g', 100, 345, 52, 33, 0.5, 13, 0.1, null, true, 'protein'),
  f('whey', 'Whey protein AS-IT-IS ONE', 'scoop', 1, 120, 24, 3, 1.5, 0, 1, null, true, 'protein', { approx: true }),
  // dals and legumes (cooked)
  f('rajma', 'Rajma cooked', 'g', 100, 127, 9, 23, 0.5, 6, 0.1, null, true, 'dal'),
  f('kabuli', 'Kabuli chana cooked', 'g', 100, 164, 9, 27, 2.6, 8, 0.3, null, true, 'dal'),
  f('toor', 'Toor dal cooked', 'g', 100, 116, 7, 21, 0.4, 5, 0.1, null, true, 'dal'),
  f('moong', 'Moong dal cooked', 'g', 100, 105, 7, 19, 0.4, 8, 0.1, null, true, 'dal'),
  f('chana-dal', 'Chana dal cooked', 'g', 100, 120, 8, 20, 2, 8, 0.2, null, true, 'dal'),
  f('masoor', 'Masoor dal cooked', 'g', 100, 116, 9, 20, 0.4, 8, 0.1, null, true, 'dal'),
  // dairy
  f('greek-yogurt', 'Greek yogurt plain', 'g', 100, 59, 10, 3.6, 0.4, 0, 0.1, null, true, 'dairy'),
  f('curd', 'Curd plain', 'g', 100, 61, 3.5, 4.7, 3.3, 0, 2.1, null, true, 'dairy'),
  f('sids-milk', "Sid's Farm HP Toned Milk", 'ml', 100, 54, 4.4, 5, 3, 0, 1.9, null, true, 'dairy'),
  f('sids-curd', "Sid's Farm HP Curd", 'g', 100, 75, 6.3, 4, 3, 0, 1.9, null, true, 'dairy'),
  // grains
  f('rice', 'Rice cooked', 'g', 100, 130, 2.7, 28, 0.3, 0.4, 0.1, null, true, 'grain'),
  f('chapati', 'Chapati (40 g)', 'piece', 1, 104, 3, 18, 2.5, 2.7, null, null, true, 'grain'),
  f('oats', 'Rolled oats dry', 'g', 100, 389, 17, 66, 7, 10, 1.2, null, true, 'grain'),
  f('bread', 'Multigrain bread', 'slice', 1, 80, 4, 13, 1.2, 2, null, null, true, 'grain'),
  // nuts, seeds, fats
  f('almonds', 'Almonds', 'g', 100, 579, 21, 22, 50, 12, 3.8, null, true, 'nuts'),
  f('walnuts', 'Walnuts', 'g', 100, 654, 15, 14, 65, 7, 6.1, 9000, true, 'nuts'),
  f('pumpkin-seeds', 'Pumpkin seeds', 'g', 100, 559, 30, 11, 49, 6, 8.7, null, true, 'nuts'),
  f('peanut-butter', 'Peanut butter (Pintola)', 'g', 100, 588, 25, 20, 50, 6, 10, null, true, 'nuts'),
  f('mustard-oil', 'Mustard oil', 'g', 100, 884, 0, 0, 100, 0, 11.6, null, true, 'fat'),
  f('olive-oil', 'Olive oil', 'g', 100, 884, 0, 0, 100, 0, 13.8, null, true, 'fat'),
  // vegetables
  f('palak', 'Palak', 'g', 100, 23, 2.9, 3.6, 0.4, 2.2, 0.1, null, true, 'veg'),
  f('beans', 'Beans', 'g', 100, 31, 1.8, 7, 0.1, 3.4, 0, null, true, 'veg'),
  f('bhindi', 'Bhindi', 'g', 100, 33, 1.9, 7, 0.2, 3.2, 0, null, true, 'veg'),
  f('cabbage', 'Cabbage', 'g', 100, 25, 1.3, 6, 0.1, 2.5, 0, null, true, 'veg'),
  f('carrot', 'Carrot', 'g', 100, 41, 0.9, 10, 0.2, 2.8, 0, null, true, 'veg'),
  f('capsicum', 'Capsicum', 'g', 100, 31, 1, 6, 0.3, 2.1, 0, null, true, 'veg'),
  f('cucumber', 'Cucumber', 'g', 100, 15, 0.7, 3.6, 0.1, 0.5, 0, null, true, 'veg'),
  f('lettuce', 'Lettuce', 'g', 100, 15, 1.4, 2.9, 0.2, 1.3, 0, null, true, 'veg'),
  // fruit
  f('banana', 'Banana', 'g', 100, 89, 1.1, 23, 0.3, 2.6, 0.1, null, true, 'fruit'),
  f('apple', 'Apple', 'g', 100, 52, 0.3, 14, 0.2, 2.4, 0, null, true, 'fruit'),
  f('guava', 'Guava', 'g', 100, 68, 2.6, 14, 1, 5.4, 0.3, null, true, 'fruit'),
  f('orange', 'Orange', 'g', 100, 47, 0.9, 12, 0.1, 2.4, 0, null, true, 'fruit'),
  // snacks and fibre
  f('roasted-chana', 'Roasted chana', 'g', 100, 164, 9, 27, 2.6, 8, 0.3, null, true, 'snack'),
  f('isabgol', 'Isabgol', 'tsp', 1, 0, 0, 0, 0, 4, 0, null, true, 'fibre', { each: { g: 5, label: 'tsp' } }),
]

export const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'satFat', 'omega3']

/*
 * The instance's own changes (GET /api/health/foods, edited in Admin → Foods, api/health/foods.js):
 * `added` foods, `edited` fields on a built-in one, and `hidden` ids. A hidden food is left out of
 * the pick list but still resolves by id, so a plan item or an old entry that names it keeps working.
 * Each food comes back with `builtin` (it is in FOODS) and, when changed, `edited` / `hidden` set.
 */
export function mergeFoods(base, overrides) {
  const o = overrides || {}
  const edited = o.edited && typeof o.edited === 'object' ? o.edited : {}
  const hidden = new Set(Array.isArray(o.hidden) ? o.hidden : [])
  const ids = new Set(base.map(x => x.id))
  const out = base.map(x => {
    const e = edited[x.id]
    const row = e ? { ...x, ...e, id: x.id, edited: true } : { ...x }
    row.builtin = true
    if (hidden.has(x.id)) row.hidden = true
    return row
  })
  for (const a of Array.isArray(o.added) ? o.added : []) {
    if (!a || typeof a.id !== 'string' || ids.has(a.id) || !a.name || !a.unit || !(a.per > 0)) continue
    ids.add(a.id)
    out.push({ satFat: null, omega3: null, cat: 'other', veg: true, ...a, builtin: false, ...(hidden.has(a.id) ? { hidden: true } : {}) })
  }
  return out
}

let ALL = mergeFoods(FOODS, null)
let BY_ID = new Map(ALL.map(x => [x.id, x]))
let version = 0

/** Apply the instance's changes (null goes back to the built-in list). Returns the new version. */
export function setFoodOverrides(overrides) {
  ALL = mergeFoods(FOODS, overrides)
  BY_ID = new Map(ALL.map(x => [x.id, x]))
  return ++version
}
export const foodsVersion = () => version
/** The foods offered when logging: the merged list without the hidden ones. */
export const pickableFoods = () => ALL.filter(x => !x.hidden)
/** Every food, hidden ones too (Admin → Foods). */
export const allFoods = () => ALL
export const foodById = id => BY_ID.get(id) || null

const r1 = v => Math.round(v * 10) / 10

/** Macros of `qty` (in the food's unit) of a food. Unknowns stay null. */
export function macrosFor(food, qty) {
  const out = {}
  const k = (Number(qty) || 0) / food.per
  for (const m of MACRO_KEYS) out[m] = food[m] == null ? null : r1(food[m] * k)
  return out
}

/** A log entry (what POST /api/health/diet/log takes) for `qty` of a food. */
export function entryFor(food, qty, slot, planKey) {
  return { foodId: food.id, name: food.name, qty, unit: food.unit, slot, ...(planKey ? { planKey } : {}), ...macrosFor(food, qty) }
}

/** "150 g", "3 eggs (150 g)", "2 pieces", "1 tsp". */
export function amountLabel(food, qty) {
  const q = r1(qty)
  if (food.unit === 'g' || food.unit === 'ml') {
    if (food.each && qty % food.each.g === 0) {
      const n = qty / food.each.g
      return `${n} ${food.each.label}${n === 1 ? '' : 's'} (${q} ${food.unit})`
    }
    return `${q} ${food.unit}`
  }
  return `${q} ${food.unit}${q === 1 || food.unit === 'tsp' ? '' : 's'}`
}

/** Sums of a list of entries (or of { food, qty } items). Unknown counts per nullable macro. */
export function sumMacros(items) {
  const t = Object.fromEntries(MACRO_KEYS.map(k => [k, 0]))
  const unknown = { satFat: 0, omega3: 0 }
  for (const it of items || []) {
    const m = it.food ? macrosFor(it.food, it.qty) : it
    for (const k of MACRO_KEYS) {
      if (m[k] == null) { if (k in unknown) unknown[k]++; continue }
      t[k] += m[k]
    }
  }
  for (const k of MACRO_KEYS) t[k] = r1(t[k])
  return { ...t, unknown }
}
