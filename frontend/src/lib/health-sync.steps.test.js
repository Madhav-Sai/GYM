import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// readTodaySteps (our addition): Apple Health's step count for today, the Whoop card's stand-in.
// The plugin and the app's data directory are played in memory, as in health-sync.read.test.js.
const h = vi.hoisted(() => {
  vi.stubEnv('VITE_MOBILE', '1')
  return { files: new Map(), calls: [], platform: 'ios', steps: 4321, fail: null }
})

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readFile: async ({ path }) => {
      if (!h.files.has(path)) throw new Error('File does not exist')
      return { data: h.files.get(path) }
    },
    writeFile: async ({ path, data }) => { h.files.set(path, data) },
  },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: () => ({ remove() {} }) } }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform },
  registerPlugin: () => ({
    status: async () => ({ status: 'available', granted: true }),
    requestPermissions: async arg => { h.calls.push(['request', arg]); return { granted: true } },
    readSteps: async arg => {
      h.calls.push(['readSteps', arg])
      if (h.fail) throw Object.assign(new Error('no'), { code: h.fail })
      return h.steps == null ? {} : { steps: h.steps }
    },
    setEnabled: async () => {},
  }),
}))

const NOW = new Date(2026, 10, 11, 15, 0, 0).getTime()
const on = extra => h.files.set('opengym-health.json', JSON.stringify({ on: true, written: {}, ...extra }))
let hs
beforeEach(async () => {
  vi.resetModules()
  h.files.clear(); h.calls = []; h.platform = 'ios'; h.steps = 4321; h.fail = null
  hs = await import('./health-sync.js')
})
afterEach(() => { vi.restoreAllMocks() })

describe('readTodaySteps', () => {
  it('reads today since local midnight, asking for the step permission once', async () => {
    on()
    expect(await hs.readTodaySteps({ now: NOW })).toBe(4321)
    expect(h.calls[0]).toEqual(['request', { read: ['steps'], write: [] }])
    expect(h.calls[1]).toEqual(['readSteps', { from: new Date(2026, 10, 11).getTime(), to: NOW }])
    expect(JSON.parse(h.files.get('opengym-health.json')).stepsAsked).toBe(true)
    // Within five minutes the last answer stands; after, it reads again without asking again.
    expect(await hs.readTodaySteps({ now: NOW + 60e3 })).toBe(4321)
    h.steps = 5000
    expect(await hs.readTodaySteps({ now: NOW + 6 * 60e3 })).toBe(5000)
    expect(h.calls.filter(c => c[0] === 'request')).toHaveLength(1)
  })

  it('is null with Apple Health off, on Android, or with the Health module off', async () => {
    expect(await hs.readTodaySteps({ now: NOW })).toBe(null)
    hs._resetStepsMemo(); h.platform = 'android'; on()
    vi.resetModules(); hs = await import('./health-sync.js')
    expect(await hs.readTodaySteps({ now: NOW })).toBe(null)
    expect(await hs.readTodaySteps({ now: NOW, S: { modules: { health: false } } })).toBe(null)
    expect(h.calls.filter(c => c[0] === 'readSteps')).toHaveLength(0)
  })

  it('degrades to null when the app has no readSteps or Apple Health has nothing', async () => {
    on({ stepsAsked: true })
    h.fail = 'UNIMPLEMENTED'
    expect(await hs.readTodaySteps({ now: NOW })).toBe(null)
    hs._resetStepsMemo(); h.fail = null; h.steps = null
    expect(await hs.readTodaySteps({ now: NOW })).toBe(null)
  })
})
