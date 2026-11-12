import { describe, it, expect } from 'vitest'
import { isSunday, isFirstSunday, sundayItems, showSundayChecklist, sundayChecklist, toggleSundayCheck, sundayTicks, KEEP_SUNDAYS } from './sunday-checklist.js'

describe('which Sunday it is', () => {
  it('knows Sundays and the first Sunday of a month', () => {
    expect(isSunday('2026-11-15')).toBe(true)
    expect(isSunday('2026-11-16')).toBe(false)
    expect(isFirstSunday('2026-11-01')).toBe(true)
    expect(isFirstSunday('2026-11-08')).toBe(false)
    expect(isFirstSunday('2026-12-06')).toBe(true)
    expect(isSunday('junk')).toBe(false)
  })
  it('asks for D3 only on the first Sunday', () => {
    expect(sundayItems('2026-11-01')).toEqual(['weigh', 'waist', 'd3', 'plan'])
    expect(sundayItems('2026-11-15')).toEqual(['weigh', 'waist', 'plan'])
  })
  it('shows on a Sunday with nothing to train only', () => {
    expect(showSundayChecklist('2026-11-15', 0)).toBe(true)
    expect(showSundayChecklist('2026-11-15', 1)).toBe(false)
    expect(showSundayChecklist('2026-11-14', 0)).toBe(false)
  })
})

describe('ticks', () => {
  it('ticks and unticks per Sunday', () => {
    const S = { bodyweight: [], measurements: [] }
    toggleSundayCheck(S, '2026-11-15', 'plan')
    expect(S.sundayChecks).toEqual({ '2026-11-15': ['plan'] })
    expect(sundayChecklist(S, '2026-11-15').find(x => x.id === 'plan').done).toBe(true)
    expect(sundayChecklist(S, '2026-11-22').find(x => x.id === 'plan').done).toBe(false)
    toggleSundayCheck(S, '2026-11-15', 'plan')
    expect(sundayTicks(S, '2026-11-15')).toEqual([])
  })
  it('ignores unknown rows and junk state', () => {
    const S = { sundayChecks: { '2026-11-15': ['plan', 'nope', 3] } }
    expect(sundayTicks(S, '2026-11-15')).toEqual(['plan'])
    toggleSundayCheck(S, '2026-11-15', 'nope')
    expect(sundayTicks(S, '2026-11-15')).toEqual(['plan'])
    expect(sundayTicks({ sundayChecks: 'x' }, '2026-11-15')).toEqual([])
  })
  it('keeps only the latest Sundays', () => {
    const S = {}
    for (let i = 0; i < KEEP_SUNDAYS + 3; i++) toggleSundayCheck(S, new Date(Date.UTC(2026, 0, 4 + 7 * i, 12)).toISOString().slice(0, 10), 'weigh')
    expect(Object.keys(S.sundayChecks)).toHaveLength(KEEP_SUNDAYS)
    expect(Object.keys(S.sundayChecks)[0]).toBe('2026-01-25')
  })
  it('a weigh-in or a waist reading that day ticks its row', () => {
    const S = { bodyweight: [{ d: '2026-11-15', w: 80 }], measurements: [{ d: '2026-11-15', waist: 90 }, { d: '2026-11-08', waist: 91 }] }
    const rows = sundayChecklist(S, '2026-11-15')
    expect(rows.find(x => x.id === 'weigh')).toEqual({ id: 'weigh', done: true, auto: true })
    expect(rows.find(x => x.id === 'waist')).toEqual({ id: 'waist', done: true, auto: true })
    expect(sundayChecklist({ ...S, measurements: [{ d: '2026-11-15', chest: 100 }] }, '2026-11-15').find(x => x.id === 'waist').done).toBe(false)
  })
})
