import { describe, it, expect } from 'vitest'
import {
  planWhoopImport, applyWhoopImport, whoopSessionOf, sportLabel, cultName, notImportable, withWhoopSkip,
  renameWorkout, whoopSessionView, whoopImportOn, isWhoopWorkout, whoopSessionId, SKIP, CULT_CLASSES,
} from './whoop-import.js'
import { mergeStates, STAMPED_MAPS, stampChange } from './sync-merge.js'
import { STAMPED_MAPS as API_STAMPED_MAPS, stampPut } from '../../../api/sync-stamps.js'
import { streakInfo } from './streak.js'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const T = h => Date.parse('2026-11-09T00:00:00Z') + h * 3600000
const iso = h => new Date(T(h)).toISOString()
const ww = (id, from, to, extra = {}) => ({
  id, day: '2026-11-09', sport: 'functional fitness', start: iso(from), end: to == null ? null : iso(to),
  strain: 11.4, avgHr: 141, maxHr: 178, kj: 2092, distanceM: null, zonesMin: [2, 5, 10, 15, 12, 6], state: 'SCORED', ...extra,
})
const gym = (id, from, to, extra = {}) => ({ id, d: '2026-11-09', start: T(from), end: T(to), name: 'Push', routineIds: [], entries: [{ id: 'bench', sets: [{ w: 60, r: 8, done: true }] }], prs: [], _ts: 1, ...extra })
const base = (extra = {}) => ({ workouts: [], whoopImported: {}, ...extra })

