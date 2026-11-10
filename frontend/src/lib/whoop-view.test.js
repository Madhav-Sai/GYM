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

import { dayView, dayStrip, shiftDay, dayParam, fmtDay, seriesOf, windowTo, statsOf, trendArrow, metricDetail, contributors,
  stageParts, trackPos, bedTrack, zoneContrib, chartScale, indexAt, xOf } from './whoop-view.js'

const S = {
  today: { day: '2026-11-08', recovery: { score: 78, hrv: 64, rhr: 52, day: '2026-11-08' }, sleep: { performance: 91 }, cycle: { strain: 12.4 }, guidance: { band: 'green', text: 'x' } },
  steps: { value: null },
  days: [
    { day: '2026-11-06', recovery: 20, hrv: 40, rhr: 60, spo2: null, strain: 15, kj: 4184, performance: 70, sleepMin: 380, neededMin: 480, deepMin: 60, sleepStart: null, sleepEnd: null },
    { day: '2026-11-07', recovery: 50, hrv: 50, rhr: 56, spo2: 96, strain: null, kj: null, performance: null, steps: 0 },
    { day: '2026-11-08', recovery: 78, hrv: 64, rhr: 52, spo2: 97, strain: 12.4, kj: 8368, performance: 91 },
  ],
  zone45: { weekStart: '2026-11-02', minutes: 28 },
  workouts: [
    { id: 'b', day: '2026-11-04', sport: 'running', start: '2026-11-04T05:00:00Z', zonesMin: [0, 1, 2, 3, 15, 8] },
    { id: 'a', day: '2026-11-03', sport: null, start: '2026-11-03T05:00:00Z', zonesMin: [0, 1, 2, 3, 5, 0] },
    { id: 'old', day: '2026-11-01', start: '2026-11-01T05:00:00Z', zonesMin: [0, 0, 0, 0, 30, 0] },
    { id: 'none', day: '2026-11-05', start: '2026-11-05T05:00:00Z', zonesMin: [0, 1, 0, 0, null, null] },
  ],
}

describe('whoop day browser', () => {
  it('today is what the server calls today', () => {
    const v = dayView(S, null)
    expect(v.isToday).toBe(true); expect(v.recovery.score).toBe(78); expect(v.steps).toBe(null)
    expect(dayView(S, '2026-11-08').isToday).toBe(true)
  })
  it('a past day is that row, with missing numbers null, never 0', () => {
    const v = dayView(S, '2026-11-07')
    expect(v.isToday).toBe(false); expect(v.recovery.score).toBe(50); expect(v.guidance.band).toBe('yellow')
    expect(v.cycle.strain).toBe(null); expect(v.cycle.kcal).toBe(null); expect(v.sleep.performance).toBe(null)
    expect(v.steps).toBe(0) // a real 0 stays 0
    expect(dayView(S, '2026-11-06').cycle.kcal).toBe(1000)
    expect(dayView(S, '2026-11-06').guidance.band).toBe('red')
  })
  it('an unknown day is null, and no summary is null', () => {
    expect(dayView(S, '2025-01-01')).toBe(null); expect(dayView(null, null)).toBe(null); expect(dayView({ today: null }, null)).toBe(null)
  })
  it('the strip ends on today and steps between days', () => {
    expect(dayStrip(S, 2).map(d => d.day)).toEqual(['2026-11-07', '2026-11-08'])
    expect(dayStrip(S).map(d => d.band)).toEqual(['red', 'yellow', 'green'])
    expect(dayStrip({ today: { day: '2026-11-09', recovery: null }, days: S.days }).at(-1)).toEqual({ day: '2026-11-09', recovery: null, band: null })
    expect(shiftDay(S, null, -1)).toBe('2026-11-07'); expect(shiftDay(S, null, 1)).toBe(null)
    expect(shiftDay(S, '2026-11-06', -1)).toBe(null); expect(shiftDay(S, '2026-11-06', 1)).toBe('2026-11-07')
  })
  it('reads ?day= only when it is a real day', () => {
    expect(dayParam('2026-11-08')).toBe('2026-11-08'); expect(dayParam('2026-13-45')).toBe(null)
    expect(dayParam('x')).toBe(null); expect(dayParam(null)).toBe(null)
    expect(fmtDay('2026-11-08')).toBe('Sun 8 Nov'); expect(fmtDay('2026-11-08', { weekday: false })).toBe('8 Nov'); expect(fmtDay(null)).toBe('–')
  })
})

