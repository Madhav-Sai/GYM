import { describe, it, expect } from 'vitest'
import { cleanDays, rollingHrv, hrvAlert, rhrTrend, hrvWatch, HRV_FLOOR } from './hrv-watch.js'

// n days ending on 2026-11-30, oldest first, from a function of the index.
const series = (n, f, end = '2026-11-30') => {
  const out = []
  const endMs = Date.parse(end + 'T12:00:00Z')
  for (let i = 0; i < n; i++) out.push({ day: new Date(endMs - (n - 1 - i) * 86400000).toISOString().slice(0, 10), ...f(i) })
  return out
}

describe('cleaning the days', () => {
  it('sorts, drops junk and keeps one entry per day', () => {
    const d = cleanDays([{ day: '2026-11-02', hrv: 50 }, { day: 'nope', hrv: 1 }, null, { day: '2026-11-01', hrv: 'x', rhr: 60 }, { day: '2026-11-02', hrv: 52 }])
    expect(d).toEqual([{ day: '2026-11-01', hrv: null, rhr: 60 }, { day: '2026-11-02', hrv: 52, rhr: null }])
    expect(cleanDays(undefined)).toEqual([])
  })
})

describe('the rolling 7-day HRV average', () => {
  it('averages the calendar week up to each day, skipping unscored days', () => {
    const r = rollingHrv(series(9, i => ({ hrv: i === 8 ? null : 40 + i })))
    expect(r[0]).toEqual({ day: '2026-11-22', avg: 40 })
    expect(r[6].avg).toBe(43)
    // days 2..8, day 8 unscored: 42..47
    expect(r[8].avg).toBe(44.5)
  })
  it('does not reach across a gap of more than a week', () => {
    const r = rollingHrv([{ day: '2026-11-01', hrv: 80 }, { day: '2026-11-20', hrv: 40 }])
    expect(r[1].avg).toBe(40)
  })
})

describe('the two-week alert', () => {
  it('fires when HRV was under 45 on most of 14 days', () => {
    const a = hrvAlert(series(14, i => ({ hrv: i % 3 === 0 ? 50 : 40 })))
    expect(a).toEqual({ from: '2026-11-17', to: '2026-11-30', below: 9, scored: 14 })
  })
  it('stays quiet when only half the days were low', () => {
    expect(hrvAlert(series(14, i => ({ hrv: i % 2 ? 40 : 50 })))).toBe(null)
  })
  it('only reads the last 14 days', () => {
    expect(hrvAlert(series(30, i => ({ hrv: i < 16 ? 30 : 60 })))).toBe(null)
    expect(hrvAlert(series(30, i => ({ hrv: i < 16 ? 60 : 30 })))).not.toBe(null)
  })
  it('needs two full weeks of data before it says anything', () => {
    expect(hrvAlert(series(9, () => ({ hrv: 30 })))).toBe(null)
    // 14 days, but only the last 10 scored: the window's start is not covered
    expect(hrvAlert(series(14, i => ({ hrv: i < 4 ? null : 30 })))).toBe(null)
    expect(hrvAlert(series(14, i => ({ hrv: i === 0 || i === 7 ? null : 30 })))).not.toBe(null)
    expect(hrvAlert([])).toBe(null)
  })
  it('counts exactly 45 as not under', () => {
    expect(hrvAlert(series(14, () => ({ hrv: HRV_FLOOR })))).toBe(null)
  })
})

describe('the resting heart rate trend', () => {
  it('compares the last two weeks with the two before', () => {
    expect(rhrTrend(series(28, i => ({ rhr: i < 14 ? 58 : 62 })))).toEqual({ recent: 62, previous: 58, delta: 4, dir: 'up' })
    expect(rhrTrend(series(28, i => ({ rhr: i < 14 ? 62 : 59 })))).toMatchObject({ delta: -3, dir: 'down' })
    expect(rhrTrend(series(28, i => ({ rhr: i < 14 ? 60 : 60.5 })))).toMatchObject({ dir: 'flat' })
  })
  it('needs readings on both sides', () => {
    expect(rhrTrend(series(14, () => ({ rhr: 60 })))).toBe(null)
    expect(rhrTrend([])).toBe(null)
  })
})

describe('the card in one call', () => {
  it('puts the pieces together', () => {
    const w = hrvWatch(series(28, i => ({ hrv: 40, rhr: i < 14 ? 58 : 63 })))
    expect(w.avg7).toBe(40)
    expect(w.below7).toBe(true)
    expect(w.alert).toMatchObject({ below: 14, scored: 14 })
    expect(w.rhr.dir).toBe('up')
  })
  it('is null with nothing to show', () => {
    expect(hrvWatch([{ day: '2026-11-01' }])).toBe(null)
    expect(hrvWatch(null)).toBe(null)
  })
})
