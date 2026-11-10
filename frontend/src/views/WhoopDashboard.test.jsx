// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WhoopDashboard, WhoopHomeDash, WhoopSkeleton, WhoopFirstSync } from './WhoopDashboard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// Reduced motion: rings and numbers land on their value at once, so the text is checkable.
window.matchMedia = q => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })
const click = async el => { await act(async () => { el.click() }) }
const byText = (d, sel, txt) => [...d.querySelectorAll(sel)].find(e => e.textContent.includes(txt))
const draw = async el => { const d = document.createElement('div'); const r = createRoot(d); await act(async () => r.render(el)); return d }

const full = {
  connected: true, syncedAt: Date.now(),
  today: {
    day: '2026-11-08', guidance: { band: 'green', text: 'Green. Push for a PR today.' },
    recovery: { score: 78, hrv: 64, rhr: 52, spo2: 96.4, skinTemp: 33.2, day: '2026-11-08' },
    sleep: { asleepMin: 452, neededMin: 480, lightMin: 220, deepMin: 100, remMin: 132, awakeMin: 30, performance: 91, efficiency: 93, consistency: 77, respRate: 15.2, start: '2026-11-07T20:00:00Z', end: '2026-11-08T04:00:00Z' },
    cycle: { strain: 12.4, kcal: 2300, avgHr: 72, maxHr: 181 },
  },
  avg: { hrv: { d7: 60, d30: 58 }, rhr: { d7: 53, d30: 54 }, recovery: { d7: 60, d30: 55 }, steps: { d7: 7000, d30: 6500 } },
  days: [
    { day: '2026-11-07', recovery: 40, hrv: 50, rhr: 55, spo2: null, strain: 10, kj: 8368, sleepMin: 400, neededMin: 470, deepMin: 90, remMin: 100, lightMin: 190, awakeMin: 20, performance: 85, steps: 9000, sleepStart: '2026-11-06T22:30:00Z', sleepEnd: '2026-11-07T05:30:00Z' },
    { day: '2026-11-08', recovery: 78, hrv: 64, rhr: 52, spo2: 96.4, strain: 12.4, kj: 9623, sleepMin: 452, neededMin: 480, performance: 91, steps: null, sleepStart: '2026-11-07T20:00:00Z', sleepEnd: '2026-11-08T04:00:00Z' },
  ],
  steps: { value: null }, zone45: { weekStart: '2026-11-02', minutes: 28, target: [20, 25], warnAbove: 30, status: 'high' },
  hrFlags: [{ day: '2026-11-04', sport: 'running', maxHr: 181, ceiling: 175 }],
  workouts: [{ id: 'w', day: '2026-11-04', sport: 'running', start: '2026-11-04T05:00:00Z', end: '2026-11-04T05:40:00Z', strain: 11, avgHr: 150, maxHr: 181, kj: 1600, zonesMin: [1, 5, 10, 10, 8, 6] }],
  naps: [], body: { heightM: 1.72, weightKg: 72.9, maxHr: 196 },
}

