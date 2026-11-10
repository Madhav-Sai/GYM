import { describe, it, expect } from 'vitest'
import { matchWhoopWorkout, whoopMatchView, MATCH_TOLERANCE_MS } from './whoop-match.js'

const T = h => Date.parse('2026-11-02T00:00:00Z') + h * 3600000
const iso = h => new Date(T(h)).toISOString()
const ww = (id, from, to, extra = {}) => ({ id, start: iso(from), end: to == null ? null : iso(to), strain: 12.3, avgHr: 128, maxHr: 161, ...extra })
const session = { start: T(18), end: T(19) }

describe('matching a session to a Whoop workout', () => {
  it('takes a workout whose window overlaps the session', () => {
    expect(matchWhoopWorkout(session, [ww('a', 9, 10), ww('b', 18.2, 19.1)])?.id).toBe('b')
  })

  it('allows 30 minutes either side, and no more', () => {
    expect(matchWhoopWorkout(session, [ww('late', 19.4, 20)])?.id).toBe('late')
    expect(matchWhoopWorkout(session, [ww('early', 17, 17.6)])?.id).toBe('early')
    expect(matchWhoopWorkout(session, [ww('far', 19.6, 20)])).toBe(null)
    expect(matchWhoopWorkout(session, [ww('far', 16, 17.4)])).toBe(null)
    expect(MATCH_TOLERANCE_MS).toBe(1800000)
  })

  it('prefers the workout that shares the most time with the session', () => {
    expect(matchWhoopWorkout(session, [ww('edge', 17.8, 18.1), ww('main', 18, 19)])?.id).toBe('main')
  })

  it('copes with a missing end, bad dates and no list', () => {
    expect(matchWhoopWorkout(session, [ww('open', 18.5, null)])?.id).toBe('open')
    expect(matchWhoopWorkout({ start: T(18) }, [ww('x', 18.1, 18.3)])?.id).toBe('x')
    expect(matchWhoopWorkout(session, [{ id: 'bad', start: 'nope' }])).toBe(null)
    expect(matchWhoopWorkout(session, null)).toBe(null)
    expect(matchWhoopWorkout({}, [ww('x', 18, 19)])).toBe(null)
  })
})

describe('what the detail shows', () => {
  it('keeps strain and heart rate and flags a max above 175', () => {
    expect(whoopMatchView(ww('a', 18, 19))).toMatchObject({ strain: 12.3, avgHr: 128, maxHr: 161, over: false })
    expect(whoopMatchView(ww('a', 18, 19, { maxHr: 181 })).over).toBe(true)
    expect(whoopMatchView(ww('a', 18, 19, { maxHr: null, strain: null })).maxHr).toBe(null)
    expect(whoopMatchView(null)).toBe(null)
  })
})
