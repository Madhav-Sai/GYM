import { describe, expect, test } from 'vitest'
import { dietFlags } from './diet-flags.js'
import { healthDay, healthMinutes, istParts, atIST, addDays, daysBetween } from './ist.js'

describe('evening diet flags', () => {
  test('before 20:00 nothing is flagged, however low the day is', () => {
    expect(dietFlags({ fiber: 5, protein: 40 }, 19 * 60 + 59)).toEqual([])
  })
  test('from 20:00: fibre under 25 g and protein under 140 g', () => {
    expect(dietFlags({ fiber: 24.9, protein: 139 }, 20 * 60).map(f => f.id)).toEqual(['fiber', 'protein'])
    expect(dietFlags({ fiber: 25, protein: 140 }, 20 * 60)).toEqual([])
    expect(dietFlags({ fiber: 30, protein: 100 }, 22 * 60).map(f => f.id)).toEqual(['protein'])
  })
  test('after midnight still counts as the evening (healthMinutes)', () => {
    expect(dietFlags({ fiber: 10, protein: 160 }, 24 * 60 + 45).map(f => f.id)).toEqual(['fiber'])
  })
  test('no totals, no flags', () => { expect(dietFlags(null, 1300)).toEqual([]) })
})

describe('India time', () => {
  test('a UTC instant reads as India wall clock', () => {
    // 14:30 UTC is 20:00 in India
    expect(istParts(new Date('2026-11-08T14:30:00Z'))).toEqual({ day: '2026-11-08', minutes: 1200, weekday: 0 })
    expect(atIST('2026-11-08', '20:30').toISOString()).toBe('2026-11-08T15:00:00.000Z')
  })
  test('the health day runs 04:00 to 04:00 India time', () => {
    // 00:45 on the 9th in India is still the 8th
    const late = new Date('2026-11-08T19:15:00Z')
    expect(healthDay(late)).toBe('2026-11-08')
    expect(healthMinutes(late)).toBe(24 * 60 + 45)
    // 04:30 on the 9th is the 9th
    expect(healthDay(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-09')
  })
  test('day arithmetic', () => {
    expect(addDays('2026-10-25', 28)).toBe('2026-11-22')
    expect(daysBetween('2026-09-06', '2026-11-08')).toBe(63)
  })
})