describe('which Whoop workouts become workouts', () => {
  it('adds one workout per new Whoop workout, in the app\'s workout shape, with no sets', () => {
    const p = planWhoopImport(base(), [ww('a', 7, 8)], { now: NOW })
    expect(p.link).toEqual([])
    expect(p.add).toHaveLength(1)
    const w = p.add[0]
    expect(w).toMatchObject({ id: 'whoop-a', d: '2026-11-09', start: T(7), end: T(8), name: 'Functional fitness', entries: [], prs: [], routineIds: [], source: 'whoop' })
    expect(w.whoop).toEqual({ id: 'a', sport: 'functional fitness', strain: 11.4, avgHr: 141, maxHr: 178, kcal: 500, distanceM: null, zonesMin: [2, 5, 10, 15, 12, 6] })
    expect(isWhoopWorkout(w)).toBe(true)
  })

  it('never imports one still open or being scored, shorter than 5 minutes, or older than 90 days', () => {
    expect(notImportable(ww('o', 7, null), NOW)).toBe('open')
    expect(notImportable(ww('p', 7, 8, { state: 'PENDING_SCORE' }), NOW)).toBe('pending')
    expect(notImportable(ww('s', 7, 7 + 4 / 60), NOW)).toBe('short')
    expect(notImportable(ww('s5', 7, 7 + 5 / 60), NOW)).toBe(null)
    const old = { ...ww('old', 0, 1), start: new Date(NOW - 91 * 86400000).toISOString(), end: new Date(NOW - 91 * 86400000 + 3600000).toISOString() }
    expect(notImportable(old, NOW)).toBe('old')
    expect(planWhoopImport(base(), [ww('o', 7, null), ww('s', 7, 7.05), old], { now: NOW }).add).toEqual([])
  })

  it('skips what S.whoopImported already holds, however it was settled', () => {
    const S = base({ whoopImported: { a: { s: 'whoop-a', _ts: 1 }, b: { s: SKIP, _ts: 1 } } })
    expect(planWhoopImport(S, [ww('a', 7, 8), ww('b', 9, 10)], { now: NOW }).add).toEqual([])
  })

  it('links to an overlapping logged gym session instead of duplicating it', () => {
    const S = base({ workouts: [gym('g1', 18, 19)] })
    const p = planWhoopImport(S, [ww('lift', 18.1, 19.1, { sport: 'weightlifting' })], { now: NOW })
    expect(p.add).toEqual([])
    expect(p.link).toEqual([{ whoopId: 'lift', sessionId: 'g1' }])
    applyWhoopImport(S, p, NOW)
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].whoopId).toBe('lift')
    expect(S.workouts[0]._ts).toBe(NOW)
    expect(S.whoopImported.lift).toEqual({ s: 'g1', _ts: NOW })
  })

  it('still imports the walk to the gym next to the session it is not', () => {
    const S = base({ workouts: [gym('g1', 18, 19)] })
    const p = planWhoopImport(S, [ww('walk', 17.6, 17.95, { sport: 'walking' }), ww('lift', 18, 19, { sport: 'weightlifting' })], { now: NOW })
    expect(p.add.map(w => w.name)).toEqual(['Walking'])
    expect(p.link.map(l => l.whoopId)).toEqual(['lift'])
  })

  it('names weightlifting with no logged session "Gym (from Whoop)"', () => {
    expect(planWhoopImport(base(), [ww('l', 7, 8, { sport: 'weightlifting' })], { now: NOW }).add[0].name).toBe('Gym (from Whoop)')
  })

  it('leaves one overlapping the workout in progress for after it is finished', () => {
    const S = base({ active: { start: T(18), entries: [] } })
    expect(planWhoopImport(S, [ww('x', 18.1, 18.6)], { now: T(18.7) }).add).toEqual([])
  })

  it('does not bring back an imported workout that was deleted', () => {
    const S = base()
    applyWhoopImport(S, planWhoopImport(S, [ww('a', 7, 8)], { now: NOW }), NOW)
    expect(S.workouts.map(w => w.id)).toEqual(['whoop-a'])
    S.workouts = []
    S.whoopImported = withWhoopSkip(S.whoopImported, 'a', NOW + 1)
    expect(S.whoopImported.a).toEqual({ s: SKIP, _ts: NOW + 1 })
    expect(planWhoopImport(S, [ww('a', 7, 8)], { now: NOW }).add).toEqual([])
    // Even with the map lost, the removal record keeps it out.
    expect(planWhoopImport({ workouts: [], deleted: { workouts: { 'whoop-a': NOW } } }, [ww('a', 7, 8)], { now: NOW }).add).toEqual([])
  })

  it('files new workouts in day order and is idempotent', () => {
    const S = base({ workouts: [gym('g0', 2, 3, { d: '2026-11-08' }), gym('g2', 20, 21)] })
    const wo = [ww('a', 7, 8)]
    expect(applyWhoopImport(S, planWhoopImport(S, wo, { now: NOW }), NOW)).toBe(1)
    expect(S.workouts.map(w => w.id)).toEqual(['g0', 'whoop-a', 'g2'])
    expect(applyWhoopImport(S, planWhoopImport(S, wo, { now: NOW }), NOW)).toBe(0)
    expect(S.workouts).toHaveLength(3)
  })

  it('counts towards the week streak like any workout', () => {
    const S = { ...base({ weekStart: 1 }) }
    applyWhoopImport(S, planWhoopImport(S, [ww('a', 7, 8)], { now: NOW }), NOW)
    expect(streakInfo(S, '2026-11-10').thisWeekDone).toBe(true)
  })
})

describe('names', () => {
  it('maps Whoop sports to friendly labels', () => {
    expect(sportLabel('running')).toBe('Running')
    expect(sportLabel('functional-fitness')).toBe('Functional fitness')
    expect(sportLabel('hiit')).toBe('HIIT')
    expect(sportLabel('spin')).toBe('Spin')
    expect(sportLabel('boxing')).toBe('Boxing')
    expect(sportLabel('Yoga')).toBe('Yoga')
    expect(sportLabel('paddle board')).toBe('Paddle board')
    expect(sportLabel(null)).toBe('Activity')
  })
  it('makes Cult class names and renames a workout', () => {
    expect(cultName('HRX')).toBe('Cult: HRX')
    expect(cultName('  ')).toBe(null)
    expect(CULT_CLASSES).toContain('Boxing Bag Workout')
    const S = base()
    applyWhoopImport(S, planWhoopImport(S, [ww('a', 7, 8)], { now: NOW }), NOW)
    expect(renameWorkout(S, 'whoop-a', cultName('Burn'), NOW + 5)).toBe(true)
    expect(S.workouts[0]).toMatchObject({ name: 'Cult: Burn', _ts: NOW + 5 })
    expect(renameWorkout(S, 'whoop-a', 'Cult: Burn')).toBe(false)
    expect(renameWorkout(S, 'nope', 'X')).toBe(false)
  })
})

