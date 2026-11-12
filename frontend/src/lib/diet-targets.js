// The day's diet targets (our addition). Protein follows body weight: grams per kg (2.3 by default,
// 1.6 to 2.6 in the Diet screen's settings) times the latest weight, rounded to 5 g, so 72.1 kg
// gives 165 g, the triglyceride plan's target. The evening flag (diet-flags.js) fires under 1.9 g/kg, about 140 g at that weight.
// With no weight known it is the plan's own 165 g and 140 g. The kcal target is the plan's unless
// one is set. The Diet screen and the Home card both read their numbers from dietTargets.
import { TARGETS, DAY_TARGETS } from './diet-plan.js'
import { weightPoints } from './medical.js'

export const DEFAULT_G_PER_KG = 2.3
export const FLOOR_G_PER_KG = 1.9
export const G_PER_KG_MIN = 1.6
export const G_PER_KG_MAX = 2.6
export const G_PER_KG_STEP = 0.1
export const FALLBACK_PROTEIN = TARGETS.protein
export const FALLBACK_FLOOR = 140
export const KCAL_MIN = 1000
export const KCAL_MAX = 6000

const isNum = v => typeof v === 'number' && Number.isFinite(v)
const r1 = v => Math.round(v * 10) / 10
export const round5 = v => Math.round(v / 5) * 5

/** grams per kg from the prefs, clamped to 1.6..2.6 and a tenth; the default when unset. */
export function gPerKgOf(prefs) {
  const v = prefs?.proteinPerKg
  if (!isNum(v)) return DEFAULT_G_PER_KG
  return r1(Math.min(G_PER_KG_MAX, Math.max(G_PER_KG_MIN, v)))
}

/**
 * The newest body weight in kg, from the app's weigh-ins (S.bodyweight, in the profile's unit) and
 * the InBody scans (GET /api/medical, kg), whichever is newer; a weigh-in wins on the same day.
 * { kg, date, source: 'weigh-in' | 'inbody' } or null.
 */
export function latestWeightKg(bodyweight = [], unit = 'kg', inbody = []) {
  const p = weightPoints(bodyweight, unit, inbody).filter(x => x.y > 20 && x.y < 400).at(-1)
  if (!p) return null
  const fromWeighIn = (Array.isArray(bodyweight) ? bodyweight : []).some(b => b && b.d === p.d && isNum(b.w))
  return { kg: r1(p.y), date: p.d, source: fromWeighIn ? 'weigh-in' : 'inbody' }
}

/** Protein in g for a weight and g/kg, to 5 g; the plan's 165 g with no weight. */
export function proteinTarget(weightKg, gPerKg = DEFAULT_G_PER_KG) {
  return isNum(weightKg) && weightKg > 0 ? round5(gPerKg * weightKg) : FALLBACK_PROTEIN
}

/** The evening protein floor in g: 1.9 g/kg to 5 g, or 140 g with no weight. */
export function proteinFloor(weightKg) {
  return isNum(weightKg) && weightKg > 0 ? round5(FLOOR_G_PER_KG * weightKg) : FALLBACK_FLOOR
}

/**
 * Every target for the day: the plan's TARGETS with protein from body weight and kcal from the
 * prefs. `weight` is latestWeightKg's answer (or null). Adds proteinFloor, gPerKg, weightKg and
 * kcalOwn (whether the kcal target is the user's own).
 */
export function dietTargets({ prefs, weight, dayType } = {}) {
  const day = DAY_TARGETS[dayType] || DAY_TARGETS.training
  const gPerKg = gPerKgOf(prefs)
  const kg = isNum(weight?.kg) ? weight.kg : null
  const kcalOwn = isNum(prefs?.kcalTarget) && prefs.kcalTarget >= KCAL_MIN && prefs.kcalTarget <= KCAL_MAX
  return {
    ...TARGETS,
    carbs: day.carbs,
    dayType: DAY_TARGETS[dayType] ? dayType : 'training',
    protein: proteinTarget(kg, gPerKg),
    proteinFloor: proteinFloor(kg),
    kcal: kcalOwn ? Math.round(prefs.kcalTarget) : day.kcal,
    planKcal: day.kcal,
    kcalOwn,
    gPerKg,
    weightKg: kg,
    weightDate: weight?.date || null,
  }
}

/** "165 g = 2.3 g/kg x 72.1 kg", or null with no weight known. */
export function proteinBasis(targets) {
  if (!targets || !isNum(targets.weightKg)) return null
  return `${targets.protein} g = ${targets.gPerKg.toFixed(1)} g/kg x ${targets.weightKg.toFixed(1)} kg`
}
