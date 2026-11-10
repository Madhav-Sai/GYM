// Helpers for Admin → Data and Admin → Foods (our addition). Pure, no React.

/** "812 B", "14.2 KB", "1.9 MB". */
export function fmtBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '–'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (Math.round(n / 102.4) / 10) + ' KB'
  return (Math.round(n / (1024 * 104.8576)) / 10) + ' MB'
}

/**
 * The parts of a JSON value whose key or value contains `q` (case-insensitive), with the path to
 * each kept so it still reads as the same tree. A match on a key keeps everything under it.
 * Returns undefined when nothing matches; an empty query returns the value unchanged.
 */
export function filterJson(value, q, depth = 0) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return value
  if (depth > 64) return undefined
  const hit = v => v != null && typeof v !== 'object' && String(v).toLowerCase().includes(needle)
  if (Array.isArray(value)) {
    const out = []
    value.forEach((v, i) => { const f = filterJson(v, needle, depth + 1); if (f !== undefined) out.push(f) })
    return out.length ? out : undefined
  }
  if (value && typeof value === 'object') {
    const out = {}
    let any = false
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase().includes(needle)) { out[k] = v; any = true; continue }
      const f = filterJson(v, needle, depth + 1)
      if (f !== undefined) { out[k] = f; any = true }
    }
    return any ? out : undefined
  }
  return hit(value) ? value : undefined
}

/** How many leaf values a JSON value holds (for "312 values" beside a folded node). */
export function countLeaves(value, depth = 0) {
  if (depth > 64) return 0
  if (Array.isArray(value)) return value.reduce((n, v) => n + countLeaves(v, depth + 1), 0)
  if (value && typeof value === 'object') return Object.values(value).reduce((n, v) => n + countLeaves(v, depth + 1), 0)
  return 1
}

export const FOOD_UNITS = ['g', 'ml', 'piece', 'slice', 'tsp', 'scoop']
export const FOOD_CATS = ['protein', 'dal', 'dairy', 'grain', 'nuts', 'fat', 'veg', 'fruit', 'snack', 'fibre', 'other']
const NUM = ['kcal', 'protein', 'carbs', 'fat', 'fiber']
const NULLABLE = ['satFat', 'omega3']
export const FOOD_FIELDS = ['name', 'unit', 'per', ...NUM, ...NULLABLE, 'veg', 'vegAlt', 'cat', 'note']

/** A blank form for a new food. */
export const blankFood = () => ({ name: '', unit: 'g', per: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, satFat: null, omega3: null, veg: true, vegAlt: null, cat: 'other', note: '' })

/** What is wrong with a food form, as a sentence, or null when it can be saved. */
export function foodProblem(f, ids = new Set()) {
  if (!f || !String(f.name || '').trim()) return 'Give it a name.'
  if (!FOOD_UNITS.includes(f.unit)) return 'Pick a unit.'
  if (!(f.per > 0) || f.per > 1000) return 'The amount the values are for must be above 0.'
  for (const k of NUM) if (typeof f[k] !== 'number' || !(f[k] >= 0)) return `${k} must be a number from 0.`
  for (const k of NULLABLE) if (f[k] != null && !(f[k] >= 0)) return `${k} must be empty or a number from 0.`
  if (f.vegAlt && !ids.has(f.vegAlt)) return 'The veg alternative is not a food in the list.'
  return null
}

/**
 * The body for POST /api/admin/foods/save from a form and the food it started from. A built-in
 * food sends only the fields that differ from the built-in values (`original`); an added food is
 * sent whole.
 */
export function foodSaveBody(form, { builtin = false, original = null } = {}) {
  const clean = {}
  for (const k of FOOD_FIELDS) {
    let v = form[k]
    if (k === 'name' || k === 'note') v = String(v || '').trim()
    if (k === 'note' && !v) v = null
    if (k === 'vegAlt' && !v) v = null
    if (k === 'veg') v = !!v
    clean[k] = v
  }
  if (!builtin) return { food: { ...(form.id ? { id: form.id } : {}), ...clean } }
  const changed = {}
  for (const k of FOOD_FIELDS) {
    const before = original ? (original[k] ?? null) : undefined
    if ((clean[k] ?? null) !== before) changed[k] = clean[k]
  }
  return { builtin: true, food: { id: form.id, ...changed } }
}
