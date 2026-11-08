import { describe, it, expect } from 'vitest'
import { bandOf, pct, trendOf, durMin, clockOf } from './whoop-view.js'

describe('whoop-view', () => {
  it('bands recovery like the spec', () => {
    expect(bandOf(67)).toBe('green'); expect(bandOf(66)).toBe('yellow'); expect(bandOf(34)).toBe('yellow')
    expect(bandOf(33)).toBe('red'); expect(bandOf(null)).toBe(null)
  })
  it('fills rings 0..1 and never invents a value', () => {
    expect(pct(50, 100)).toBe(0.5); expect(pct(30, 21)).toBe(1); expect(pct(null, 100)).toBe(null)
  })
  it('compares today with the average', () => {
    expect(trendOf(60, 50).tone).toBe('good'); expect(trendOf(60, 50, 'down').tone).toBe('bad')
    expect(trendOf(50.2, 50).tone).toBe('flat'); expect(trendOf(null, 50)).toBe(null)
  })
  it('durations and clocks', () => {
    expect(durMin('2026-01-01T10:00:00Z', '2026-01-01T10:45:00Z')).toBe(45)
    expect(durMin('x', 'y')).toBe(null); expect(clockOf('nope')).toBe('–')
  })
})

import { whoopWidgetBlock } from './widgets.js'
import { parseWidgetLink } from './widget-links.js'
describe('whoop widget block', () => {
  it('is null until there is something to show', () => {
    expect(whoopWidgetBlock(null)).toBe(null); expect(whoopWidgetBlock({ connected: false })).toBe(null)
    expect(whoopWidgetBlock({ connected: true, today: null })).toBe(null)
  })
  it('carries numbers and keeps missing ones null, never 0', () => {
    const b = whoopWidgetBlock({ connected: true, syncedAt: 5, today: { day: '2026-11-08', recovery: { score: 70, hrv: 60 }, cycle: { strain: 9.5 }, sleep: {}, guidance: { band: 'green', text: 'Green.' } },
      steps: { value: null }, days: [{ day: 'a', recovery: 50 }, { day: 'b', recovery: null }], zone45: { minutes: 12, target: [20, 25], warnAbove: 30 }, hrFlags: [{ maxHr: 180 }] })
    expect(b.recovery).toBe(70); expect(b.rhr).toBe(null); expect(b.steps).toBe(null)
    expect(b.week).toEqual([50, null]); expect(b.hrOver).toBe(180); expect(b.stepGoal).toBe(8000)
  })
  it('opengym://whoop opens the Whoop page', () => { expect(parseWidgetLink('opengym://whoop')).toEqual({ to: '/settings/whoop' }) })
})
