import { describe, expect, test } from 'vitest'
import { fmtBytes, filterJson, countLeaves, blankFood, foodProblem, foodSaveBody } from './admin-data.js'
import { FOODS } from './diet-foods.js'

describe('data browser helpers', () => {
  test('fmtBytes', () => {
    expect(fmtBytes(812)).toBe('812 B')
    expect(fmtBytes(14540)).toBe('14.2 KB')
    expect(fmtBytes(2 * 1024 * 1024)).toBe('2 MB')
    expect(fmtBytes(null)).toBe('–')
  })
  test('filterJson keeps the path to each match', () => {
    const doc = { users: [{ id: 'u1', name: 'Madhu' }, { id: 'u2', name: 'Plain' }], unit: 'kg', bodyweight: [{ d: '2026-11-01', w: 72.9 }] }
    expect(filterJson(doc, 'madhu')).toEqual({ users: [{ name: 'Madhu' }] })
    expect(filterJson(doc, 'BODY')).toEqual({ bodyweight: doc.bodyweight })
    expect(filterJson(doc, '72.9')).toEqual({ bodyweight: [{ w: 72.9 }] })
    expect(filterJson(doc, 'nothing here')).toBe(undefined)
    expect(filterJson(doc, '  ')).toBe(doc)
  })
  test('countLeaves', () => { expect(countLeaves({ a: [1, 2, { b: 3 }], c: null })).toBe(4) })
})

describe('food form', () => {
  const ids = new Set(FOODS.map(f => f.id))
  test('problems are plain sentences', () => {
    expect(foodProblem(blankFood())).toBe('Give it a name.')
    expect(foodProblem({ ...blankFood(), name: 'Sattu' })).toBe(null)
    expect(foodProblem({ ...blankFood(), name: 'Sattu', per: 0 })).toMatch(/above 0/)
    expect(foodProblem({ ...blankFood(), name: 'Sattu', kcal: -1 })).toMatch(/kcal/)
    expect(foodProblem({ ...blankFood(), name: 'Sattu', vegAlt: 'nope' }, ids)).toMatch(/veg alternative/)
    expect(foodProblem({ ...blankFood(), name: 'Sattu', vegAlt: 'tofu' }, ids)).toBe(null)
  })
  test('an added food is sent whole; a built-in only by what changed', () => {
    expect(foodSaveBody({ ...blankFood(), name: ' Sattu ', note: '' })).toEqual({ food: { ...blankFood(), name: 'Sattu', note: null } })
    const chicken = FOODS.find(f => f.id === 'chicken')
    const body = foodSaveBody({ ...chicken, protein: 30, vegAlt: 'tofu' }, { builtin: true, original: chicken })
    expect(body).toEqual({ builtin: true, food: { id: 'chicken', protein: 30, vegAlt: 'tofu' } })
  })
})
