import { describe, expect, test } from 'vitest'
import { trackOf, isVegTrack, challengeOf, challengeLine, startChallengeBody, stayVegBody, trackBody, B12_NOTE, ALGAL_NOTE } from './diet-track.js'

describe('the diet track', () => {
  test('the track from the prefs; the old veg switch migrates; non-veg by default', () => {
    expect(trackOf({ track: 'veg' })).toBe('veg')
    expect(trackOf({ track: 'nonveg', veg: true })).toBe('nonveg')
    expect(trackOf({ veg: true })).toBe('veg')
    expect(trackOf({ veg: false })).toBe('nonveg')
    expect(trackOf(null)).toBe('nonveg')
    expect(trackOf({ track: 'vegan' })).toBe('nonveg')
    expect(isVegTrack({ veg: true })).toBe(true)
  })

  test('the 40-day challenge: day 1 on the start day, day 40 on the last, done on day 41', () => {
    const prefs = { track: 'veg', vegChallenge: { start: '2026-11-12', days: 40 } }
    expect(challengeOf(prefs, '2026-11-12')).toEqual({ start: '2026-11-12', days: 40, day: 1, left: 39, done: false })
    expect(challengeLine(challengeOf(prefs, '2026-11-12'))).toEqual(['Pure veg: day {0} of {1}', 1, 40])
    expect(challengeOf(prefs, '2026-12-21')).toMatchObject({ day: 40, left: 0, done: false })
    const d41 = challengeOf(prefs, '2026-12-22')
    expect(d41).toMatchObject({ day: 40, done: true })
    expect(challengeLine(d41)).toEqual(['{0} days done: stay veg or switch back?', 40])
  })

  test('no challenge before it starts, without one, or off the veg track', () => {
    expect(challengeOf({ track: 'veg', vegChallenge: { start: '2026-11-12', days: 40 } }, '2026-11-11')).toBeNull()
    expect(challengeOf({ track: 'veg' }, '2026-11-12')).toBeNull()
    expect(challengeOf({ track: 'nonveg', vegChallenge: { start: '2026-11-12', days: 40 } }, '2026-11-20')).toBeNull()
    expect(challengeOf({ track: 'veg', vegChallenge: { start: 'soon' } }, '2026-11-20')).toBeNull()
    expect(challengeOf({ track: 'veg', vegChallenge: { start: '2026-11-12' } }, '2026-11-13')).toMatchObject({ days: 40, day: 2 })
    expect(challengeLine(null)).toBeNull()
  })

  test('the buttons: start sets veg and today, stay keeps veg and ends the run, non-veg ends it too', () => {
    expect(startChallengeBody('2026-11-12')).toEqual({ track: 'veg', vegChallenge: { start: '2026-11-12', days: 40 } })
    expect(stayVegBody()).toEqual({ track: 'veg', vegChallenge: null })
    expect(trackBody('nonveg')).toEqual({ track: 'nonveg', vegChallenge: null })
    expect(trackBody('veg')).toEqual({ track: 'veg' })
  })

  test('the B12 and algal notes, plain text without em dashes', () => {
    expect(B12_NOTE).toBe('Pure veg for 40 days: B12 retest in 3 months (it was 403). Below 250: B12 1500 mcg weekly.')
    expect(ALGAL_NOTE).toBe('Prefer fully vegetarian? Algal omega-3 gives the same EPA+DHA.')
    for (const s of [B12_NOTE, ALGAL_NOTE]) expect(s).not.toMatch(/—/)
  })
})
