import { describe, expect, it } from 'vitest'
import {
  DASH, fmtVal, markerFlag, refBar, markerSeries, latestMarker, labOverview, markerTemplate,
  weightPoints, waistPoints, inbodySeries, goalCurrent, goalProgress, targetText,
  testStatus, nextTests, homeTests, waistVsWeight, RECOMP_TEXT,
} from './medical.js'

const lab = (id, date, markers) => ({ id, date, lab: 'Orange Health Labs', markers })
const vitd = v => ({ key: 'vitd', name: 'Vitamin D', panel: 'Vitamins', value: v, unit: 'ng/mL', ref: { lo: 30, hi: 100, below: 20 } })
const hdl = v => ({ key: 'hdl', name: 'HDL', panel: 'Lipid profile', value: v, unit: 'mg/dL', ref: { lo: 50, hi: null } })
const ldl = v => ({ key: 'ldl', name: 'LDL', panel: 'Lipid profile', value: v, unit: 'mg/dL', ref: { lo: null, hi: 100 }, flag: v > 100 ? 'high' : 'normal' })
const b12 = { key: 'b12', name: 'B12', panel: 'Vitamins', value: 389, unit: 'pg/mL', ref: { lo: 187, hi: 883 } }
const urea = { key: 'urea', name: 'Urea', panel: 'Kidney', value: 17, unit: 'mg/dL', ref: { lo: 19, hi: 43 }, flag: 'low' }
const LABS = [lab('b', '2026-11-04', [vitd(24), hdl(38)]), lab('a', '2026-08-12', [vitd(11.8), hdl(33), ldl(149), b12, urea])]

describe('markers', () => {
  it('the printed flag wins, else the range decides; no range, no flag', () => {
    expect(markerFlag(ldl(149))).toBe('high')
    expect(markerFlag(vitd(11.8))).toBe('deficient')
    expect(markerFlag(vitd(24))).toBe('low')
    expect(markerFlag(vitd(40))).toBe('normal')
    expect(markerFlag({ value: 5, ref: {} })).toBe(null)
    expect(markerFlag({ value: null, ref: { lo: 1 } })).toBe(null)
  })
  it('the reference bar places the value against the band, inside 0..1', () => {
    const r = refBar(vitd(11.8))
    expect(r.value).toBeLessThan(r.lo)
    expect(r.hi).toBeLessThanOrEqual(1)
    const up = refBar(ldl(149))
    expect(up.openLo).toBe(true)
    expect(up.value).toBeGreaterThan(up.hi)
    expect(refBar({ value: 3, ref: {} })).toBe(null)
  })
  it('a series runs oldest first, and the latest reading names its test', () => {
    expect(markerSeries(LABS, 'vitd').map(p => p.y)).toEqual([11.8, 24])
    expect(latestMarker(LABS, 'ldl')).toMatchObject({ value: 149, date: '2026-08-12' })
    expect(latestMarker(LABS, 'nope')).toBe(null)
  })
  it('tracked markers become cards; the rest of the newest test folds by panel', () => {
    const o = labOverview([LABS[1]], ['vitd', 'hdl', 'ldl'])
    expect(o.cards.map(c => c.key)).toEqual(['vitd', 'hdl', 'ldl'])
    expect(o.panels.map(p => p.panel)).toEqual(['Vitamins', 'Kidney'])
    expect(o.panels.find(p => p.panel === 'Kidney').off).toBe(1)
  })
  it('the add form starts from every marker used, newest name first', () => {
    expect(markerTemplate(LABS).map(m => m.key)).toEqual(['vitd', 'hdl', 'ldl', 'b12', 'urea'])
  })
  it('a missing value is a dash, never 0', () => {
    expect(fmtVal(null)).toBe(DASH)
    expect(fmtVal(undefined)).toBe(DASH)
    expect(fmtVal(0)).toBe('0')
    expect(fmtVal(1.1457)).toBe('1.15')
    expect(fmtVal(7010)).toBe('7010')
  })
})

