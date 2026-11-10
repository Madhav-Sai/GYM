// The Diet screen's two evening flags (our addition). From 20:00 India time on the health day
// (ist.js), a day still under 25 g fibre or under 140 g protein says so: fibre is the LDL lever,
// protein is what keeps the muscle in a deficit. Before 20:00 there is still time, so no flag.
import { minutesOf } from './ist.js'

export const FIBER_FLAG_G = 25
export const PROTEIN_FLAG_G = 140
export const FLAG_FROM = '20:00'

/** Flags for a day's totals at `minutes` (healthMinutes, so after midnight counts as past 20:00). */
export function dietFlags(totals, minutes) {
  if (!totals || minutes < minutesOf(FLAG_FROM)) return []
  const out = []
  if ((totals.fiber || 0) < FIBER_FLAG_G) out.push({ id: 'fiber', have: totals.fiber || 0, need: FIBER_FLAG_G, text: 'Fibre is under {0} g by 20:00. It is your LDL lever: add dal, vegetables, guava or the isabgol.' })
  if ((totals.protein || 0) < PROTEIN_FLAG_G) out.push({ id: 'protein', have: totals.protein || 0, need: PROTEIN_FLAG_G, text: 'Protein is under {0} g by 20:00. In a deficit it is what keeps your muscle.' })
  return out
}
