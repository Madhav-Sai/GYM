// @vitest-environment happy-dom
// myGym: on a server without AI the Modules page has no AI Coach row, and Everything does not
// mention it. With the server's Coach on, both are back.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, user: null, config: null }
  state.snapshot = () => ({ S: state.S, user: state.user, config: state.config, coachLocal: null, update: () => {} })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../sheets.jsx', () => ({ confirmSheet: () => {} }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ connections: [] })) }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false }))
vi.mock('../lib/watch-relay.js', () => ({ relayLinks: () => Promise.resolve([]) }))

import ModulesPage from './Modules.jsx'

let host, root
beforeEach(() => {
  vi.stubEnv('VITE_COACH_NEEDS_SERVER', '1')
  mocks.S = { unit: 'kg', workouts: [] }
  mocks.user = { id: 'u1' }
  mocks.config = { coach: null }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllEnvs() })

const titles = () => [...host.querySelectorAll('.lrow-t')].map(e => e.textContent)

describe('Modules without a Coach on the server', () => {
  it('has no AI Coach row', () => {
    act(() => root.render(<ModulesPage />))
    expect(titles()).not.toContain('AI Coach')
    expect(titles()).toContain('Seasonal themes')
  })
  it('shows the row again once the server has a Coach', () => {
    mocks.config = { coach: { enabled: true } }
    act(() => root.render(<ModulesPage />))
    expect(titles()).toContain('AI Coach')
  })
})
