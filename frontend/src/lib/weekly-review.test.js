import { describe, it, expect } from 'vitest'
import {
  mondayOf, reviewWeekStart, reviewDue, reviewKey, stepWeek, topSets, beats, liftChanges, workoutTally,
  weekPRs, checkIns, whoopWeek, dietWeek, supplementsWeek, suggestionsOf, weeklyReview, deloadStep,
} from './weekly-review.js'

// Week of Monday 2 November 2026 to Sunday 8 November; the two before start 26 and 19 October.
const W = '2026-11-02', W1 = '2026-10-26', W2 = '2026-10-19'
const set = (w, r) => ({ w, r, done: true })
const workout = (id, d, entries, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), name: 'Lower A', routineIds: ['r1'], routineId: 'r1', entries, ...extra })
const base = over => ({ unit: 'kg', routines: [], week: {}, dayPlan: {}, workouts: [], bodyweight: [], gymVisits: {}, queue: null, ...over })

describe('weeks', () => {
  it('finds the Monday and the week a review opens on', () => {
    expect(mondayOf('2026-11-08')).toBe(W) // Sunday
    expect(mondayOf('2026-11-02')).toBe(W)
    expect(mondayOf('2026-11-04')).toBe(W)
    expect(reviewWeekStart('2026-11-08')).toBe(W) // Sunday: this week
    expect(reviewWeekStart('2026-11-09')).toBe(W) // Monday: the week just gone
    expect(reviewWeekStart('2026-11-11')).toBe(W) // Wednesday from Stats: the last full week
  })
  it('is due on Sunday and Monday until put away', () => {
    expect(reviewDue({}, '2026-11-08')).toBe(true)
    expect(reviewDue({}, '2026-11-09')).toBe(true)
    expect(reviewDue({}, '2026-11-10')).toBe(false)
    expect(reviewDue({ weeklyReviewSeen: reviewKey(W) }, '2026-11-09')).toBe(false)
    expect(reviewDue({ weeklyReviewSeen: reviewKey(W1) }, '2026-11-09')).toBe(true)
  })
  it('steps weeks, never past the current one', () => {
    expect(stepWeek(W, -1, '2026-11-11')).toBe(W1)
    expect(stepWeek(W, 1, '2026-11-11')).toBe('2026-11-09')
    expect(stepWeek('2026-11-09', 1, '2026-11-11')).toBe('2026-11-09')
  })
})

describe('lifts', () => {
  const S = base({
    workouts: [
      workout('a', '2026-10-20', [{ id: 'leg-press', sets: [set(100, 10)] }, { id: 'squat', sets: [set(80, 5)] }]),
      workout('b', '2026-10-27', [{ id: 'leg-press', sets: [set(100, 10)] }, { id: 'squat', sets: [set(82.5, 5)] }]),
      workout('c', '2026-11-03', [{ id: 'leg-press', sets: [set(100, 9)] }, { id: 'squat', sets: [set(85, 5), set(60, 8)] }, { id: 'curl', sets: [set(12, 10)] }], { prs: ['squat'] }),
    ],
  })
  it('takes the best set of the week by estimated 1RM', () => {
    const top = topSets(S, W)
    expect(top.get('squat')).toMatchObject({ w: 85, r: 5 })
    expect(top.has('bench')).toBe(false)
  })
  it('counts heavier, or the same weight for more reps, as progress', () => {
    expect(beats({ w: 85, r: 5, est: 99 }, { w: 82.5, r: 5, est: 96 })).toBe(true)
    expect(beats({ w: 80, r: 6, est: 96 }, { w: 80, r: 5, est: 93 })).toBe(true)
    expect(beats({ w: 80, r: 5, est: 93 }, { w: 80, r: 5, est: 93 })).toBe(false)
  })
  it('marks up, new and stalled against the weeks before', () => {
    const l = Object.fromEntries(liftChanges(S, W).map(x => [x.id, x]))
    expect(l.squat.status).toBe('up')
    expect(l.squat.stalled).toBe(false)
    expect(l.curl.status).toBe('new')
    expect(l['leg-press'].status).toBe('same')
    expect(l['leg-press'].stalled).toBe(true) // 100x10, 100x10, 100x9
  })
  it('reads PRs from the finished sessions', () => {
    expect(weekPRs(S, W).map(p => p.id)).toEqual(['squat'])
  })
  it('suggests the deload for the stalled lift in the profile unit', () => {
    const r = weeklyReview(S, W, '2026-11-09')
    expect(r.suggestions[0].id).toBe('stalled')
    expect(r.suggestions[0].args[1]).toBe('5 kg')
    expect(deloadStep(30)).toBe(2.5)
    expect(deloadStep(100, 'lb')).toBe(10)
  })
})