const INBODY = [
  { id: 'i1', date: '2026-10-02', weight: 72.9, bodyFatPct: 30.5, skeletalMuscle: 28.4, whr: 1.03 },
  { id: 'i2', date: '2026-12-01', weight: 71.5, bodyFatPct: 27, skeletalMuscle: null, whr: 0.98 },
]

describe('goals', () => {
  const goal = (key, start, lo, hi) => ({ key, start, lo, hi, by: '2027-04-01' })
  it('the current value comes from the newest test, scan or weigh-in', () => {
    expect(goalCurrent(goal('lab:vitd'), { labs: LABS })).toMatchObject({ value: 24, date: '2026-11-04' })
    expect(goalCurrent(goal('inbody:skeletalMuscle'), { inbody: INBODY })).toMatchObject({ value: 28.4, date: '2026-10-02' })
    expect(goalCurrent(goal('weight'), { inbody: INBODY, bodyweight: [{ d: '2026-12-05', w: 70.2 }] })).toMatchObject({ value: 70.2 })
    expect(goalCurrent(goal('weight'), { bodyweight: [{ d: '2026-12-05', w: 154 }], unit: 'lb' }).value).toBeCloseTo(69.85, 1)
    expect(goalCurrent(goal('lab:nope'), { labs: LABS })).toBe(null)
  })
  it('progress runs from the start to the nearest edge of the band', () => {
    const up = goalProgress(goal('lab:vitd', 11.8, 30, null), 24, '2026-11-08')
    expect(up.dir).toBe('up')
    expect(up.pct).toBeCloseTo((24 - 11.8) / (30 - 11.8))
    expect(up.toGo).toBeCloseTo(6)
    expect(up.daysLeft).toBe(144)
    const down = goalProgress(goal('inbody:bodyFatPct', 30.5, 18, 20), 25.25, '2026-11-08')
    expect(down.dir).toBe('down')
    expect(down.pct).toBeCloseTo(0.5)
    expect(goalProgress(goal('weight', 72.9, 66, 68), 67, '2026-11-08')).toMatchObject({ met: true, pct: 1, toGo: 0 })
    // Moving the wrong way is 0, not negative; no reading at all is null, not 0.
    expect(goalProgress(goal('lab:ldl', 149, null, 100), 160, '2026-11-08').pct).toBe(0)
    expect(goalProgress(goal('lab:ldl', 149, null, 100), null, '2026-11-08')).toMatchObject({ pct: null, current: null, met: false })
    expect(goalProgress({ ...goal('lab:ldl', 149, null, 100), by: '2026-11-01' }, 120, '2026-11-08').overdue).toBe(true)
  })
  it('targets read as 30+, <100 and 18-20', () => {
    expect(targetText({ lo: 30, hi: null })).toBe('30+')
    expect(targetText({ lo: null, hi: 100 })).toBe('<100')
    expect(targetText({ lo: 18, hi: 20 })).toBe('18-20')
    expect(targetText({ lo: null, hi: 0.9 })).toBe('<0.9')
  })
})

