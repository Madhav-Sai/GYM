// @vitest-environment happy-dom
// Whoop workouts in History (lib/whoop-import.js): an imported workout is a row like any other,
// with a Whoop badge; its detail shows strain, heart rate (max over 175 in red), kcal and the zone
// bar, renames as a Cult class, and once deleted does not come back.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import History from './History.jsx'
import { workoutDetailSheet } from '../sheets.jsx'
import { runWhoopImport, resetWhoopImportMemo } from './WhoopSheets.jsx'
import { planWhoopImport, applyWhoopImport } from '../lib/whoop-import.js'

const now = Date.now()
const whoop = (id, extra = {}) => ({
  id, day: null, sport: 'functional fitness', start: new Date(now - 3 * 3600000).toISOString(), end: new Date(now - 2 * 3600000).toISOString(),
  strain: 12.6, avgHr: 142, maxHr: 181, kj: 2510, distanceM: null, zonesMin: [3, 6, 12, 20, 14, 5], state: 'SCORED', ...extra,
})
const gymSession = { id: 'g1', d: '2026-01-05', start: Date.parse('2026-01-05T10:00:00Z'), end: Date.parse('2026-01-05T11:00:00Z'), name: 'Push', routineIds: [], entries: [], prs: [] }

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const item = (host, label) => [...host.querySelectorAll('.item')].find(b => b.textContent.trim().startsWith(label))

describe('Whoop workouts in History', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toastMsg: '' })
    resetWhoopImportMemo()
    useStore.setState(s => ({ user: { id: 'u1', name: 'me' }, S: { ...s.S, workouts: [gymSession], whoopImported: {}, routines: [], active: null, weighIn: false, whoopAutoImport: true } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }); useStore.setState({ user: null }) })

  it('imports from the summary once, and shows the row with a Whoop badge', () => {
    const summary = { connected: true, syncedAt: 1, workouts: [whoop('c1')] }
    act(() => { expect(runWhoopImport(summary)).toBe(1) })
    expect(runWhoopImport(summary)).toBe(0)
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id)).toContain('whoop-c1')
    expect(S.whoopImported.c1.s).toBe('whoop-c1')
    const host = mount(<MemoryRouter><History /></MemoryRouter>)
    const row = item(host, 'Functional fitness')
    expect(row).toBeTruthy()
    expect(row.querySelector('[data-testid="whoop-badge"]').textContent).toContain('Whoop')
    expect(row.textContent).toContain('600 kcal')
    expect(row.textContent).not.toMatch(/sets?\b/)
    // The logged gym session has no badge.
    expect(item(host, 'Push').querySelector('[data-testid="whoop-badge"]')).toBe(null)
  })

  it('does nothing with the switch off', () => {
    useStore.setState(s => ({ S: { ...s.S, whoopAutoImport: false } }))
    expect(runWhoopImport({ connected: true, syncedAt: 1, workouts: [whoop('c1')] })).toBe(0)
    expect(useStore.getState().S.workouts).toHaveLength(1)
  })

  it('the detail shows strain, heart rate, kcal and zones, and renames as a Cult class', () => {
    act(() => { useStore.getState().update(s => { applyWhoopImport(s, planWhoopImport(s, [whoop('c2')])) }) })
    const w = useStore.getState().S.workouts.find(x => x.id === 'whoop-c2')
    workoutDetailSheet(w)
    const host = renderTop()
    const sec = host.querySelector('[data-testid="whoop-session"]')
    expect(sec.textContent).toContain('12.6')
    expect(sec.textContent).toContain('142')
    expect(sec.textContent).toContain('600')
    expect(host.querySelector('[data-testid="whoop-max"]').getAttribute('style')).toContain('var(--red)')
    expect(host.querySelectorAll('[data-testid="whoop-zones"] span')).toHaveLength(6)
    expect(button(host, 'Edit workout')).toBeUndefined()
    act(() => { button(host, 'Rename as Cult class').click() })
    const pick = renderTop()
    act(() => { item(pick, 'HRX').click() })
    expect(useStore.getState().S.workouts.find(x => x.id === 'whoop-c2').name).toBe('Cult: HRX')
  })

  it('a deleted imported workout is marked skip and is not imported again', () => {
    act(() => { useStore.getState().update(s => { applyWhoopImport(s, planWhoopImport(s, [whoop('c3')])) }) })
    const w = useStore.getState().S.workouts.find(x => x.id === 'whoop-c3')
    workoutDetailSheet(w)
    const host = renderTop()
    act(() => { item(host, 'Workout options').click() })
    const menu = renderTop()
    act(() => { item(menu, 'Delete workout').click() })
    const confirm = renderTop()
    act(() => { button(confirm, 'Delete').click() })
    const S = useStore.getState().S
    expect(S.workouts.some(x => x.id === 'whoop-c3')).toBe(false)
    expect(S.whoopImported.c3.s).toBe('skip')
    expect(runWhoopImport({ connected: true, syncedAt: 2, workouts: [whoop('c3')] })).toBe(0)
    expect(useStore.getState().S.workouts.some(x => x.id === 'whoop-c3')).toBe(false)
  })
})
