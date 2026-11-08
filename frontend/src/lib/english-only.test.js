// @vitest-environment happy-dom
// English only (this fork): with the lock on, no route leads to another language.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { englishOnly } from './english-only.js'
import { getLang, setLang } from './i18n.js'

afterEach(async () => { vi.unstubAllEnvs(); await setLang('en') })

describe('the English-only lock', () => {
  it('is off by default under test (so upstream language tests still run) and on for a real build', () => {
    expect(englishOnly()).toBe(false)
    vi.stubEnv('MODE', 'production')
    expect(englishOnly()).toBe(true)
  })
  it('VITE_ENGLISH_ONLY decides when set', () => {
    vi.stubEnv('VITE_ENGLISH_ONLY', '1'); expect(englishOnly()).toBe(true)
    vi.stubEnv('VITE_ENGLISH_ONLY', '0'); vi.stubEnv('MODE', 'production'); expect(englishOnly()).toBe(false)
  })
  it('locked: every language, including a right-to-left one, resolves to English', async () => {
    vi.stubEnv('VITE_ENGLISH_ONLY', '1')
    for (const l of ['de', 'ar', 'hi', 'pt-BR', 'zh', 'nonsense']) {
      await setLang(l)
      expect(getLang(), l).toBe('en')
    }
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
  it('locked: a lang/dir set by the first-paint script from the browser is put right, even when already English', async () => {
    vi.stubEnv('VITE_ENGLISH_ONLY', '1')
    await setLang('en')
    document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'
    await setLang('en')   // the early-exit path: same language as before
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
  it('unlocked: other languages still work, so the packs are intact for anyone who lifts the lock', async () => {
    vi.stubEnv('VITE_ENGLISH_ONLY', '0')
    await setLang('de')
    expect(getLang()).toBe('de')
  })
})
