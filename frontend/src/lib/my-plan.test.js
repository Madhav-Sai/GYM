import { describe, it, expect } from 'vitest'
import { applyMyPlan, buildMyPlan, hasMyPlan, myPlanLoadedOn, planRoutine, MY_PLAN_KEYS, MY_PLAN_VERSION, myPlanOutdated, upgradeMyPlan, isPlanLiftDay } from './my-plan.js'
import { warmupSource, rungRows } from './warmup-ramp.js'
import { EXIDX, isAssisted, isCardio } from './exercises.js'
import { modeOf } from './history.js'
import { glyphOf } from './glyphs.js'

const ids = () => { let n = 0; return () => 'r' + (++n) }
const fresh = () => ({ unit: 'kg', routines: [], week: {}, workouts: [] })

describe('the plan as written', () => {
  const { routines, schedule } = buildMyPlan('2026-11-02', ids())
  const by = k => routines.find(r => r.planKey === k)

  it('uses catalogue exercises only, each with a picture and a glyph that exists', () => {
    for (const r of routines) {
      expect(glyphOf(r.emoji)).toBe(r.emoji)
      for (const e of r.ex) expect(EXIDX[e.id], r.name + ' ' + e.id).toBeTruthy()
    }
  })

  it('has the sets, reps and kg of every lifting day', () => {
    expect(by('upper-a').ex.slice(0, 6).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 10, 25], [3, 10, 35], [3, 10, 22.7], [3, 10, 38.6], [3, 12, 31.8], [3, 12, 10]])
    expect(by('lower-a').ex.slice(0, 7).map(e => [e.id, e.sets, e.reps, e.weight])).toEqual([['2267', 3, 12, 30], ['0599', 3, 12, 15], ['0585', 3, 12, 15], ['0605', 3, 15, 15], ['5656', 3, 15, 10], ['9819', 3, 10, 0], ['0175', 3, 15, 15]])
    expect(by('lower-a').ex[6].inc).toBe(2.5)
    expect(by('upper-b').ex.slice(0, 6).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 10, 32], [3, 10, 25], [3, 8, 65], [3, 12, 2.5], [3, 12, 10], [3, 15, 15]])
    const lb = by('lower-b').ex
    expect(lb.slice(0, 4).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 12, 30], [3, 10, 8], [3, 12, 15], [3, 20, 15]])
    expect(lb[4]).toMatchObject({ id: '1163', sets: 3, reps: 12, weight: 0 })
    expect(modeOf(lb[5])).toBe('time')
    expect(lb[5]).toMatchObject({ id: '0463', sets: 3, sec: 45, inc: 10, prog: 'time' })
    expect(lb[6]).toMatchObject({ id: '0687', sets: 3, reps: 20, weight: 0 })
  })

  it('steps leg press by 5, machines and cables by 2.5, and takes 5 kg of help off the pull-up', () => {
    expect(by('lower-a').ex[0].inc).toBe(5)
    expect(by('upper-a').ex.slice(0, 6).every(e => e.inc === 2.5)).toBe(true)
    const pull = by('upper-b').ex[2]
    expect(isAssisted(pull)).toBe(true)
    expect(pull.inc).toBe(5)
    for (const r of routines) for (const e of r.ex) if (modeOf(e) === 'reps') expect(e).toMatchObject({ prog: 'linear', weeklyStep: true })
  })

  it('marks both lower days as the priority and ends each lifting day on the treadmill', () => {
    expect(by('lower-a').name).toMatch(/priority/i)
    expect(by('lower-b').name).toMatch(/priority/i)
    for (const k of ['upper-a', 'lower-a', 'upper-b', 'lower-b']) {
      const last = by(k).ex[by(k).ex.length - 1]
      expect(isCardio(last.id)).toBe(true)
      expect(last).toMatchObject({ mode: 'cardio', min: 15, speed: 5.5, incline: 5 })
    }
    expect(by('steady').ex[0].min).toBe(35)
    expect(by('intervals').ex[0].min).toBe(30)
  })

  it('puts the days on Monday to Saturday', () => {
    expect(Object.fromEntries(schedule.map(s => [s.day, s.key]))).toEqual({ 1: 'upper-a', 2: 'lower-a', 3: 'steady', 4: 'upper-b', 5: 'lower-b', 6: 'intervals' })
  })
})

