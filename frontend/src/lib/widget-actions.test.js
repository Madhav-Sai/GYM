import { describe, expect, it } from 'vitest'
import {
  cleanAction, parseDrained, mergePending, requestOf, sendActions, rememberApplied, overlayPending,
  loadActionState, saveActionState, flushWidgetActions, WIDGET_ACTIONS_KEY, WIDGET_APPLIED_MAX,
} from './widget-actions.js'

// The iPhone widgets' +250 ml and Taken buttons (ios/App/OpenGymWidgets/MyGymWidgets.swift): what
// the page does with the taps the widget queued.
const memory = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, raw: m }
}
const water = (id, o = {}) => ({ id, kind: 'water', amount: 250, day: '2026-11-11', at: 1000, ...o })
const supp = (id, suppId, o = {}) => ({ id, kind: 'supp', suppId, day: '2026-11-11', at: 2000, ...o })
const httpError = status => Object.assign(new Error('HTTP ' + status), { status })

describe('cleanAction', () => {
  it('keeps a water tap and a supplement tap', () => {
    expect(cleanAction(water('a'))).toEqual(water('a'))
    expect(cleanAction(supp('b', 'omega3'))).toEqual(supp('b', 'omega3'))
  })

  it('refuses anything that is not one', () => {
    for (const a of [null, 42, {}, { kind: 'water', amount: 250, day: '2026-11-11' }, water(''), water('a', { kind: 'food' }),
      water('a', { amount: 0 }), water('a', { amount: -250 }), water('a', { amount: 5000 }), water('a', { amount: 'x' }),
      supp('a', ''), supp('a', 7), water('a', { day: 'today', at: null })]) {
      expect(cleanAction(a)).toBeNull()
    }
  })

  it('works the health day out from the time when the day is missing', () => {
    // 2026-11-11 02:00 in India (20:30 UTC the day before) still counts for the 10th.
    const at = Date.parse('2026-11-10T20:30:00Z')
    expect(cleanAction(water('a', { day: undefined, at })).day).toBe('2026-11-10')
  })
})

describe('parseDrained', () => {
  it('reads the plugin answer, a JSON string or a list', () => {
    expect(parseDrained({ json: JSON.stringify([water('a'), { junk: 1 }]) })).toEqual([water('a')])
    expect(parseDrained([supp('b', 'x')])).toEqual([supp('b', 'x')])
    expect(parseDrained({ json: '[' })).toEqual([])
    expect(parseDrained(undefined)).toEqual([])
  })
})

describe('mergePending', () => {
  it('has each id once, none already sent, oldest first', () => {
    const out = mergePending([water('a', { at: 3 })], [water('a', { at: 3 }), water('b', { at: 1 }), water('c', { at: 2 })], ['c'])
    expect(out.map(a => a.id)).toEqual(['b', 'a'])
  })
})

describe('requestOf', () => {
  it('makes the same calls as the Diet and Supplements screens', () => {
    expect(requestOf(water('a'))).toEqual({ path: '/api/health/diet/water', body: { day: '2026-11-11', ml: 250 } })
    expect(requestOf(supp('b', 'omega3'))).toEqual({ path: '/api/health/supplements/mark', body: { day: '2026-11-11', id: 'omega3', status: 'taken' } })
  })
})

describe('sendActions', () => {
  it('keeps what failed for the next try and drops what never will work', async () => {
    const calls = []
    const post = async (path, body) => {
      calls.push([path, body])
      if (body.id === 'gone') throw httpError(404)
      if (body.id === 'later') throw httpError(503)
      if (body.ml === 500) throw new Error('offline')
      return {}
    }
    const r = await sendActions([water('a'), supp('b', 'gone'), supp('c', 'later'), water('d', { amount: 500 }), supp('e', 'ok')], post)
    expect(calls).toHaveLength(5)
    expect(r.done).toEqual(['a', 'e'])
    expect(r.dropped).toEqual(['b'])
    expect(r.keep.map(a => a.id)).toEqual(['c', 'd'])
  })
})

