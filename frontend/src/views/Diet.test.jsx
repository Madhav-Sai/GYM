// @vitest-environment happy-dom
// Diet and Supplements screens (our addition): they render the plan, the totals, the D3 tracker and
// the checklist from what the server sends, and a tap posts the right thing.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const posts = []
const diet = { day: '2026-11-08', entries: [], water: 500, dayType: null, vegMeals: {}, prefs: { veg: false }, totals: { kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 5, satFat: 3, omega3: 0, unknown: { satFat: 0, omega3: 0 } } }
const supps = {
  list: [
    { id: 'd3', name: 'Uprise-D3 60K', dose: '1 capsule', schedule: { kind: 'phase', start: '2026-09-06', weeklyDoses: 8, everyDays: 28, dow: 0 }, requiresFat: true, active: true, createdDay: '2026-11-08', warning: 'Never double-dose to catch up.' },
    { id: 'omega3', name: 'Omega 3', dose: '1 capsule', schedule: { kind: 'daily' }, requiresFat: true, active: true, createdDay: '2026-11-08' },
  ],
  log: {},
}
const post = async (path, body) => { posts.push([path, body]); return {} }
vi.mock('./health-data.js', () => ({
  useHealthOn: () => true,
  useDietDay: () => ({ data: diet, error: false, load() {}, post }),
  useSupplements: () => ({ data: supps, error: false, load() {}, post }),
}))
vi.mock('../lib/ist.js', async orig => ({ ...(await orig()), healthDay: () => '2026-11-08', healthMinutes: () => 21 * 60 }))

import Diet from './Diet.jsx'
import Supplements from './Supplements.jsx'

const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push([root, host])
  act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))
  return host
}
const buttonWith = (host, text) => [...host.querySelectorAll('button')].filter(b => b.textContent.includes(text))

beforeEach(() => { posts.length = 0 })
afterEach(() => { for (const [r, h] of mounted.splice(0)) { act(() => r.unmount()); h.remove() } })

describe('Diet screen', () => {
  test('a Sunday (rest) plan, totals against targets, and the evening flags', () => {
    const host = render(<Diet />)
    expect(host.textContent).toContain('Pre-gym meal')
    expect(host.textContent).toContain('Chicken breast cooked')
    expect(host.textContent).toContain('Fibre is under 25 g by 20:00')
    expect(host.textContent).toContain('Protein is under 140 g by 20:00')
    expect(host.textContent).toContain('Rest')
  })

  test('tapping a plan item logs it with its plan key; a water tap adds 250 ml', () => {
    const host = render(<Diet />)
    act(() => buttonWith(host, 'Chicken breast cooked')[0].click())
    expect(posts[0][0]).toBe('/api/health/diet/log')
    expect(posts[0][1].entry).toMatchObject({ foodId: 'chicken', qty: 150, slot: 'lunch', planKey: 'lunch:2', protein: 46.5 })
    act(() => buttonWith(host, '250 ml')[1].click())
    expect(posts[1]).toEqual(['/api/health/diet/water', { day: '2026-11-08', ml: 250 }])
  })
})

describe('Supplements screen', () => {
  test('the D3 tracker: 8 weekly doses, missed when nothing was logged, then monthly', () => {
    const host = render(<Supplements />)
    expect(host.textContent).toContain('Monthly now: every 28 days')
    expect(host.textContent).toContain('Requires fat')
    const dots = host.querySelectorAll('.hl-dot')
    expect(dots.length).toBe(8)
    for (const d of dots) expect(d.className).toContain('missed')
  })

  test('Taken marks today', () => {
    const host = render(<Supplements />)
    act(() => buttonWith(host, 'Taken')[0].click())
    expect(posts[0]).toEqual(['/api/health/supplements/mark', { day: '2026-11-08', id: 'omega3', status: 'taken', reason: undefined }])
  })
})