describe('loading it', () => {
  it('adds the routines and the week, Sunday off', () => {
    const S = fresh()
    expect(applyMyPlan(S, '2026-11-02', ids())).toBe(6)
    expect(hasMyPlan(S)).toBe(true)
    expect(S.week[1]).toEqual([planRoutine(S, 'upper-a').id])
    expect(S.week[6]).toEqual([planRoutine(S, 'intervals').id])
    expect(S.week[0]).toEqual([])
    expect(myPlanLoadedOn(S)).toBe('2026-11-02')
  })

  it('is idempotent: a second load adds nothing and keeps edits and the first date', () => {
    const S = fresh()
    applyMyPlan(S, '2026-11-02', ids())
    planRoutine(S, 'upper-a').ex[0].weight = 30
    const before = S.routines.length
    expect(applyMyPlan(S, '2026-11-20', ids())).toBe(0)
    expect(S.routines).toHaveLength(before)
    expect(planRoutine(S, 'upper-a').ex[0].weight).toBe(30)
    expect(myPlanLoadedOn(S)).toBe('2026-11-02')
    expect(new Set(S.routines.map(r => r.id)).size).toBe(S.routines.length)
  })

  it('leaves the routines you already had alone and only adds what is missing', () => {
    const S = fresh()
    S.routines.push({ id: 'mine', name: 'Upper A', ex: [] })
    applyMyPlan(S, '2026-11-02', ids())
    S.routines = S.routines.filter(r => r.planKey !== 'steady')
    expect(applyMyPlan(S, '2026-11-03', ids())).toBe(1)
    expect(S.routines.find(r => r.id === 'mine')).toEqual({ id: 'mine', name: 'Upper A', ex: [] })
    expect(MY_PLAN_KEYS.every(k => S.routines.filter(r => r.planKey === k).length === 1)).toBe(true)
  })
})

describe('the warm-up of a lifting day', () => {
  const { routines } = buildMyPlan('2026-11-12', ids())
  it('gives the first exercise one set at 50 % for 10, and only the first', () => {
    for (const r of routines.filter(isPlanLiftDay)) {
      expect(r.ex[0]).toMatchObject({ warmup: 'own', warmupRows: [{ wp: 50, r: 10 }] })
      expect(r.ex.slice(1).some(e => e.warmup)).toBe(false)
      expect(warmupSource({ warmupAuto: 'off' }, r.ex[0])).toEqual({ kind: 'own', rows: [{ wp: 50, r: 10 }] })
    }
    expect(routines.filter(r => !isPlanLiftDay(r)).every(r => r.ex.every(e => !e.warmup))).toBe(true)
  })
  it('turns into one row at half the working weight', () => {
    const rows = rungRows([{ wp: 50, r: 10 }], { work: 30, grid: 2.5 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ w: 15, r: 10, warmup: true })
  })
})

// A profile that loaded the first version of the plan, as it was written then.
function v1Profile() {
  const S = fresh()
  applyMyPlan(S, '2026-11-02', ids())
  for (const r of S.routines) {
    delete r.planV
    r.ex = r.ex.filter(e => !['9819', '0175', '1163', '0687'].includes(e.id))
    for (const e of r.ex) {
      delete e.warmup; delete e.warmupRows
      if (e.mode === 'cardio' && r.planKey !== 'steady' && r.planKey !== 'intervals') e.min = 20
      if (e.id === '0463') { e.sec = 30; e.inc = 5 }
    }
  }
  return S
}

