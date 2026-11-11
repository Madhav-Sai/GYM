import { describe, it, expect } from 'vitest'
import { externalWeights } from './external-weights.js'

describe('externalWeights', () => {
  it('turns InBody scans and the Whoop weight into weigh-ins, oldest first', () => {
    const r = externalWeights({ bodyweight: [], unit: 'kg' }, { inbody: [{ date: '2026-10-02', weight: 72.9 }], whoopBody: { weightKg: 72.4 }, whoopDay: '2026-11-10' })
    expect(r).toEqual([
      { id: 'inbody-2026-10-02', d: '2026-10-02', w: 72.9, src: 'inbody', label: 'InBody' },
      { id: 'whoop-2026-11-10', d: '2026-11-10', w: 72.4, src: 'whoop', label: 'Whoop' },
    ])
  })
  it('never adds the same one twice, converts to lb, skips nonsense', () => {
    const S = { unit: 'lb', bodyweight: [{ d: '2026-10-02', ins: [{ id: 'inbody-2026-10-02', w: 160.7 }] }] }
    const r = externalWeights(S, { inbody: [{ date: '2026-10-02', weight: 72.9 }, { date: 'bad', weight: 70 }, { date: '2026-11-01', weight: null }], whoopBody: { weightKg: 72.4 }, whoopDay: '2026-11-10' })
    expect(r).toEqual([{ id: 'whoop-2026-11-10', d: '2026-11-10', w: 159.6, src: 'whoop', label: 'Whoop' }])
  })
  it('one per day, the InBody one first', () => {
    const r = externalWeights({ bodyweight: [] }, { inbody: [{ date: '2026-11-10', weight: 72.9 }], whoopBody: { weightKg: 72.4 }, whoopDay: '2026-11-10' })
    expect(r.map(x => x.src)).toEqual(['inbody'])
  })
  it('nothing known, nothing to add', () => {
    expect(externalWeights({}, {})).toEqual([])
  })
})
