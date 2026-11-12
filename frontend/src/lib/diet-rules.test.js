import { describe, expect, test } from 'vitest'
import { RULES, NEVER, IF_HUNGRY, OFFICE_BOXES, VEG_WARNINGS, VEG_OPTIONAL, SHOPPING, shoppingFor, rulesFor, OIL_RULE, toggleTick, clearTicks, readTicks, writeTicks, allRuleTexts, TICKS_KEY } from './diet-rules.js'

const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

describe('the plan\'s rules', () => {
  test('four rules, the never list with a reason each, both tracks of if-hungry and office boxes', () => {
    expect(RULES.map(r => r.title)).toEqual(['Carbs under 130 g.', 'Omega-3 at 3 capsules.', 'Zero alcohol.', 'Zero added sugar.'])
    expect(NEVER).toHaveLength(10)
    for (const n of NEVER) expect(n.why.length).toBeGreaterThan(0)
    expect(NEVER.at(-1)).toEqual({ food: 'Potato', why: 'Treat it as rice' })
    expect(IF_HUNGRY.nonveg).toEqual(['2 boiled eggs'])
    expect(IF_HUNGRY.veg).toEqual(['100 g tofu or 150 g Greek yogurt'])
    // the 6 am day: two boxes, dinner is cooked at 1 pm
    expect(OFFICE_BOXES.nonveg).toHaveLength(2)
    expect(OFFICE_BOXES.veg[0]).toContain('Greek yogurt')
    expect(OFFICE_BOXES.both).toContain('Cook dinner at 1 pm with lunch and leave it ready.')
    // fish oil on both tracks (the owner's choice): no "not vegetarian" warning, one optional algal line
    expect(VEG_WARNINGS.map(w => w.title)).toEqual(['Paneer has saturated fat', 'Soya chunks are carb-heavy', 'B12'])
    expect(VEG_WARNINGS.at(-1).text).toBe('Pure veg for 40 days: B12 retest in 3 months (it was 403). Below 250: B12 1500 mcg weekly.')
    expect(VEG_OPTIONAL).toEqual(['Prefer fully vegetarian? Algal omega-3 gives the same EPA+DHA.'])
    expect(OIL_RULE).toContain('1 tsp per meal')
  })
  test('each track shows only its own foods: nothing with egg, fish or chicken on the veg track', () => {
    const NONVEG = /egg|fish|chicken|mackerel|sardine/i
    const v = rulesFor('veg')
    for (const s of [...v.ifHungry, ...v.officeBoxes, ...v.warnings.flatMap(w => [w.title, w.text]), ...shoppingFor('veg')[0].items.map(i => i.text)]) {
      expect(s, s).not.toMatch(NONVEG)
    }
    // the monthly list's one fish word is the owner's fish-oil capsule, on both tracks
    expect(shoppingFor('veg')[1].items.filter(i => NONVEG.test(i.text)).map(i => i.text)).toEqual(['Omega-3 (fish oil)'])
    const n = rulesFor('nonveg')
    expect(n.ifHungry).toContain('2 boiled eggs')
    expect(n.warnings).toEqual([])
    expect(n.optional).toEqual([])
    expect(v.optional).toEqual(VEG_OPTIONAL)
    expect(shoppingFor(true)).toEqual(shoppingFor('veg'))
  })
  test('no em dashes in any text', () => {
    for (const s of allRuleTexts()) expect(s, s).not.toMatch(/—/)
  })
})

describe('the shopping list', () => {
  test('weekly by track, then monthly; ids unique', () => {
    expect(shoppingFor(false).map(l => l.id)).toEqual(['weekly', 'monthly'])
    expect(shoppingFor(false)[0].items[0].text).toBe('Eggs, 2 dozen')
    expect(shoppingFor(true)[0].items[0].text).toBe('Paneer, 750 g (low-fat if available)')
    const ids = [...SHOPPING.weekly.nonveg, ...SHOPPING.weekly.veg, ...SHOPPING.monthly].map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  test('ticks toggle and clear without touching the input, and survive a round trip', () => {
    const a = toggleTick({}, 'm-1')
    expect(a).toEqual({ 'm-1': true })
    expect(toggleTick(a, 'm-1')).toEqual({})
    expect(a).toEqual({ 'm-1': true })
    expect(clearTicks({ 'm-1': true, 'wn-1': true }, SHOPPING.monthly)).toEqual({ 'wn-1': true })
    const store = memory()
    writeTicks(a, store)
    expect(readTicks(store)).toEqual(a)
  })
  test('broken or missing storage reads as no ticks', () => {
    const store = memory()
    store.setItem(TICKS_KEY, '{nope')
    expect(readTicks(store)).toEqual({})
    store.setItem(TICKS_KEY, '[1]')
    expect(readTicks(store)).toEqual({})
    const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    expect(readTicks(throwing)).toEqual({})
    expect(() => writeTicks({ a: true }, throwing)).not.toThrow()
  })
})
