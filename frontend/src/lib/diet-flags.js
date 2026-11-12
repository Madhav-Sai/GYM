// The Diet screen's flags (our addition). From 20:00 India time on the health day
// (ist.js), a day still under 25 g fibre or under the protein floor says so: fibre is the LDL lever,
// protein is what keeps the muscle in a deficit. Before 20:00 there is still time, so no flag.
// Carbs are a ceiling (130 g, the triglyceride lever): that flag shows as soon as the day is over it,
// at any hour, since nothing later in the day takes carbs back off.
// The floor is 1.9 g/kg of the latest weight (diet-targets.js proteinFloor), 140 g with no weight.
import { minutesOf } from './ist.js'
import { TARGETS } from './diet-plan.js'

export const FIBER_FLAG_G = 25
export const PROTEIN_FLAG_G = 140
export const FLAG_FROM = '20:00'

/** Flags for a day's totals at `minutes` (healthMinutes, so after midnight counts as past 20:00).
 *  `targets` is dietTargets' answer; without one the floor is 140 g. */
export function dietFlags(totals, minutes, targets) {
  const floor = targets?.proteinFloor > 0 ? targets.proteinFloor : PROTEIN_FLAG_G
  if (!totals) return []
  const out = []
  const carbsMax = targets?.carbs > 0 ? targets.carbs : TARGETS.carbs
  if ((totals.carbs || 0) > carbsMax) out.push({ id: 'carbs', have: totals.carbs, need: carbsMax, text: 'Carbs over {0} g: the triglyceride lever.' })
  if (minutes < minutesOf(FLAG_FROM)) return out
  if ((totals.fiber || 0) < FIBER_FLAG_G) out.push({ id: 'fiber', have: totals.fiber || 0, need: FIBER_FLAG_G, text: 'Fibre is under {0} g by 20:00. It is your LDL lever: add dal, vegetables, guava or the isabgol.' })
  if ((totals.protein || 0) < floor) out.push({ id: 'protein', have: totals.protein || 0, need: floor, text: 'Protein is under {0} g by 20:00. In a deficit it is what keeps your muscle.' })
  return out
}
