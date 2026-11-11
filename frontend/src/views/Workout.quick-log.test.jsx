// @vitest-environment happy-dom
// Quick logging (lib/quick-log.js) in a running workout: "Same as last time" fills the open sets
// and ticks nothing, "Do all sets like last time" ticks them all (the last through the normal
// tick, so the rest timer starts), "Repeat previous set" copies the set just done.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(), restOver: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const PRESS = '0576'
const OTHER = '2291'

let root, container
beforeEach(() => { useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null }) })
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null })

function mount(sets, { history = true } = {}) {
  const S = clone(DEF)
  Object.assign(S, { unit: 'kg', workoutView: 'list' })
  S.workouts = history ? [{ id: 'old', d: '2026-11-04', start: new Date('2026-11-04T17:00:00').getTime(), name: 'Upper', entries: [
    { id: PRESS, target: { mode: 'reps', sets: 3, reps: 10 }, sets: [{ w: 25, r: 10, done: true }, { w: 27.5, r: 9, done: true }, { w: 27.5, r: 8, done: true }] },
  ] }] : []
  S.active = { id: 'a', d: '2026-11-11', start: Date.now(), routineId: null, name: 'Upper', bw: null, cur: 0, workoutView: 'list', entries: [
    { id: PRESS, target: { mode: 'reps', sets: 3, reps: 10, inc: 2.5 }, sets },
    { id: OTHER, target: { mode: 'reps', sets: 1, reps: 10 }, sets: [{ w: 35, r: 10, done: false }] },
  ] }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
}
const firstBlock = () => container.querySelector('[data-testid="quick-log"]')
const btn = name => [...(firstBlock()?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === name)
const rows = () => useStore.getState().S.active.entries[0].sets
const open3 = () => [{ w: 30, r: 10, done: false }, { w: 30, r: 10, done: false }, { w: 30, r: 10, done: false }]

describe('quick logging in the workout', () => {
  it('Same as last time fills the open sets and ticks nothing', () => {
    mount(open3())
    expect(btn('Same as last time')).toBeTruthy()
    expect(btn('Repeat previous set')).toBeFalsy()
    act(() => btn('Same as last time').click())
    expect(rows().map(s => [s.w, s.r, s.done])).toEqual([[25, 10, false], [27.5, 9, false], [27.5, 8, false]])
    expect(btn('Same as last time').disabled).toBe(true)
    expect(useUI.getState().timer).toBeNull()
  })
  it('Do all sets like last time ticks every set and starts the rest', () => {
    mount(open3())
    act(() => btn('Do all sets like last time').click())
    expect(rows().map(s => [s.w, s.r, s.done])).toEqual([[25, 10, true], [27.5, 9, true], [27.5, 8, true]])
    expect(rows().every(s => s.at > 0)).toBe(true)
    expect(useUI.getState().timer).toBeTruthy()
  })
  it('Repeat previous set copies the set just done into the next one', () => {
    mount([{ w: 32.5, r: 9, done: true }, { w: 30, r: 10, done: false }, { w: 30, r: 10, done: false }])
    act(() => btn('Repeat previous set').click())
    expect(rows().map(s => [s.w, s.r, s.done])).toEqual([[32.5, 9, true], [32.5, 9, false], [30, 10, false]])
  })
  it('no history: only Repeat previous set, and the +/- steppers walk the exercise increment', () => {
    mount([{ w: 30, r: 10, done: true }, { w: 30, r: 10, done: false }], { history: false })
    expect(btn('Same as last time')).toBeFalsy()
    expect(btn('Repeat previous set')).toBeTruthy()
    const plus = container.querySelectorAll('.setrow')[1].querySelector('button[aria-label="Increase"]')
    act(() => plus.click())
    expect(rows()[1].w).toBe(32.5)
  })
})