describe('whoop metrics', () => {
  it('series, windows and stats skip nulls', () => {
    expect(seriesOf(S.days, 'kcal')).toEqual([1000, null, 2000]); expect(seriesOf(S.days, 'sleep')).toEqual([70, null, 91])
    expect(windowTo(S.days, '2026-11-07', 7).map(d => d.day)).toEqual(['2026-11-06', '2026-11-07'])
    expect(windowTo(S.days, null, 2).map(d => d.day)).toEqual(['2026-11-07', '2026-11-08'])
    expect(statsOf([3, null, 1, 5])).toEqual({ min: 1, max: 5, minI: 2, maxI: 3, n: 3, avg: 3 })
    expect(statsOf([null]).avg).toBe(null)
  })
  it('trend arrows follow the slope and what good means', () => {
    expect(trendArrow([50, 55, 60, 65])).toMatchObject({ arrow: '↑', tone: 'good' })
    expect(trendArrow([60, 58, 56, 54], 'down')).toMatchObject({ arrow: '↓', tone: 'good' })
    expect(trendArrow([60, 60.1, 59.9, 60])).toMatchObject({ arrow: '→', tone: 'flat' })
    expect(trendArrow([1, 2])).toBe(null)
  })
  it('detail: value, 7 and 30-day averages ending on the day, min and max', () => {
    const d = metricDetail(S, 'recovery', '2026-11-07')
    expect(d.value).toBe(50); expect(d.d7).toBe(35); expect(d.min).toBe(20); expect(d.max).toBe(50); expect(d.minDay).toBe('2026-11-06')
    expect(d.values).toEqual([20, 50])
    const t = metricDetail(S, 'strain', null)
    expect(t.value).toBe(12.4); expect(t.d30).toBe(13.7)
    expect(metricDetail(S, 'kcal', '2026-11-07').value).toBe(null)
    expect(metricDetail(S, 'nope', null)).toBe(null)
  })
  it('contributors compare each input with its own average', () => {
    const c = contributors(S, null)
    const hrv = c.find(x => x.k === 'hrv'), rhr = c.find(x => x.k === 'rhr'), spo2 = c.find(x => x.k === 'spo2')
    expect(hrv.value).toBe(64); expect(hrv.tone).toBe('good')
    expect(rhr.tone).toBe('good') // lower than average is good
    expect(spo2.value).toBe(null); expect(spo2.rel).toBe(null); expect(spo2.dev).toBe(null) // today's recovery has no spo2: a dash
    expect(hrv.dev).toBeCloseTo((64 / 51.3 - 1) / 0.25, 1) // 64 against the (40+50+64)/3 average, capped at 1
    expect(hrv.dev).toBeLessThanOrEqual(1)
  })
})

describe('whoop sleep and zones', () => {
  it('stage shares of the night', () => {
    const p = stageParts({ deepMin: 100, remMin: 100, lightMin: 200, awakeMin: null })
    expect(p.map(x => x.pct)).toEqual([25, 25, 50, null])
    expect(stageParts(null).every(x => x.pct === null)).toBe(true)
  })
  it('the bedtime track runs 18:00 to 18:00', () => {
    expect(trackPos(18 * 60)).toBe(0); expect(trackPos(0)).toBe(0.25); expect(trackPos(6 * 60)).toBe(0.5); expect(trackPos(null)).toBe(null)
    const rows = bedTrack(S, null, 7)
    expect(rows.length).toBe(3); expect(rows[0].from).toBe(null); expect(rows[0].start).toBe(null)
  })
  it('only this week\'s workouts with zone 4-5 minutes count toward the budget', () => {
    expect(zoneContrib(S).map(w => [w.id, w.minutes])).toEqual([['a', 5], ['b', 23]])
    expect(zoneContrib({})).toEqual([])
  })
})

describe('whoop chart math', () => {
  it('bars start at 0, lines hug their data', () => {
    const b = chartScale([10, null, 20], { kind: 'bar' })
    expect(b.lo).toBe(0); expect(b.hi).toBe(20); expect(b.y(20)).toBe(0); expect(b.y(10)).toBe(0.5); expect(b.y(null)).toBe(null); expect(b.avg).toBe(15)
    const l = chartScale([50, 60], { kind: 'line' })
    expect(l.lo).toBeLessThan(50); expect(l.hi).toBeGreaterThan(60)
    expect(chartScale([5], { kind: 'bar', max: 100 }).hi).toBe(100)
    expect(chartScale([5], { kind: 'bar', goal: 8 }).hi).toBe(8)
  })
  it('the pointer picks the slot under it', () => {
    expect(indexAt(0, 7)).toBe(0); expect(indexAt(0.99, 7)).toBe(6); expect(indexAt(1.5, 7)).toBe(6); expect(indexAt(0.5, 0)).toBe(null)
    expect(indexAt(0.5, 5, 'line')).toBe(2); expect(xOf(0, 4)).toBe(0.125); expect(xOf(3, 4, 'line')).toBe(1); expect(xOf(0, 1, 'line')).toBe(0.5)
  })
})
