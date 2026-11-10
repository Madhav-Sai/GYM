import { describe, expect, test } from 'vitest'
import { proteinSwap, vegItem, altsFor, VEG_ALTS, signed } from './diet-swap.js'
import { foodById, mergeFoods, setFoodOverrides, pickableFoods, FOODS } from './diet-foods.js'

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

describe('food database changes', () => {
  test('added, edited and hidden foods merge onto the built-in list', () => {
    const out = mergeFoods(FOODS, {
      added: [{ id: 'x-sattu', name: 'Sattu', unit: 'g', per: 100, kcal: 400, protein: 22, carbs: 60, fat: 6, fiber: 10 }, { id: 'chicken', name: 'Clash', unit: 'g', per: 100 }, { id: 'bad' }],
      edited: { chicken: { protein: 30, vegAlt: 'tofu' } },
      hidden: ['rohu'],
    })
    expect(out.length).toBe(FOODS.length + 1)
    expect(out.find(f => f.id === 'chicken')).toMatchObject({ protein: 30, name: 'Chicken breast cooked', edited: true, builtin: true })
    expect(out.find(f => f.id === 'x-sattu')).toMatchObject({ builtin: false, satFat: null, omega3: null })
    expect(out.find(f => f.id === 'rohu').hidden).toBe(true)
  })
  test('setFoodOverrides: hidden foods still resolve, the pick list leaves them out, vegAlt goes first', () => {
    setFoodOverrides({ edited: { chicken: { vegAlt: 'tofu' } }, hidden: ['rohu'], added: [] })
    expect(foodById('rohu')).not.toBe(null)
    expect(pickableFoods().some(f => f.id === 'rohu')).toBe(false)
    expect(altsFor('chicken')).toEqual(['tofu', 'soya', 'paneer'])
    setFoodOverrides(null)
    expect(altsFor('chicken')).toEqual(['soya', 'paneer'])
    expect(pickableFoods().length).toBe(FOODS.length)
  })
})
