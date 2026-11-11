// @vitest-environment happy-dom
// The weekly review (lib/weekly-review.js): the full view from a mocked Whoop summary, diet days and
// supplements, the Home card's Sunday/Monday rule and its ×, and the sheet's week back and forward.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { weeklyReview, reviewWeekStart, reviewKey } from '../lib/weekly-review.js'
import { addDays } from '../lib/ist.js'

const { today } = vi.hoisted(() => ({ today: { current: '2026-11-09' } }))
vi.mock('../lib/ist.js', async orig => ({ ...(await orig()), healthDay: () => today.current }))
vi.mock('../lib/api.js', () => ({ api: () => Promise.resolve(null) }))

import { WeeklyReviewView, WeeklyReviewHomeCard, weeklyReviewSheet } from './WeeklyReview.jsx'

const W = '2026-11-02'
const set = (w, r) => ({ w, r, done: true })
const workout = (id, d, entries, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), name: 'Lower A', routineIds: ['r1'], routineId: 'r1', entries, ...extra })
const S0 = () => ({
  ...structuredClone(DEF),
  routines: [{ id: 'r1', name: 'Lower A', ex: [{ id: 'leg-press' }] }],
  week: { 1: 'r1', 4: 'r1' },
  workouts: [
    workout('a', '2026-10-20', [{ id: 'leg-press', sets: [set(140, 10)] }]),
    workout('b', '2026-10-27', [{ id: 'leg-press', sets: [set(140, 10)] }]),
    workout('c', '2026-11-02', [{ id: 'leg-press', sets: [set(140, 9)] }], { prs: [] }),
  ],
})
const whoop = {
  connected: true,
  days: [{ day: '2026-10-27', recovery: 55, sleepMin: 410 }, { day: '2026-11-03', recovery: 64, sleepMin: 440 }, { day: '2026-11-04', recovery: 60, sleepMin: 400 }],
  workouts: [{ day: '2026-11-07', sport: 'treadmill', maxHr: 179, zonesMin: { 4: 15, 5: 7 } }],
}
const dayView = p => ({ entries: [{ id: 'e' }], totals: { protein: p, kcal: 1800 }, prefs: {} })
const dietDays = { '2026-11-02': dayView(165), '2026-11-03': dayView(150), '2026-11-04': dayView(162) }
const supplements = { list: [{ id: 'd3', name: 'Vitamin D3', schedule: { kind: 'weekly', dow: 0 }, createdDay: '2026-01-01' }], log: {} }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: S0(), user: null, config: null })
  today.current = '2026-11-09'
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('WeeklyReviewView', () => {
  it('draws every part from mocked data', () => {
    const r = weeklyReview(S0(), W, '2026-11-09', { whoop, dietDays, supplements, proteinTarget: 160 })
    act(() => root.render(<WeeklyReviewView r={r} unit="kg" />))
    const text = host.textContent
    expect(host.querySelector('[data-wr="workouts"]').textContent).toContain('1/2')
    expect(host.querySelector('[data-wr="recovery"]').textContent).toContain('62%')
    expect(host.querySelector('[data-wr="recovery"]').textContent).toContain('+7')
    expect(host.querySelector('[data-wr="protein"]').textContent).toContain('2/3')
    expect(host.querySelector('[data-testid="wr-lifts"]').textContent).toContain('stalled 2 weeks')
    expect(host.querySelector('[data-testid="wr-whoop"]').textContent).toContain('22 min')
    expect(host.querySelector('[data-testid="wr-whoop"]').textContent).toContain('2026-11-07: 179 bpm')
    expect(host.querySelector('[data-testid="wr-health"]').textContent).toContain('0/1') // D3 missed
    const sugg = [...host.querySelectorAll('[data-sugg]')].map(e => e.dataset.sugg)
    expect(sugg).toEqual(['stalled', 'hr'])
    expect(text).toMatch(/stalled 2 weeks: drop 5 kg and build back/)
  })
  it('without Whoop says how to get it, never a 0', () => {
    const r = weeklyReview(S0(), W, '2026-11-09', {})
    act(() => root.render(<WeeklyReviewView r={r} />))
    expect(host.textContent).toContain('Connect Whoop')
    expect(host.querySelector('[data-wr="recovery"]')).toBeNull()
  })
})

describe('Home card', () => {
  it('shows on Monday and goes with its ×, for every device', () => {
    act(() => root.render(<WeeklyReviewHomeCard />))
    const card = host.querySelector('[data-testid="weekly-review-card"]')
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('Weekly review')
    act(() => card.querySelector('button[aria-label="Put it away"]').click())
    expect(useStore.getState().S.weeklyReviewSeen).toBe(reviewKey(W))
    expect(host.querySelector('[data-testid="weekly-review-card"]')).toBeNull()
  })
  it('not on a Wednesday', () => {
    today.current = '2026-11-11'
    act(() => root.render(<WeeklyReviewHomeCard />))
    expect(host.innerHTML).toBe('')
  })
  it('the sheet steps back a week and not past the current one', () => {
    act(() => weeklyReviewSheet(reviewWeekStart(today.current)))
    const Sheet = () => useUI(s => s.sheets).map((x, i) => <div key={i}>{(x.render || x.content || x)(() => {})}</div>)
    act(() => root.render(<Sheet />))
    const range = () => host.querySelector('.weekly-review .small.muted').textContent
    const first = range()
    act(() => host.querySelector('button[aria-label="Previous week"]').click())
    expect(range()).not.toBe(first)
    act(() => host.querySelector('button[aria-label="Next week"]').click())
    act(() => host.querySelector('button[aria-label="Next week"]').click()) // the current week, so far
    expect(range()).toContain('so far')
    expect(host.querySelector('button[aria-label="Next week"]').disabled).toBe(true)
    expect(addDays(W, 7)).toBe('2026-11-09')
  })
})
