import { describe, it, expect } from 'vitest'
import { activityWeeks, workoutMinutes, workoutStrain } from './activity-weeks.js'
import { SUNDAY } from './format.js'

const at = (iso, h) => new Date(iso + 'T' + String(h).padStart(2, '0') + ':00:00').getTime()
const logged = (d, min) => ({ id: 'l' + d + min, d, start: at(d, 10), end: at(d, 10) + min * 60000, entries: [{ sets: [{ w: 100, r: 5, done: true }] }] })
const whoop = (d, min, strain) => ({ id: 'whoop-' + d + min, d, start: at(d, 18), end: at(d, 18) + min * 60000, entries: [], source: 'whoop', whoop: { id: 'x', strain } })

describe('activityWeeks', () => {
  it('gives 12 weeks, oldest first, ending with the week of today', () => {
    const w = activityWeeks([], { today: '2026-11-11' })
    expect(w).toHaveLength(12)
    expect(w.at(-1).week).toBe('2026-11-09')   // a Wednesday, so that Monday
    expect(w[0].week).toBe('2026-08-24')
    expect(w.every(r => r.sessions === 0 && r.minutes === 0 && r.avgStrain === null)).toBe(true)
  })

  it('counts logged sessions by duration and Whoop workouts by duration and strain', () => {
    const w = activityWeeks([logged('2026-11-09', 60), whoop('2026-11-10', 45, 12.4), whoop('2026-11-11', 30, 8.6), logged('2026-11-02', 50)], { today: '2026-11-11' })
    const now = w.at(-1)
    expect(now).toMatchObject({ sessions: 3, minutes: 135, strain: 21, strainN: 2, avgStrain: 10.5 })
    expect(w.at(-2)).toMatchObject({ sessions: 1, minutes: 50, strain: 0, avgStrain: null })
  })

  it('leaves out workouts older than the window and follows a Sunday week start', () => {
    const w = activityWeeks([logged('2026-01-05', 60), logged('2026-11-08', 40)], { today: '2026-11-11', ws: SUNDAY })
    expect(w.at(-1).week).toBe('2026-11-08')
    expect(w.at(-1).sessions).toBe(1)
    expect(w.reduce((n, r) => n + r.sessions, 0)).toBe(1)
  })

  it('a workout with no usable times still counts as a session, with no minutes', () => {
    const w = activityWeeks([{ id: 'a', d: '2026-11-10', start: 5, end: 2 }], { today: '2026-11-11' })
    expect(w.at(-1)).toMatchObject({ sessions: 1, minutes: 0 })
  })
})

describe('the parts', () => {
  it('caps a session at a day and reads strain only from Whoop', () => {
    expect(workoutMinutes({ start: 0, end: 3 * 86400000 })).toBe(1440)
    expect(workoutMinutes({ start: 0 })).toBe(0)
    expect(workoutStrain({ whoop: { strain: 7.2 } })).toBe(7.2)
    expect(workoutStrain({ whoop: { strain: null } })).toBe(null)
    expect(workoutStrain({})).toBe(null)
  })
})
