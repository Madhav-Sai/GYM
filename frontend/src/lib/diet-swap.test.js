import { describe, expect, test } from 'vitest'
import { proteinSwap, vegItem, altsFor, VEG_ALTS, signed } from './diet-swap.js'
import { foodById } from './diet-foods.js'

describe('protein-matched veg swaps', () => {
  test('150 g chicken (46.5 g protein) is about 89 g dry soya chunks', () => {
    const s = proteinSwap('chicken', 150, 'soya')
    expect(s.from.protein).toBe(46.5)
    expect(s.to.qty).toBe(89)
    expect(s.to.protein).toBeCloseTo(46.3, 1)
    // the honest delta: soya is more kcal for the same protein
    expect(s.delta.kcal).toBe(Math.round((89 * 3.45 - 247.5) * 10) / 10)
    expect(s.delta.kcal).toBeGreaterThan(0)
  })

  test('150 g chicken is about 258 g paneer, some 437 kcal more', () => {
    const s = proteinSwap('chicken', 150, 'paneer')
    expect(s.to.qty).toBe(258)
    expect(s.delta.kcal).toBeCloseTo(436.2, 0)
    expect(Math.abs(s.delta.protein)).toBeLessThan(0.5)
    expect(s.delta.satFat).toBeGreaterThan(30)
  })

  test('every non-veg food has a veg alternative, and every alternative is veg', () => {
    for (const [id, alts] of Object.entries(VEG_ALTS)) {
      expect(foodById(id).veg, id).toBe(false)
      expect(alts.length).toBeGreaterThan(0)
      for (const a of alts) expect(foodById(a).veg, a).toBe(true)
    }
    expect(altsFor('chicken')[0]).toBe('soya')
    expect(altsFor('prawns')).toEqual(['tofu'])
    expect(altsFor('egg')).toEqual(['paneer', 'greek-yogurt'])
    expect(altsFor('mackerel')).toEqual(['paneer', 'tofu'])
  })

  test('vegItem swaps non-veg items, leaves veg ones, and keeps what it replaced', () => {
    const v = vegItem({ foodId: 'egg', qty: 150, key: 'pre:2' })
    expect(v.foodId).toBe('paneer')
    expect(v.qty).toBe(108)   // 19.5 g protein / 0.18
    expect(v.swappedFrom).toEqual({ foodId: 'egg', qty: 150 })
    expect(v.key).toBe('pre:2')
    expect(vegItem({ foodId: 'egg', qty: 150 }, 'greek-yogurt').qty).toBe(195)
    const dal = { foodId: 'toor', qty: 100 }
    expect(vegItem(dal)).toBe(dal)
  })

  test('nothing to swap is null, and deltas print with a sign', () => {
    expect(proteinSwap('chicken', 150, 'mustard-oil')).toBeNull()
    expect(proteinSwap('nope', 150, 'soya')).toBeNull()
    expect(signed(61)).toBe('+61')
    expect(signed(-3.2)).toBe('-3.2')
    expect(signed(null)).toBe('–')
  })
})
