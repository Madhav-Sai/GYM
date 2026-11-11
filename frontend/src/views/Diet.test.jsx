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
// Yesterday (2026-11-07): a lunch of chicken and a custom dal.
const yesterday = { ...diet, day: '2026-11-07', entries: [
  { id: 'y1', slot: 'lunch', foodId: 'chicken', name: 'Chicken breast cooked', qty: 150, unit: 'g', kcal: 247.5, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, satFat: 1.5, omega3: null, at: '2026-11-07T07:00:00Z' },
  { id: 'y2', slot: 'lunch', name: 'Home dal', qty: 200, unit: 'g', kcal: 230, protein: 12, carbs: 30, fat: 6, fiber: 8, satFat: null, omega3: null, at: '2026-11-07T07:01:00Z' },
] }
let today = diet
const meals = { meals: [{ id: 'm-aaaaaaaaaaaa', name: 'Usual breakfast', at: '2026-11-01', items: [
  { foodId: 'chicken', name: 'Chicken breast cooked', qty: 100, unit: 'g', kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, satFat: 1, omega3: null },
  { name: 'Toast', qty: 60, unit: 'g', kcal: 160, protein: 5, carbs: 30, fat: 2, fiber: 2, satFat: null, omega3: null },
] }] }
// The latest weight the screen sees: 72.9 kg (an InBody scan), or none.
let weight = { kg: 72.9, date: '2026-11-05', source: 'inbody' }
vi.mock('./health-data.js', async () => {
  const { dietTargets } = await import('../lib/diet-targets.js')
  return {
  useDietTargets: prefs => dietTargets({ prefs, weight }),
  useFoods: () => 0,
  useHealthOn: () => true,
  useDietDay: day => ({ data: day === '2026-11-07' ? yesterday : today, error: false, load() {}, post }),
  useMeals: () => ({ data: meals, error: false, load() {}, post }),
  useSupplements: () => ({ data: supps, error: false, load() {}, post }),
  }
})
vi.mock('../lib/ist.js', async orig => ({ ...(await orig()), healthDay: () => '2026-11-08', healthMinutes: () => 21 * 60 }))

import Diet from './Diet.jsx'
import { useUI } from '../store/useUI.js'
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

beforeEach(() => { posts.length = 0; today = diet; weight = { kg: 72.9, date: '2026-11-05', source: 'inbody' } })
afterEach(() => { for (const [r, h] of mounted.splice(0)) { act(() => r.unmount()); h.remove() }; useUI.getState().closeAll() })
// The sheet on top, rendered the way the app's sheet host does.
const openedSheet = () => {
  const sheets = useUI.getState().sheets
  const top = sheets[sheets.length - 1]
  return top ? render(top.render(() => useUI.getState().closeSheet(top.id))) : null
}
const flush = () => act(async () => { await Promise.resolve() })

