// @vitest-environment happy-dom
// Home as a hub (this fork): the Now strip and the tiles on top, each tile opening its screen, and
// Customize Home hiding and moving cards (lib/home-layout.js), stored in S.homeLayout.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setHidden, moveItem, layoutOf } from '../lib/home-layout.js'
import Home from './Home.jsx'

const { navSpy } = vi.hoisted(() => ({ navSpy: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  navSpy.mockClear()
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: { ...structuredClone(DEF), routines: [{ id: 'r1', name: 'Push', ex: [{ id: 'a' }, { id: 'b' }] }], week: { 0: 'r1', 1: 'r1', 2: 'r1', 3: 'r1', 4: 'r1', 5: 'r1', 6: 'r1' } }, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const mount = () => act(() => root.render(<Home />))
const tile = id => host.querySelector(`[data-tile="${id}"]`)

describe('Home hub', () => {
  it('shows the Now strip and every tile, with today\'s routine on the Workout tile', () => {
    mount()
    expect(host.querySelector('.now-strip')).toBeTruthy()
    for (const id of ['workout', 'checkin', 'whoop', 'diet', 'supps', 'medical', 'schedule', 'stats', 'history', 'library', 'plan', 'guide']) expect(tile(id), id).toBeTruthy()
    expect(tile('workout').textContent).toContain('Push')
    expect(tile('workout').textContent).toContain('2 exercises')
    expect(tile('whoop').querySelector('.hub-value').textContent).toBe('-') // not to hand: a dash
  })
  it('each tile opens its screen', () => {
    mount()
    const to = { workout: '/workout', schedule: '/schedule', stats: '/stats', history: '/history', library: '/library', plan: '/plan', guide: '/guide', diet: '/diet', supps: '/supplements', medical: '/medical', whoop: '/settings/whoop' }
    for (const [id, path] of Object.entries(to)) { act(() => tile(id).click()); expect(navSpy).toHaveBeenLastCalledWith(path) }
    act(() => host.querySelector('.now-strip').click())
    expect(navSpy).toHaveBeenLastCalledWith('/schedule')
    act(() => tile('checkin').click())
    expect(useUI.getState().sheets).toHaveLength(1) // the check-in sheet
  })
  it('Customize Home: a hidden card and tile go, a moved card moves', () => {
    useStore.getState().update(s => {
      let l = layoutOf(s)
      l = setHidden(l, 'cards', 'checkin', true)
      l = setHidden(l, 'tiles', 'medical', true)
      for (let i = 0; i < 12; i++) l = moveItem(l, 'cards', 'streak', -1) // streak to the top
      s.homeLayout = l
    })
    mount()
    expect(host.querySelector('.checkin-card')).toBeNull()
    expect(tile('medical')).toBeNull()
    const first = host.querySelector('.narrow > .card, .narrow > button.card')
    expect(first.classList.contains('streak-card')).toBe(true)
  })
  it('opens the Customize Home sheet from its button', () => {
    mount()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Customize Home').click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })
})
