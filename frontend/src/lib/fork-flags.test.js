import { afterEach, describe, expect, it, vi } from 'vitest'
import { altAppIcons } from './fork-flags.js'
afterEach(() => vi.unstubAllEnvs())
describe('alternate app icons', () => {
  it('are on under test so upstream tests guard them, off in a real build, and VITE_ALT_APP_ICONS decides when set', () => {
    expect(altAppIcons()).toBe(true)
    vi.stubEnv('MODE', 'production'); expect(altAppIcons()).toBe(false)
    vi.stubEnv('VITE_ALT_APP_ICONS', '1'); expect(altAppIcons()).toBe(true)
    vi.stubEnv('VITE_ALT_APP_ICONS', '0'); vi.stubEnv('MODE', 'test'); expect(altAppIcons()).toBe(false)
  })
})
