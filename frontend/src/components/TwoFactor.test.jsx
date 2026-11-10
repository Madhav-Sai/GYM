// @vitest-environment happy-dom
// Settings → Two-factor sign-in (components/TwoFactor.jsx): the row reads its status, the setup
// sheet asks the password, shows the QR and the key, confirms a code and then the recovery codes
// once; turning it off sends the password and a code. The API is a stand-in.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwoFactorRow, TwoFactorSetupSheet, TwoFactorOffSheet, groupSecret } from './TwoFactor.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { sheets: [], answers: {}, calls: [] }
  state.toast = vi.fn()
  state.api = vi.fn(async (path, init) => {
    state.calls.push({ path, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : null })
    const a = state.answers[(init?.method || 'GET') + ' ' + path]
    if (a instanceof Error) throw a
    return a ?? {}
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ S: {}, config: {}, sync: {} })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  api: (...a) => mocks.api(...a), webauthnOK: () => false, passkeyAssertion: vi.fn(),
  passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))
vi.mock('./QrCanvas.jsx', () => ({ default: ({ value }) => <canvas data-qr={value} /> }))
vi.mock('../lib/clipboard.js', () => ({ copyText: vi.fn(async () => true) }))

const fail = (status, data) => Object.assign(new Error(data?.error || 'HTTP ' + status), { status, data })
const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const type = (el, value) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
const submit = async host => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => { mocks.sheets = []; mocks.answers = {}; mocks.calls = []; mocks.toast.mockClear() })
afterEach(() => { act(() => { mounted.splice(0).forEach(m => { m.root.unmount(); m.host.remove() }) }) })

describe('two-factor sign-in in Settings', () => {
  it('the row says off, and opens the setup; a server without the route shows nothing', async () => {
    mocks.answers['GET /api/2fa/status'] = { enabled: false, password: true, recoveryLeft: 0 }
    const host = mount(<TwoFactorRow />)
    await settle()
    expect(host.textContent).toMatch('Two-factor sign-in')
    expect(host.textContent).toMatch('Off. Asks for a code')
    mocks.answers['GET /api/2fa/status'] = fail(404, { error: 'not found' })
    const none = mount(<TwoFactorRow />)
    await settle()
    expect(none.textContent).toBe('')
  })

  it('the row says on, with how many recovery codes are left', async () => {
    mocks.answers['GET /api/2fa/status'] = { enabled: true, since: '2026-11-01T10:00:00.000Z', password: true, recoveryLeft: 7 }
    const host = mount(<TwoFactorRow />)
    await settle()
    expect(host.textContent).toMatch('7 recovery codes left')
  })

  it('setup: password, then the QR and the key, then a code, then the ten recovery codes once', async () => {
    const done = vi.fn(), close = vi.fn()
    mocks.answers['POST /api/2fa/setup'] = { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/myGym:Ada?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=myGym' }
    const codes = Array.from({ length: 10 }, (_, i) => 'AAAA' + i + '-BBBBB')
    mocks.answers['POST /api/2fa/enable'] = { ok: true, recoveryCodes: codes, enabled: true }
    const host = mount(<TwoFactorSetupSheet close={close} done={done} />)
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('Enter your password.')
    type(host.querySelector('input[name=current-password]'), 'my password 123')
    await submit(host)
    expect(mocks.calls.at(-1)).toEqual({ path: '/api/2fa/setup', method: 'POST', body: { password: 'my password 123' } })
    expect(host.querySelector('canvas').dataset.qr).toMatch(/^otpauth:\/\/totp\/myGym:Ada/)
    expect(host.querySelector('[data-testid=totp-secret]').textContent).toBe('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    type(host.querySelector('input[name=one-time-code]'), '12')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('The code has 6 digits.')
    type(host.querySelector('input[name=one-time-code]'), '123 456')
    await submit(host)
    expect(mocks.calls.at(-1)).toEqual({ path: '/api/2fa/enable', method: 'POST', body: { code: '123456' } })
    expect(done).toHaveBeenCalled()
    for (const c of codes) expect(host.textContent).toContain(c)
    expect(button(host, 'Copy the codes')).toBeTruthy()
    act(() => button(host, 'I saved them').click())
    expect(close).toHaveBeenCalled()
  })

  it('setup: a wrong password is said in words', async () => {
    mocks.answers['POST /api/2fa/setup'] = fail(403, { code: 'current-wrong' })
    const host = mount(<TwoFactorSetupSheet close={vi.fn()} done={vi.fn()} />)
    type(host.querySelector('input[name=current-password]'), 'nope')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toBe('Your current password is not right.')
  })

  it('turning it off sends the password and a code, or a recovery code', async () => {
    const done = vi.fn(), close = vi.fn()
    mocks.answers['POST /api/2fa/disable'] = { ok: true, enabled: false }
    const host = mount(<TwoFactorOffSheet close={close} done={done} />)
    type(host.querySelector('input[name=current-password]'), 'my password 123')
    act(() => button(host, 'Use a recovery code').click())
    type(host.querySelector('input[name=one-time-code]'), 'abcde-fghjk')
    await submit(host)
    expect(mocks.calls.at(-1)).toEqual({ path: '/api/2fa/disable', method: 'POST', body: { password: 'my password 123', code: 'ABCDE-FGHJK' } })
    expect(close).toHaveBeenCalled(); expect(done).toHaveBeenCalled()
  })

  it('groups the key in fours', () => {
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
  })
})