describe('the view', () => {
  it('shows strain, heart rate with the 175 ceiling, kcal, distance and zone shares', () => {
    const v = whoopSessionView(whoopSessionOf(ww('a', 7, 8, { distanceM: 5234 })))
    expect(v).toMatchObject({ strain: 11.4, avgHr: 141, maxHr: 178, over: true, kcal: 500, km: 5.2 })
    expect(v.zones).toHaveLength(6)
    expect(v.zones.reduce((a, z) => a + z.share, 0)).toBeCloseTo(1)
    expect(whoopSessionView(whoopSessionOf(ww('b', 7, 8, { maxHr: 170, zonesMin: null }))).over).toBe(false)
    expect(whoopSessionView({ name: 'Push' })).toBe(null)
  })
  it('the switch is on by default', () => {
    expect(whoopImportOn({})).toBe(true)
    expect(whoopImportOn({ whoopAutoImport: false })).toBe(false)
    expect(whoopSessionId(42)).toBe('whoop-42')
  })
})

describe('S.whoopImported syncs per Whoop id, on both sides', () => {
  it('is a stamped map in the app and on the server', () => {
    expect(STAMPED_MAPS).toContain('whoopImported')
    expect(API_STAMPED_MAPS).toEqual(STAMPED_MAPS)
  })
  it('keeps both devices\' entries and the later write of the same id', () => {
    const start = { _ts: 10, workouts: [], whoopImported: {} }
    const phone = { ...start, _ts: 100, whoopImported: { a: { s: 'whoop-a', _ts: 100 }, b: { s: 'whoop-b', _ts: 100 } } }
    const laptop = { ...start, _ts: 200, whoopImported: { c: { s: 'g1', _ts: 200 }, b: { s: SKIP, _ts: 150 } } }
    for (const [x, y] of [[phone, laptop], [laptop, phone]]) {
      const m = mergeStates(x, y)
      expect(Object.keys(m.whoopImported).sort()).toEqual(['a', 'b', 'c'])
      expect(m.whoopImported.b.s).toBe(SKIP)
    }
  })
  it('two devices importing the same workout make one', () => {
    const one = base({ _ts: 1 }), two = base({ _ts: 1 })
    applyWhoopImport(one, planWhoopImport(one, [ww('a', 7, 8)], { now: NOW }), NOW)
    applyWhoopImport(two, planWhoopImport(two, [ww('a', 7, 8)], { now: NOW }), NOW + 3)
    one._ts = NOW; two._ts = NOW + 3
    expect(mergeStates(one, two).workouts.map(w => w.id)).toEqual(['whoop-a'])
  })
  it('is never stamped as a whole setting', () => {
    const prev = { _ts: 1, whoopImported: {} }
    const next = { ...prev, whoopImported: { a: { s: SKIP, _ts: 5 } } }
    stampChange(prev, next, 50)
    expect(next.edited?.whoopImported).toBe(undefined)
  })
  it('the server keeps it per id on a PUT, unstamped as a setting', () => {
    const cur = { _ts: 1, _rev: 1, workouts: [], whoopImported: { a: { s: 'whoop-a', _ts: 5 } } }
    const next = { _ts: 2, workouts: [], whoopImported: { a: { s: SKIP, _ts: 9 } }, whoopAutoImport: false }
    stampPut(cur, next, { overRead: true, stamped: false, now: 1000 })
    expect(next.edited?.whoopImported).toBe(undefined)
    expect(next.whoopImported.a.s).toBe(SKIP)
    expect(next.edited.whoopAutoImport).toBeGreaterThanOrEqual(1000)
  })
})
