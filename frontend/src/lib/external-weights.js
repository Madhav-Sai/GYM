// Weights the app already knows from elsewhere (our addition): InBody scans (GET /api/medical) and
// Whoop's body measurement (GET /api/whoop/summary body.weightKg). The body-weight chart only reads
// weigh-ins, so a profile that never logged one drew "No data yet" next to a 72.9 kg scan. These
// become ordinary weigh-ins on one tap, each tagged with its source and added once (by id).
const KG_PER_LB = 0.45359237
const ISO = /^\d{4}-\d{2}-\d{2}$/
const ok = v => typeof v === 'number' && Number.isFinite(v) && v > 20 && v < 400

/** The readings not yet among S.bodyweight: [{ id, d, w, src, label }] in the profile's unit, oldest first. */
export function externalWeights(S, { inbody = [], whoopBody = null, whoopDay = null } = {}) {
  const have = new Set()
  for (const day of S?.bodyweight || []) for (const r of day?.ins || []) if (r?.id) have.add(String(r.id))
  const lb = S?.unit === 'lb'
  const conv = kg => Math.round((lb ? kg / KG_PER_LB : kg) * 10) / 10
  const out = []
  for (const s of Array.isArray(inbody) ? inbody : []) {
    const kg = s?.weight ?? s?.weightKg
    if (!ok(kg) || !ISO.test(String(s?.date || ''))) continue
    out.push({ id: 'inbody-' + s.date, d: s.date, w: conv(kg), src: 'inbody', label: 'InBody' })
  }
  if (whoopBody && ok(whoopBody.weightKg) && ISO.test(String(whoopDay || ''))) {
    out.push({ id: 'whoop-' + whoopDay, d: whoopDay, w: conv(whoopBody.weightKg), src: 'whoop', label: 'Whoop' })
  }
  const seenDay = new Set()
  return out.filter(r => !have.has(r.id))
    .sort((a, b) => (a.d < b.d ? -1 : 1))
    // one per day: InBody first (it is the measured one)
    .filter(r => (seenDay.has(r.d) ? false : (seenDay.add(r.d), true)))
}