describe('next tests', () => {
  const TESTS = [
    { id: 't-cbc', title: 'Repeat CBC', from: '2026-12-09', to: '2026-12-23', reason: 'Lymphocytes 49.6 %, ALC 3160 flagged' },
    { id: 't-lipid', title: 'Lipid profile, fasted 12 hours', from: '2026-12-23', to: '2027-01-06' },
    { id: 't-apob', title: 'Ask the doctor for ApoB and Lp(a)', from: null, to: null },
    { id: 't-b12', title: 'B12 retest', from: '2027-02-11', to: null },
    { id: 't-physician', title: 'See a physician', from: null, to: null, prominent: true },
  ]
  it('each window reads upcoming, soon, due, overdue; a tick is done; no window is any time', () => {
    expect(testStatus(TESTS[0], '2026-11-12')).toBe('upcoming')
    expect(testStatus(TESTS[0], '2026-12-03')).toBe('soon')
    expect(testStatus(TESTS[0], '2026-12-09')).toBe('due')
    expect(testStatus(TESTS[0], '2026-12-23')).toBe('due')
    expect(testStatus(TESTS[0], '2026-12-24')).toBe('overdue')
    expect(testStatus({ ...TESTS[0], done: '2026-12-10' }, '2026-12-24')).toBe('done')
    expect(testStatus(TESTS[2], '2026-11-12')).toBe('anytime')
    expect(testStatus(TESTS[3], '2027-06-01')).toBe('due')   // open-ended: never overdue
  })
  it('the prominent one stays on top until ticked, then the most pressing first', () => {
    expect(nextTests(TESTS, '2026-11-12').map(x => x.id)).toEqual(['t-physician', 't-cbc', 't-lipid', 't-b12', 't-apob'])
    expect(nextTests(TESTS, '2026-12-24').map(x => x.id)).toEqual(['t-physician', 't-cbc', 't-lipid', 't-b12', 't-apob'])
    const ticked = TESTS.map(x => (x.id === 't-physician' || x.id === 't-cbc' ? { ...x, done: '2026-12-10' } : x))
    expect(nextTests(ticked, '2026-12-24').map(x => x.id)).toEqual(['t-lipid', 't-b12', 't-apob', 't-cbc', 't-physician'])
    expect(nextTests(TESTS, '2026-11-12')[1].daysUntil).toBe(27)
  })
  it('Home shows the prominent one and the next two open', () => {
    expect(homeTests(TESTS, '2026-11-12').map(x => x.id)).toEqual(['t-physician', 't-cbc', 't-lipid'])
    expect(homeTests(TESTS.map(x => ({ ...x, done: '2026-11-12' })), '2026-11-12')).toEqual([])
    expect(nextTests(undefined, '2026-11-12')).toEqual([])
  })
})

describe('waist vs weight', () => {
  const pts = rows => rows.map(([d, y]) => ({ d, t: Date.parse(d + 'T12:00:00Z'), y }))
  it('waist down while weight holds is named', () => {
    const r = waistVsWeight(pts([['2026-10-01', 92], ['2026-10-20', 91], ['2026-11-05', 89.5]]), pts([['2026-10-02', 72.9], ['2026-11-04', 72.4]]))
    expect(r).toMatchObject({ waistDelta: -2.5, weightDelta: -0.5, recomp: true, text: RECOMP_TEXT })
    expect(RECOMP_TEXT).toBe('Waist dropping while weight holds = muscle gained and fat lost')
  })
  it('waist and weight dropping together is plain weight loss, not the pattern', () => {
    const r = waistVsWeight(pts([['2026-10-01', 92], ['2026-11-05', 89]]), pts([['2026-10-01', 74], ['2026-11-05', 71]]))
    expect(r.recomp).toBe(false)
    expect(r.text).toBe(null)
  })
  it('needs readings far enough apart with a weigh-in near each end', () => {
    expect(waistVsWeight(pts([['2026-11-01', 92], ['2026-11-05', 89]]), pts([['2026-11-01', 72], ['2026-11-05', 72]]))).toBe(null)
    expect(waistVsWeight(pts([['2026-10-01', 92], ['2026-11-05', 89]]), pts([['2026-11-05', 72]]))).toBe(null)
    expect(waistVsWeight(pts([['2026-10-01', 92]]), pts([['2026-10-01', 72]]))).toBe(null)
  })
})

describe('series from the profile', () => {
  it('weigh-ins win over the InBody weight of the same day, and waist comes from measurements', () => {
    const w = weightPoints([{ d: '2026-10-02', w: 73.1 }], 'kg', INBODY)
    expect(w.map(p => [p.d, p.y])).toEqual([['2026-10-02', 73.1], ['2026-12-01', 71.5]])
    expect(waistPoints([{ d: '2026-11-01', waist: 90 }, { d: '2026-10-01', waist: 92 }, { d: '2026-10-15', chest: 100 }]).map(p => p.y)).toEqual([92, 90])
    expect(inbodySeries(INBODY, 'skeletalMuscle').map(p => p.y)).toEqual([28.4])
  })
})
