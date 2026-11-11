// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { searchSettings } from './settings-pages.js'
import { bindUI } from '../components/ui.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The monthly body check reminder (components/BodyCheckReminderRow.jsx): Home's card shows its
// switch only while something is due, so Settings → Reminders carries the same switch on the phone.
const mocks = vi.hoisted(() => {
  const state = { S: null, MOBILE: false, user: { id: 'u1', name: 'One' }, syncBody: null, syncOk: true }
  state.syncBody = (...a) => { state.syncCalls.push(a); return Promise.resolve(state.syncOk) }
  state.syncCalls = []
  state.snapshot = () => ({
    S: state.S,
    user: state.user,
    update: mut => {
      const next = structuredClone(state.S)
      mut(next)
      state.S = next
    },
    replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { on: false, time: '08:00', tz: null, nudge: false, tone: 'friendly' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.resolve({})), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({
  pushSupported: () => true, syncPushSubscription: () => Promise.resolve(true),
  enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn(),
}))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({
  get MOBILE() { return mocks.MOBILE }, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(),
  syncReminder: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('../lib/body-reminders.js', async orig => ({ ...(await orig()), syncBodyReminders: mocks.syncBody }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  loadStarterPlan: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(),
}))

globalThis.__APP_VERSION__ ??= 'test'

let sheet = null
bindUI({ getState: () => ({ openSheet: render => { sheet = render; return { close: () => {} } } }) })

let host, root
beforeEach(() => {
  sheet = null
  mocks.MOBILE = false
  mocks.user = { id: 'u1', name: 'One' }
  mocks.S = {
    unit: 'kg', restSec: 90, restPauseSec: 15, sound: false, effort: 'none',
    gifSize: 'full', workouts: [], routines: [], exWeights: {},
    reminder: { on: true, time: '08:00', tz: 'Europe/Zurich' },
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const mount = async () => { await act(async () => { root.render(<Settings page="reminders" />) }) }
const row = () => [...host.querySelectorAll('.lrow')].find(r => r.textContent.includes('Monthly body check'))

describe('Settings → Reminders: the monthly body check', () => {
  beforeEach(() => { mocks.syncCalls.length = 0; mocks.syncOk = true })

  it('is on the phone, off by default, and its switch queues the reminders and remembers it', async () => {
    mocks.MOBILE = true
    await mount()
    expect(row()).toBeTruthy()
    const sw = row().querySelector('[role=switch]')
    expect(sw.getAttribute('aria-label')).toBe('Monthly body check')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await act(async () => { sw.click() })
    expect(mocks.syncCalls[0]).toEqual([true, true])
    expect(mocks.S.bodyReminderNotify).toBe(true)
    await mount()
    expect(row().querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true')
    await act(async () => { row().querySelector('[role=switch]').click() })
    expect(mocks.syncCalls[1]).toEqual([false, true])
    expect(mocks.S.bodyReminderNotify).toBe(false)
  })

  it('stays off when the phone refuses notifications', async () => {
    mocks.MOBILE = true
    mocks.syncOk = false
    await mount()
    await act(async () => { row().querySelector('[role=switch]').click() })
    expect(mocks.S.bodyReminderNotify).toBeUndefined()
  })

  it('is not on the web, where the reminder is the phone\'s, and the search agrees', async () => {
    mocks.MOBILE = false
    await mount()
    expect(row()).toBeFalsy()
    expect(searchSettings('body check', { user: { id: 'u1' }, mobile: false }).some(h => h.title === 'Monthly body check')).toBe(false)
    expect(searchSettings('body check', { user: { id: 'u1' }, mobile: true }).some(h => h.title === 'Monthly body check' && h.page === 'reminders')).toBe(true)
  })
})