describe('Diet screen', () => {
  test('a Sunday (rest) plan, totals against targets, and the evening flags', () => {
    const host = render(<Diet />)
    expect(host.textContent).toContain('Breakfast')
    expect(host.textContent).toContain('Chicken breast cooked')
    expect(host.textContent).toContain('Fibre is under 25 g by 20:00')
    expect(host.textContent).toContain('Protein is under 140 g by 20:00')
    expect(host.textContent).toContain('Rest')
  })

  test('the protein target comes from body weight, and says how', () => {
    const host = render(<Diet />)
    expect(host.textContent).toContain('160 g = 2.2 g/kg x 72.9 kg')
    expect(host.textContent).toContain('/ 160 g')
    expect(host.textContent).toContain('Protein per kg')
    expect(host.textContent).toContain('Calorie target')
  })

  test('a heavier body raises the target and the evening floor; no weight falls back to 160 g', () => {
    weight = { kg: 90, date: '2026-11-08', source: 'weigh-in' }
    let host = render(<Diet />)
    expect(host.textContent).toContain('200 g = 2.2 g/kg x 90.0 kg')
    expect(host.textContent).toContain('Protein is under 170 g by 20:00')
    weight = null
    host = render(<Diet />)
    expect(host.textContent).toContain('No body weight yet')
    expect(host.textContent).toContain('Protein is under 140 g by 20:00')
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

describe('Diet screen: saved meals and copying yesterday', () => {
  test("Copy yesterday's Lunch logs those items again in one request, as new entries", async () => {
    const host = render(<Diet />)
    const copy = buttonWith(host, "Copy yesterday's Lunch")
    expect(copy).toHaveLength(1)
    expect(buttonWith(host, "Copy yesterday's Breakfast")).toHaveLength(0)
    await act(async () => { copy[0].click() })
    expect(posts[0][0]).toBe('/api/health/diet/log')
    expect(posts[0][1].day).toBe('2026-11-08')
    expect(posts[0][1].entries.map(e => [e.name, e.slot, e.qty])).toEqual([['Chicken breast cooked', 'lunch', 150], ['Home dal', 'lunch', 200]])
    expect(posts[0][1].entries.some(e => e.id || e.at)).toBe(false)
  })

  test('Save as meal shows only on a slot with something logged, and saves its items', async () => {
    today = { ...diet, entries: [{ ...yesterday.entries[1], id: 't1', slot: 'dinner' }] }
    const host = render(<Diet />)
    const save = buttonWith(host, 'Save as meal')
    expect(save).toHaveLength(1)
    act(() => save[0].click())
    const sheet = openedSheet()
    expect(sheet.textContent).toContain('Saves these 1 items')
    await act(async () => { buttonWith(sheet, 'Save meal')[0].click() })
    expect(posts[0][0]).toBe('/api/health/meals/save')
    expect(posts[0][1].meal.name).toBe('Dinner')
    expect(posts[0][1].meal.items).toEqual([expect.objectContaining({ name: 'Home dal', qty: 200, kcal: 230 })])
    expect(posts[0][1].meal.items[0]).not.toHaveProperty('slot')
  })

  test('My meals in the Log food sheet: one tap logs the whole meal into the chosen slot', async () => {
    const host = render(<Diet />)
    act(() => buttonWith(host, 'Log food').at(-1).click())
    const sheet = openedSheet()
    act(() => buttonWith(sheet, 'My meals')[0].click())
    expect(sheet.textContent).toContain('Usual breakfast')
    expect(sheet.textContent).toContain('2 items · 325 kcal · 36 g P')
    await act(async () => { buttonWith(sheet, 'Usual breakfast')[0].click() })
    await flush()
    expect(posts[0][0]).toBe('/api/health/diet/log')
    expect(posts[0][1].entries).toHaveLength(2)
    expect(posts[0][1].entries.every(e => e.slot === 'other')).toBe(true)
    expect(posts[0][1].entries[0]).toMatchObject({ foodId: 'chicken', qty: 100, protein: 31 })
  })

  test('a saved meal can be renamed, trimmed and deleted', async () => {
    const host = render(<Diet />)
    act(() => buttonWith(host, 'Log food').at(-1).click())
    const sheet = openedSheet()
    act(() => buttonWith(sheet, 'My meals')[0].click())
    act(() => sheet.querySelector('[aria-label="Edit Usual breakfast"]').click())
    const input = sheet.querySelector('input[aria-label="Name"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    act(() => { setter.call(input, 'Big breakfast'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => buttonWith(sheet, 'Toast')[0].click())
    await act(async () => { buttonWith(sheet, 'Save').find(b => b.textContent.trim() === 'Save').click() })
    expect(posts[0]).toEqual(['/api/health/meals/save', { meal: { id: 'm-aaaaaaaaaaaa', name: 'Big breakfast', items: [meals.meals[0].items[0]] } }])
    act(() => sheet.querySelector('[aria-label="Edit Usual breakfast"]').click())
    act(() => buttonWith(sheet, 'Delete meal')[0].click())
    expect(posts).toHaveLength(1)
    await act(async () => { buttonWith(sheet, 'Tap again to delete')[0].click() })
    expect(posts[1]).toEqual(['/api/health/meals/delete', { id: 'm-aaaaaaaaaaaa' }])
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