describe('Whoop dashboard', () => {
  it('draws every section with full data and flags heart rate over 175', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    expect(d.textContent).toContain('78'); expect(d.textContent).toContain('Above 175 bpm')
    expect(d.textContent).toContain('Deep'); expect(d.querySelectorAll('svg').length).toBeGreaterThan(5)
  })
  it('missing steps are a dash, not 0', async () => {
    const d = await draw(<WhoopHomeDash s={full} />)
    expect(d.textContent).toContain('–')
  })
  it('a sparse day draws without crashing', async () => {
    const d = await draw(<WhoopDashboard s={{ connected: true, today: { day: '2026-11-08', recovery: null, sleep: null, cycle: null }, days: [], steps: null }} />)
    expect(d.textContent).toContain('–')
  })

  it('tapping a day in the strip shows that day, and Today jumps back', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    const strip = d.querySelector('.whd-strip')
    expect(strip.querySelectorAll('button').length).toBe(2)
    await click(strip.querySelectorAll('button')[0])
    const hero = d.querySelector('.whd-hero')
    expect(hero.textContent).toContain('Sat 7 Nov'); expect(hero.textContent).toContain('40')
    expect(hero.textContent).toContain('Yellow') // that day's own guidance
    const today = byText(d, '.whd-chip', 'Back to today'); expect(today).toBeTruthy()
    await click(today)
    expect(d.querySelector('.whd-hero').textContent).toContain('78'); expect(d.querySelector('.whd-chip')).toBe(null)
  })
  it('the arrows step between days and stop at the ends', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    const next = d.querySelector('[aria-label="Next day"]'), prev = d.querySelector('[aria-label="Previous day"]')
    expect(next.disabled).toBe(true)
    await click(prev)
    expect(d.querySelector('.whd-hero').textContent).toContain('Sat 7 Nov')
    expect(d.querySelector('[aria-label="Previous day"]').disabled).toBe(true)
  })
  it('opens on the day from the route', async () => {
    const d = await draw(<WhoopDashboard s={full} initialDay="2026-11-07" />)
    expect(d.querySelector('.whd-hero').textContent).toContain('Sat 7 Nov')
  })
  it('a ring opens its detail sheet with averages and the recovery contributors', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    await click(d.querySelector('.whd-ring.tap'))
    const sh = d.querySelector('[role="dialog"]')
    expect(sh).toBeTruthy(); expect(sh.textContent).toContain('7-day avg'); expect(sh.textContent).toContain('59%') // (40+78)/2
    expect(sh.textContent).toContain('HRV'); expect(sh.textContent).toContain('Blood oxygen')
    await click(sh.querySelector('[aria-label="Close"]'))
    expect(d.querySelector('[role="dialog"]')).toBe(null)
  })
  it('a tap on a trend bar picks that day', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    const picks = d.querySelectorAll('.whd-tc .whd-picks')[0].querySelectorAll('button')
    expect(picks[0].getAttribute('aria-label')).toContain('Sat 7 Nov: 40%')
    await click(picks[0])
    expect(d.querySelector('.whd-hero').textContent).toContain('Sat 7 Nov')
  })
  it('a vitals tile opens to its sparkline; a sleep stage tells its share', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    const tile = d.querySelector('.whd-tile-b')
    expect(tile.getAttribute('aria-expanded')).toBe('false')
    await click(tile)
    expect(d.querySelector('.whd-tile.open .whd-spark').textContent).toContain('14-day avg')
    const deep = d.querySelector('.whd-stage')
    await click(deep)
    expect(d.querySelector('.whd-stage-info').textContent).toContain('% of sleep')
  })
  it('a workout opens to its zones and flags max heart rate over 175', async () => {
    const d = await draw(<WhoopDashboard s={full} />)
    const wo = d.querySelector('.whd-wo-b')
    await click(wo)
    const det = d.querySelector('.whd-wo-d')
    expect(det.textContent).toContain('Z4'); expect(det.textContent).toContain('8 min'); expect(det.textContent).toContain('above the 175 bpm ceiling')
    expect(d.querySelector('.whd-contrib').textContent).toContain('14 min') // zone 4 + 5 of this week's run
  })
  it('the refresh button calls the sync and spins until it settles', async () => {
    let done; const onRefresh = () => new Promise(r => { done = r })
    const d = await draw(<WhoopDashboard s={full} onRefresh={onRefresh} />)
    const b = d.querySelector('.whd-refresh')
    await click(b)
    expect(d.querySelector('.whd-refresh').classList.contains('busy')).toBe(true)
    await act(async () => { done() })
    expect(d.querySelector('.whd-refresh').classList.contains('busy')).toBe(false)
    expect(d.textContent).toContain('Updated')
  })
  it('home: a tap on a week bar opens that day', async () => {
    const seen = []; let opened = 0
    const d = await draw(<WhoopHomeDash s={full} onOpen={() => opened++} onDay={x => seen.push(x)} />)
    await click(d.querySelector('.whd-picks button'))
    expect(seen).toEqual(['2026-11-07']); expect(opened).toBe(0)
  })
  it('a past day with no numbers shows dashes, never 0', async () => {
    const s = { ...full, days: [{ day: '2026-11-07', recovery: null, hrv: null, strain: null, sleepMin: null, steps: null }, full.days[1]] }
    const d = await draw(<WhoopDashboard s={s} initialDay="2026-11-07" />)
    const hero = d.querySelector('.whd-hero')
    expect(hero.querySelectorAll('.whd-ring-n')[0].textContent).toBe('–'); expect(hero.querySelectorAll('.whd-ring-n')[1].textContent).toBe('–')
  })
  it('loading and first sync are friendly, not blank', async () => {
    const a = await draw(<WhoopSkeleton />); expect(a.querySelectorAll('.sk').length).toBeGreaterThan(3)
    const b = await draw(<WhoopFirstSync onRefresh={() => {}} />); expect(b.textContent).toContain('first sync'); expect(b.querySelector('.whd-refresh')).toBeTruthy()
  })
})