describe('workouts and check-ins', () => {
  it('counts planned days against the days trained', () => {
    const S = base({
      routines: [{ id: 'r1', name: 'Lower A', ex: [{ id: 'squat' }] }],
      week: { 1: 'r1', 2: 'r1', 4: 'r1', 5: 'r1' },
      workouts: [workout('a', '2026-11-02', []), workout('b', '2026-11-03', []), workout('c', '2026-11-03', []), workout('d', '2026-11-07', [])],
      gymVisits: { '2026-11-04': { on: true, _ts: 1 }, '2026-11-02': { on: true, _ts: 1 }, '2026-11-12': { on: true, _ts: 1 } },
    })
    expect(workoutTally(S, W, '2026-11-09')).toEqual({ sessions: 4, days: 3, planned: 4, plannedDone: 2 })
    expect(checkIns(S, W)).toEqual({ checkIns: 2, gymDays: 4 })
  })
})

describe('whoop', () => {
  const summary = {
    connected: true,
    days: [
      { day: '2026-10-27', recovery: 50, sleepMin: 400 }, { day: '2026-10-28', recovery: 60, sleepMin: 420 },
      { day: '2026-11-02', recovery: 70, sleepMin: 480 }, { day: '2026-11-03', recovery: 60, sleepMin: null }, { day: '2026-11-04', recovery: null, sleepMin: 390 },
    ],
    workouts: [
      { day: '2026-11-04', sport: 'running', maxHr: 178, zonesMin: { 4: 8, 5: 4 } },
      { day: '2026-11-07', sport: 'treadmill', maxHr: 168, zonesMin: { 4: 6, 5: 0 } },
      { day: '2026-10-30', sport: 'treadmill', maxHr: 180, zonesMin: { 4: 30, 5: 5 } },
    ],
  }
  it('averages recovery and sleep, and the change on the week before', () => {
    const w = whoopWeek(summary, W)
    expect(w.recovery).toBe(65)
    expect(w.prevRecovery).toBe(55)
    expect(w.trend).toBe(10)
    expect(w.sleepMin).toBe(435)
    expect(w.zone45).toBe(18)
    expect(w.zoneStatus).toBe('building')
    expect(w.hrFlags).toEqual([{ day: '2026-11-04', sport: 'running', maxHr: 178 }])
  })
  it('is null when Whoop is not connected', () => {
    expect(whoopWeek(null, W)).toBeNull()
    expect(whoopWeek({ connected: false }, W)).toBeNull()
  })
  it('flags the heart rate and the zone in the suggestions', () => {
    const r = weeklyReview(base({}), W, '2026-11-09', { whoop: summary })
    expect(r.suggestions.map(s => s.id)).toEqual(['hr', 'zone-low'])
  })
})

describe('diet and supplements', () => {
  const dayView = (protein, n = 1) => ({ entries: Array.from({ length: n }, (_, i) => ({ id: 'e' + i })), totals: { protein, kcal: n ? 1500 : 0 } })
  it('counts the days the protein target was hit and the average of the logged days', () => {
    const dietDays = { '2026-11-02': dayView(165), '2026-11-03': dayView(120), '2026-11-04': dayView(0, 0), '2026-11-05': dayView(160) }
    expect(dietWeek(dietDays, W, '2026-11-09', 160)).toEqual({ days: 7, logged: 3, hit: 2, target: 160, avgProtein: 148 })
    expect(dietWeek({}, W, '2026-11-09', 160)).toBeNull()
    // the current week only counts the days so far
    expect(dietWeek(dietDays, W, '2026-11-03', 160).days).toBe(2)
  })
  it('counts supplements taken against due, D3 on its own', () => {
    const supps = {
      list: [
        { id: 'omega', name: 'Omega-3', schedule: { kind: 'daily' }, createdDay: '2026-01-01' },
        { id: 'd3', name: 'Vitamin D3', schedule: { kind: 'weekly', dow: 0 }, createdDay: '2026-01-01' },
      ],
      log: { '2026-11-02': { omega: { status: 'taken' } }, '2026-11-03': { omega: { status: 'taken' } }, '2026-11-08': { omega: { status: 'skipped' } } },
    }
    const s = supplementsWeek(supps, W, '2026-11-09')
    expect(s.due).toBe(8)
    expect(s.taken).toBe(2)
    expect(s.pct).toBe(25)
    expect(s.d3).toEqual({ due: 1, taken: 0 })
    expect(s.missed.map(m => m.id)).toEqual(['omega', 'd3'])
    expect(supplementsWeek(null, W, '2026-11-09')).toBeNull()
  })
  it('a quiet good week says to keep the plan', () => {
    const S = base({ workouts: [workout('a', '2026-10-27', [{ id: 'squat', sets: [set(80, 5)] }]), workout('b', '2026-11-03', [{ id: 'squat', sets: [set(85, 5)] }])] })
    expect(suggestionsOf(weeklyReview(S, W, '2026-11-09')).map(s => s.id)).toEqual(['keep'])
  })
  it('the whole review holds every part', () => {
    const r = weeklyReview(base({}), W, '2026-11-09', { proteinTarget: 160, dietDays: {}, supplements: { list: [], log: {} } })
    expect(r).toMatchObject({ key: 'w:' + W, from: W, to: '2026-11-08', current: false, prs: [], whoop: null, diet: null })
    expect(r.supplements).toMatchObject({ due: 0, pct: null })
    expect(r.suggestions).toEqual([])
  })
})
