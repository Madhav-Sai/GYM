// The weekly rule (our addition, lib/my-plan.js): all sets and reps done with no failed set and the
// weight goes up by the slot's step, otherwise the same again; at most one step a calendar week per
// exercise, across every routine that trains it.
import { describe, it, expect } from 'vitest'
import { nextPrescription, steppedThisWeek } from './progression.js'

const PRESS = '0576'      // lever chest press
const LEGS = '2267'       // lever seated leg press
const PULL = '0017'       // assisted pull-up
const slot = (id, weight, inc, reps = 10) => ({ id, sets: 3, reps, weight, prog: 'linear', weeklyStep: true, inc })
const A = { id: 'ra', name: 'Upper A' }, B = { id: 'rb', name: 'Upper B' }
let n = 0
const session = (d, rid, id, w, reps = [10, 10, 10], extra = {}, goal = Math.max(...reps) >= 12 ? 12 : Math.max(...reps) === 8 ? 8 : 10) => ({
  id: 'w' + (++n), d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), routineIds: [rid], routineId: rid,
  entries: [{ id, target: { mode: 'reps', sets: 3, reps: goal, weight: w }, planned: { sets: 3, reps: goal, weight: w }, sets: reps.map(r => ({ w, r, done: true, ...extra })) }]
})
const state = workouts => ({ unit: 'kg', weekStart: 1, workouts })

describe('weekly linear progression', () => {
  it('a clean session adds the slot step: 2.5 on a machine, 5 on the leg press', () => {
    // Monday 2 Nov 2026, next session Thursday the same week
    const S = state([session('2026-11-02', 'ra', PRESS, 25)])
    expect(nextPrescription(S, slot(PRESS, 25, 2.5), B, { today: '2026-11-05' })).toMatchObject({ kind: 'up', weight: 27.5 })
    const L = state([session('2026-11-03', 'ra', LEGS, 30, [12, 12, 12])])
    expect(nextPrescription(L, slot(LEGS, 30, 5, 12), A, { today: '2026-11-06' })).toMatchObject({ kind: 'up', weight: 35 })
  })

  it('takes only one step a week, even when the lift is trained in two routines', () => {
    const S = state([session('2026-11-02', 'ra', PRESS, 25), session('2026-11-05', 'rb', PRESS, 27.5)])
    // the step was taken on Thursday: the rest of that week holds
    expect(nextPrescription(S, slot(PRESS, 25, 2.5), A, { today: '2026-11-07' })).toMatchObject({ kind: 'hold', weight: 27.5 })
    // a new week, a new step
    expect(nextPrescription(S, slot(PRESS, 25, 2.5), A, { today: '2026-11-09' })).toMatchObject({ kind: 'up', weight: 30 })
    // Monday was itself a step over last week: Thursday holds
    const T = state([...S.workouts, session('2026-11-09', 'ra', PRESS, 30)])
    expect(nextPrescription(T, slot(PRESS, 25, 2.5), B, { today: '2026-11-12' })).toMatchObject({ kind: 'hold', weight: 30 })
  })

  it('repeats the weight after a miss, without a deload, however often', () => {
    const misses = ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12'].map(d => session(d, 'ra', PRESS, 25, [10, 10, 8]))
    expect(nextPrescription(state(misses), slot(PRESS, 25, 2.5), A, { today: '2026-11-16' })).toMatchObject({ kind: 'hold', weight: 25 })
  })

  it('treats a set marked as failed as a miss', () => {
    const S = state([session('2026-11-02', 'ra', PRESS, 25, [10, 10, 10], { failure: true })])
    expect(nextPrescription(S, slot(PRESS, 25, 2.5), A, { today: '2026-11-09' })).toMatchObject({ kind: 'hold', weight: 25 })
  })

  it('takes 5 kg of help away on the assisted pull-up, once a week', () => {
    const S = state([session('2026-11-05', 'rb', PULL, 65, [8, 8, 8])])
    const cfg = { ...slot(PULL, 65, 5, 8) }
    expect(nextPrescription(S, cfg, B, { today: '2026-11-12' })).toMatchObject({ kind: 'up', weight: 60 })
    const T = state([...S.workouts, session('2026-11-12', 'rb', PULL, 60, [8, 8, 8])])
    expect(nextPrescription(T, cfg, B, { today: '2026-11-13' })).toMatchObject({ kind: 'hold', weight: 60 })
  })

  it('leaves plain linear progression as it was', () => {
    const S = state([session('2026-11-02', 'ra', PRESS, 25), session('2026-11-05', 'ra', PRESS, 27.5)])
    const plain = { id: PRESS, sets: 3, reps: 10, weight: 25, prog: 'linear', inc: 2.5 }
    expect(nextPrescription(S, plain, A, { today: '2026-11-06' })).toMatchObject({ kind: 'up', weight: 30 })
  })
})

describe('steppedThisWeek', () => {
  const s = (d, weight) => ({ d, weight })
  it('compares the week with the last session before it', () => {
    expect(steppedThisWeek([s('2026-10-29', 25), s('2026-11-02', 25)], '2026-11-05', 1)).toBe(false)
    expect(steppedThisWeek([s('2026-10-29', 25), s('2026-11-02', 27.5)], '2026-11-05', 1)).toBe(true)
    expect(steppedThisWeek([s('2026-11-02', 25)], '2026-11-05', 1)).toBe(false)
    expect(steppedThisWeek([s('2026-10-29', 65), s('2026-11-02', 60)], '2026-11-05', 1, true)).toBe(true)
    expect(steppedThisWeek([s('2026-10-29', 25)], '2026-11-05', 1)).toBe(false)
  })
})