describe('updating a profile to the 6 am version', () => {
  it('knows a fresh load is current and a version 1 profile is not', () => {
    const S = fresh()
    expect(myPlanOutdated(S)).toBe(false)
    applyMyPlan(S, '2026-11-02', ids())
    expect(myPlanOutdated(S)).toBe(false)
    expect(S.routines.every(r => r.planV === MY_PLAN_VERSION)).toBe(true)
    expect(myPlanOutdated(v1Profile())).toBe(true)
  })

  it('adds the core work, lengthens the plank and the walk, and gives the warm-up set', () => {
    const S = v1Profile()
    expect(upgradeMyPlan(S)).toBe(6)
    expect(myPlanOutdated(S)).toBe(false)
    const fresh2 = buildMyPlan('2026-11-02', ids()).routines
    for (const r of S.routines) {
      const want = fresh2.find(x => x.planKey === r.planKey)
      expect(r.ex.map(e => e.id), r.planKey).toEqual(want.ex.map(e => e.id))
    }
    const plank = planRoutine(S, 'lower-b').ex.find(e => e.id === '0463')
    expect(plank).toMatchObject({ sec: 45, inc: 10 })
    expect(planRoutine(S, 'lower-a').ex.find(e => e.id === '0175')).toMatchObject({ sets: 3, reps: 15, weight: 15, inc: 2.5 })
    expect(planRoutine(S, 'upper-a').ex.at(-1).min).toBe(15)
    expect(planRoutine(S, 'upper-b').ex[0]).toMatchObject({ warmup: 'own', warmupRows: [{ wp: 50, r: 10 }] })
    expect(planRoutine(S, 'steady').ex[0].min).toBe(35)
  })

  it('never touches the weights, sets or reps you already lift, and keeps a longer plank', () => {
    const S = v1Profile()
    const la = planRoutine(S, 'lower-a'), ub = planRoutine(S, 'upper-b')
    la.ex[0].weight = 45; la.ex[1].reps = 14; ub.ex[2].weight = 50
    la.ex[0].warmup = 'none'
    planRoutine(S, 'lower-b').ex.find(e => e.id === '0463').sec = 60
    const before = JSON.parse(JSON.stringify(S.routines.map(r => r.ex.map(e => [e.id, e.sets, e.reps ?? null, e.weight ?? null]))))
    upgradeMyPlan(S)
    for (const [i, r] of S.routines.entries()) {
      for (const old of before[i]) expect(r.ex.find(e => e.id === old[0] && e.sets === old[1] && (e.reps ?? null) === old[2] && (e.weight ?? null) === old[3]), r.planKey + ' ' + old[0]).toBeTruthy()
    }
    expect(la.ex[0].weight).toBe(45)
    expect(la.ex[0].warmup).toBe('none')
    expect(planRoutine(S, 'lower-b').ex.find(e => e.id === '0463').sec).toBe(60)
  })

  it('does not add an exercise you already put in yourself, and is a no-op the second time', () => {
    const S = v1Profile()
    const la = planRoutine(S, 'lower-a')
    la.ex.splice(2, 0, { id: '0175', sets: 4, reps: 12, weight: 25 })
    upgradeMyPlan(S)
    expect(la.ex.filter(e => e.id === '0175')).toEqual([{ id: '0175', sets: 4, reps: 12, weight: 25 }])
    const snap = JSON.stringify(S.routines)
    expect(upgradeMyPlan(S)).toBe(0)
    expect(JSON.stringify(S.routines)).toBe(snap)
  })

  it('leaves routines that are not the plan alone', () => {
    const S = v1Profile()
    S.routines.push({ id: 'mine', name: 'Lower A', ex: [{ id: '2267', sets: 5, reps: 5, weight: 100 }] })
    upgradeMyPlan(S)
    expect(S.routines.find(r => r.id === 'mine')).toEqual({ id: 'mine', name: 'Lower A', ex: [{ id: '2267', sets: 5, reps: 5, weight: 100 }] })
  })
})
