import { afterEach, describe, expect, it, vi } from 'vitest'
import { shownCards, shownDirectory, directory } from './integrations.js'

afterEach(() => vi.unstubAllEnvs())

const ctx = { mobile: false, platform: null, user: { id: 'u' }, demo: false, admin: true, health: null, offered: ['webhook', 'whoop'], server: { connections: [] }, coach: true }

describe('which integration cards a build shows', () => {
  it('under test: all of them, so upstream tests of the others keep guarding them', () => {
    expect(shownCards()).toBeNull()
    expect(shownDirectory(ctx).flatMap(c => c.cards.map(x => x.id)).length).toBe(directory(ctx).flatMap(c => c.cards.map(x => x.id)).length)
  })
  it('a real build: Whoop and nothing else', () => {
    vi.stubEnv('MODE', 'production')
    expect(shownCards()).toEqual(['whoop'])
    const ids = shownDirectory(ctx).flatMap(c => c.cards.map(x => x.id))
    expect(ids).toEqual(['whoop'])
    expect(shownDirectory(ctx).map(c => c.id)).toEqual(['health'])   // categories left empty are gone
  })
  it('VITE_SHOWN_CARDS brings more back, and * brings back all', () => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_SHOWN_CARDS', 'whoop, webhook')
    expect(shownDirectory(ctx).flatMap(c => c.cards.map(x => x.id)).sort()).toEqual(['webhook', 'whoop'])
    vi.stubEnv('VITE_SHOWN_CARDS', '*')
    expect(shownCards()).toBeNull()
  })
})
