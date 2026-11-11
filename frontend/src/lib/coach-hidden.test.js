// myGym: on a server without AI every Coach entry point is out of sight (lib/coach.js coachHidden),
// and with a Coach on the server (or on this phone) they are all back.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { coachHidden } from './coach.js'
import { coachNeedsServer } from './fork-flags.js'
import { pageVisible, searchSettings } from '../views/settings-pages.js'
import { cardState } from './integrations.js'
import { presetCopy } from './modules-copy.js'

const user = { id: 'u1' }
const tr = s => s

describe('coachHidden', () => {
  it('hides when the server config has no Coach for this session', () => {
    expect(coachHidden(null, user)).toBe(true)
    expect(coachHidden({ coach: null }, user)).toBe(true)
    expect(coachHidden({}, user)).toBe(true)
    expect(coachHidden({ coach: { enabled: true } }, null)).toBe(true)
  })
  it('shows with a Coach on the server, a Coach on this phone, or in the demo', () => {
    expect(coachHidden({ coach: { enabled: true } }, user)).toBe(false)
    expect(coachHidden(null, user, { coachMode: 'byok' })).toBe(false)
    expect(coachHidden(null, null, { demo: true })).toBe(false)
  })
  it('never hides when the build keeps upstream behaviour', () => {
    expect(coachHidden(null, user, { needServer: false })).toBe(false)
  })
})

describe('coachNeedsServer', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('is off under test and follows VITE_COACH_NEEDS_SERVER', () => {
    expect(coachNeedsServer()).toBe(false)
    vi.stubEnv('VITE_COACH_NEEDS_SERVER', '1')
    expect(coachNeedsServer()).toBe(true)
  })
})

describe('the Coach entry points follow it', () => {
  const phone = { mobile: true, user, mod: () => true }
  it('Settings: no AI Coach page or search hit on the phone without a Coach', () => {
    expect(pageVisible('coach', phone)).toBe(true)
    expect(pageVisible('coach', { ...phone, noCoach: true })).toBe(false)
    expect(searchSettings('coach', { ...phone, noCoach: true }, tr).map(h => h.page)).toEqual([])
    expect(searchSettings('coach', phone, tr).map(h => h.page)).toContain('coach')
  })
  it('Integrations: no AI Coach card', () => {
    expect(cardState('coach', { mobile: true, platform: 'ios', noCoach: true })).toBeNull()
    expect(cardState('coach', { mobile: true, platform: 'ios' })).toEqual({ status: 'off', action: 'connect' })
  })
  it('Modules: Everything stops promising the Coach', () => {
    expect(presetCopy(true).all[1]).toBe('Streaks, themes, the lot.')
    expect(presetCopy().all[1]).toBe('Streaks, the Coach, themes, the lot.')
  })
})