describe('rememberApplied', () => {
  it('keeps the newest ids without repeats', () => {
    expect(rememberApplied(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
    const many = Array.from({ length: WIDGET_APPLIED_MAX }, (_, i) => 'x' + i)
    const out = rememberApplied(many, ['new'])
    expect(out).toHaveLength(WIDGET_APPLIED_MAX)
    expect(out.at(-1)).toBe('new')
    expect(out[0]).toBe('x1')
  })
})

describe('overlayPending', () => {
  const snap = () => ({
    v: 2,
    diet: { day: '2026-11-11', water: 1000, waterTarget: 2500 },
    supps: { day: '2026-11-11', pending: 2, d3Taken: false, items: [{ id: 'omega3', taken: false }, { id: 'd3', d3: true, taken: false }, { id: 'whey', taken: true }] },
  })

  it('draws the water and the ticks the server has not got yet', () => {
    const s = snap()
    const out = overlayPending(s, [water('a'), water('b'), supp('c', 'd3'), supp('d', 'whey')])
    expect(out.diet.water).toBe(1500)
    expect(out.supps.items.map(i => i.taken)).toEqual([false, true, true])
    expect(out.supps.pending).toBe(1)
    expect(out.supps.d3Taken).toBe(true)
    // The input is left alone.
    expect(s.diet.water).toBe(1000)
    expect(s.supps.items[1].taken).toBe(false)
  })

  it('leaves another day alone, and a snapshot with nothing pending as it is', () => {
    const s = snap()
    expect(overlayPending(s, [])).toBe(s)
    const out = overlayPending(s, [water('a', { day: '2026-11-10' }), supp('b', 'omega3', { day: '2026-11-10' })])
    expect(out.diet).toBe(s.diet)
    expect(out.supps).toBe(s.supps)
  })

  it('counts from 0 when the water was unknown', () => {
    expect(overlayPending({ diet: { day: '2026-11-11', water: null } }, [water('a')]).diet.water).toBe(250)
  })
})

describe('the kept state', () => {
  it('survives a round trip and a broken value', () => {
    const st = memory()
    saveActionState({ pending: [water('a')], applied: ['z'] }, st)
    expect(loadActionState(st)).toEqual({ pending: [water('a')], applied: ['z'] })
    st.setItem(WIDGET_ACTIONS_KEY, '{nope')
    expect(loadActionState(st)).toEqual({ pending: [], applied: [] })
    expect(loadActionState(null)).toEqual({ pending: [], applied: [] })
  })
})

describe('flushWidgetActions', () => {
  const bridgeWith = (...batches) => ({ drainActions: async () => ({ json: JSON.stringify(batches.shift() || []) }) })

  it('sends each drained tap once, even when the queue hands it back again', async () => {
    const storage = memory()
    const posts = []
    const post = async (path, body) => { posts.push(path); return {} }
    const bridge = bridgeWith([water('a'), supp('b', 'omega3')], [water('a')])
    expect((await flushWidgetActions({ bridge, post, storage })).sent).toBe(2)
    expect((await flushWidgetActions({ bridge, post, storage })).sent).toBe(0)
    expect(posts).toEqual(['/api/health/diet/water', '/api/health/supplements/mark'])
    expect(loadActionState(storage).pending).toEqual([])
  })

  it('keeps a tap the server did not take, and sends it on the next run', async () => {
    const storage = memory()
    let online = false
    const posts = []
    const post = async (path, body) => { if (!online) throw new Error('offline'); posts.push(body); return {} }
    const bridge = bridgeWith([water('a')], [])
    const first = await flushWidgetActions({ bridge, post, storage })
    expect(first.sent).toBe(0)
    expect(first.pending.map(a => a.id)).toEqual(['a'])
    online = true
    const second = await flushWidgetActions({ bridge, post, storage })
    expect(second.sent).toBe(1)
    expect(posts).toEqual([{ day: '2026-11-11', ml: 250 }])
    expect(loadActionState(storage).pending).toEqual([])
  })

  it('drops a supplement the server no longer has', async () => {
    const storage = memory()
    const post = async () => { throw httpError(404) }
    const r = await flushWidgetActions({ bridge: bridgeWith([supp('b', 'gone')]), post, storage })
    expect(r.pending).toEqual([])
    expect(loadActionState(storage).applied).toEqual(['b'])
  })

  it('still sends the kept ones when the bridge has no drain (Android) or fails', async () => {
    const storage = memory()
    saveActionState({ pending: [water('a')], applied: [] }, storage)
    const posts = []
    const post = async path => { posts.push(path); return {} }
    expect((await flushWidgetActions({ bridge: {}, post, storage })).sent).toBe(1)
    saveActionState({ pending: [water('b')], applied: [] }, storage)
    const broken = { drainActions: async () => { throw new Error('not implemented') } }
    expect((await flushWidgetActions({ bridge: broken, post, storage })).sent).toBe(1)
    expect(posts).toHaveLength(2)
  })

  it('runs one at a time', async () => {
    const storage = memory()
    let n = 0
    const post = async () => { n++; await new Promise(r => setTimeout(r, 5)); return {} }
    const bridge = bridgeWith([water('a')])
    const [x, y] = await Promise.all([flushWidgetActions({ bridge, post, storage }), flushWidgetActions({ bridge, post, storage })])
    expect(x).toBe(y)
    expect(n).toBe(1)
  })
})
