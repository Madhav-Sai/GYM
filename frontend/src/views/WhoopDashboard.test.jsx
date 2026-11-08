// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WhoopDashboard, WhoopHomeDash } from './WhoopDashboard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
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
  days: [{ day: '2026-11-07', recovery: 40, hrv: 50, rhr: 55, strain: 10, sleepMin: 400, steps: 9000 }, { day: '2026-11-08', recovery: 78, hrv: 64, rhr: 52, strain: 12.4, sleepMin: 452, steps: null }],
  steps: { value: null }, zone45: { minutes: 28, target: [20, 25], warnAbove: 30, status: 'high' },
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
})
