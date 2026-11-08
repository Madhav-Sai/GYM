// @vitest-environment happy-dom
// The one-screen sign-in (this fork): a name, a password, one button, and none of upstream's other doors.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { config: null }
  state.setUser = vi.fn(); state.adoptProfile = vi.fn(async () => {}); state.toast = vi.fn(); state.passwordLogin = vi.fn()
  state.snapshot = () => ({ config: state.config, S: {}, setUser: state.setUser, adoptProfile: state.adoptProfile, setGuest: vi.fn(), loadConfig: vi.fn(async () => state.config), pushState: vi.fn(), pullState: vi.fn() })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: mocks.toast, openSheet: () => ({}) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => true, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: (...a) => mocks.passwordLogin(...a), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
vi.mock('../lib/demo.js', () => ({ DEMO: false, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const typeInto = (el, value) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
const submit = async host => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }) }

beforeEach(() => {
  vi.stubEnv('VITE_SIMPLE_LOGIN', '1')
  mocks.config = { password_login: true }
  mocks.setUser.mockClear(); mocks.adoptProfile.mockClear(); mocks.toast.mockClear(); mocks.passwordLogin.mockReset()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(m => { m.root.unmount(); m.host.remove() }) }); vi.unstubAllEnvs() })

describe('the one-screen sign-in', () => {
  it('is a name, a password and one button, with none of the other doors', () => {
    const host = mount(<Login />)
    expect([...host.querySelectorAll('input')].map(i => i.name)).toEqual(['username', 'password'])
    expect(host.querySelector('input[name=password]').type).toBe('password')
    expect([...host.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Sign in'])
    for (const gone of ['passkey', 'Create new profile', 'Continue without account', 'Lost access', 'device']) expect(host.textContent).not.toMatch(new RegExp(gone, 'i'))
  })
  it('says what is missing instead of calling the server', async () => {
    const host = mount(<Login />)
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('Enter your name.')
    typeInto(host.querySelector('input[name=username]'), 'madhav')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('Enter your password.')
    expect(mocks.passwordLogin).not.toHaveBeenCalled()
  })
  it('signs in with the name (trimmed) and the password, then adopts the profile', async () => {
    mocks.passwordLogin.mockResolvedValue({ id: 'u1', name: 'madhav' })
    const host = mount(<Login />)
    typeInto(host.querySelector('input[name=username]'), '  madhav ')
    typeInto(host.querySelector('input[name=password]'), 'a long password 1')
    await submit(host)
    expect(mocks.passwordLogin).toHaveBeenCalledWith('madhav', 'a long password 1')
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'u1', name: 'madhav' }, { adopt: true })
    expect(mocks.adoptProfile).toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalled()
  })
  it('a wrong password is said in words and nothing is signed in', async () => {
    mocks.passwordLogin.mockRejectedValue(Object.assign(new Error('x'), { status: 401, data: { code: 'bad-credentials' } }))
    const host = mount(<Login />)
    typeInto(host.querySelector('input[name=username]'), 'madhav')
    typeInto(host.querySelector('input[name=password]'), 'nope nope nope')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('Wrong name, e-mail or password.')
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(host.querySelector('button').disabled).toBe(false)   // can try again
  })
  it('an instance without password sign-in keeps the original screen', () => {
    mocks.config = { password_login: false }
    const host = mount(<Login />)
    expect(host.textContent).toMatch(/passkey/i)
  })
})
