import { describe, it, expect } from 'vitest'
import { applyMyPlan, buildMyPlan, hasMyPlan, myPlanLoadedOn, planRoutine, MY_PLAN_KEYS } from './my-plan.js'
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
    expect(by('lower-a').ex.slice(0, 5).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 12, 30], [3, 12, 15], [3, 12, 15], [3, 15, 15], [3, 15, 10]])
    expect(by('upper-b').ex.slice(0, 6).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 10, 32], [3, 10, 25], [3, 8, 65], [3, 12, 2.5], [3, 12, 10], [3, 15, 15]])
    const lb = by('lower-b').ex
    expect(lb.slice(0, 4).map(e => [e.sets, e.reps, e.weight])).toEqual([[3, 12, 30], [3, 10, 8], [3, 12, 15], [3, 20, 15]])
    expect(modeOf(lb[4])).toBe('time')
    expect(lb[4]).toMatchObject({ id: '0463', sets: 3, sec: 30 })
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
      expect(last).toMatchObject({ mode: 'cardio', min: 20, speed: 5.5, incline: 5 })
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
