// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: {}, MOBILE: false, toasts: [], sched: [], water: [] }
  state.snapshot = () => ({
    S: state.S,
    user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: m => mocks.toasts.push(m) }) } }))
vi.mock('../lib/mobile.js', () => ({ get MOBILE() { return mocks.MOBILE } }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
vi.mock('../lib/schedule-reminders.js', () => ({ syncScheduleReminders: (...a) => { mocks.sched.push(a); return Promise.resolve(true) } }))
vi.mock('../lib/water-reminders.js', async orig => ({ ...(await orig()), syncWaterReminders: (...a) => { mocks.water.push(a); return Promise.resolve(true) } }))

import { SixAmBanner } from './SixAmTimetable.jsx'
import { WaterReminderSwitch, WaterReminderSettings } from './WaterReminders.jsx'

const OLD = { plans: [{ id: 'shift', name: 'Shift 2pm-11pm', days: [0, 1, 2, 3, 4, 5, 6], rows: [
  { id: 'r1', time: '10:00', label: 'Wake up', kind: 'wake', note: '' },
  { id: 'r3', time: '11:00', label: 'Gym', kind: 'gym', note: '' },
] }], remind: true }

let host, root
const mount = el => act(() => { root.render(el) })
const btn = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  mocks.S = {}; mocks.MOBILE = false; mocks.toasts = []; mocks.sched = []; mocks.water = []
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('the 6 am timetable banner', () => {
  it('shows nothing for the default or the 6 am plan', () => {
    mount(<SixAmBanner />)
    expect(host.textContent).toBe('')
  })
  it('Switch moves the stored plan to 6 am and re-plans the phone reminders', () => {
    mocks.S = { daySchedule: structuredClone(OLD) }
    mocks.MOBILE = true
    mount(<SixAmBanner />)
    expect(host.textContent).toContain('Your timetable is the old 11 am one. Switch to the 6 am plan?')
    act(() => btn('Switch').click())
    expect(mocks.S.daySchedule.plans.map(p => p.id)).toEqual(['shift', 'cardio', 'rest'])
    expect(mocks.S.daySchedule.remind).toBe(true)
    expect(mocks.sched).toHaveLength(1)
    expect(mocks.water).toHaveLength(1)
    expect(mocks.water[0][0].daySchedule).toBe(mocks.S.daySchedule)
  })
  it('Not now is remembered', () => {
    mocks.S = { daySchedule: structuredClone(OLD) }
    mount(<SixAmBanner />)
    act(() => btn('Not now').click())
    expect(mocks.S.sixAmDismissed).toBe(true)
    expect(mocks.S.daySchedule.plans[0].rows[0].time).toBe('10:00')
    mount(<SixAmBanner key="again" />)
    expect(host.textContent).toBe('')
  })
})

describe('the water reminder switches', () => {
  it('the Diet switch is the phone only', () => {
    mount(<WaterReminderSwitch />)
    expect(host.textContent).toBe('')
  })
  it('on the website the section says where they work', () => {
    mount(<WaterReminderSettings />)
    expect(host.textContent).toContain('Works in the iPhone app')
    expect(host.querySelector('[role="switch"], input[type="checkbox"]')).toBe(null)
  })
  it('on the phone the switch turns them on, asking permission', async () => {
    mocks.MOBILE = true
    mount(<WaterReminderSwitch />)
    expect(host.textContent).toContain('Remind me to drink water')
    const sw = host.querySelector('[role="switch"]') || host.querySelector('button')
    await act(async () => { sw.click() })
    expect(mocks.S.waterReminders).toEqual({ on: true, every: 90, quietGym: true })
    expect(mocks.water[0][2]).toEqual({ interactive: true })
  })
})
