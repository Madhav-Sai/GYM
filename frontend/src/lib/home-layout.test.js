import { describe, it, expect } from 'vitest'
import { mergeStates, stampEdits } from './sync-merge.js'
import { layoutOf, fullOrder, visibleIds, isShown, moveItem, setHidden, TILE_IDS, CARD_IDS } from './home-layout.js'

describe('Home layout', () => {
  it('defaults to every tile and card, in the default order', () => {
    const l = layoutOf({})
    expect(l.tiles.order).toEqual(TILE_IDS)
    expect(l.cards.order).toEqual(CARD_IDS)
    expect(visibleIds(l, 'cards')).toEqual(CARD_IDS)
  })
  it('drops unknown ids and duplicates, and puts a missing one after its default neighbour', () => {
    expect(fullOrder(['b', 'zz', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
    expect(fullOrder(['c'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    expect(fullOrder('junk', ['a', 'b'])).toEqual(['a', 'b'])
    const l = layoutOf({ homeLayout: { tiles: { order: ['stats', 'workout'], hidden: ['nope', 'diet'] } } })
    expect(l.tiles.order[0]).toBe('stats')
    expect(l.tiles.order.indexOf('history')).toBe(1) // after stats, its default neighbour
    expect(l.tiles.order.indexOf('workout')).toBeLessThan(l.tiles.order.indexOf('checkin'))
    expect(l.tiles.order).toHaveLength(TILE_IDS.length)
    expect(l.tiles.hidden).toEqual(['diet'])
    expect(isShown(l, 'tiles', 'diet')).toBe(false)
  })
  it('moves within a group and stops at the ends', () => {
    const l = layoutOf({})
    const m = moveItem(l, 'cards', 'streak', -1)
    expect(m.cards.order.slice(-2)).toEqual(['streak', 'bodyweight'])
    expect(moveItem(l, 'cards', 'now', -1)).toBe(l)
    expect(moveItem(l, 'cards', 'nope', 1)).toBe(l)
    expect(l.cards.order).toEqual(CARD_IDS) // input untouched
  })
  it('hides and shows, but never every card', () => {
    let l = layoutOf({})
    l = setHidden(l, 'tiles', 'medical', true)
    expect(visibleIds(l, 'tiles')).not.toContain('medical')
    l = setHidden(l, 'tiles', 'medical', false)
    expect(visibleIds(l, 'tiles')).toContain('medical')
    for (const id of CARD_IDS.slice(0, -1)) l = setHidden(l, 'cards', id, true)
    expect(visibleIds(l, 'cards')).toEqual(['streak'])
    expect(setHidden(l, 'cards', 'streak', true)).toBe(l)
    expect(setHidden(l, 'cards', 'nope', true)).toBe(l)
  })
  it('round-trips through the stored form', () => {
    const l = setHidden(moveItem(layoutOf({}), 'tiles', 'guide', -1), 'cards', 'checkin', true)
    expect(layoutOf({ homeLayout: JSON.parse(JSON.stringify(l)) })).toEqual(l)
  })
})

describe('the layout and the timing plan sync as settings', () => {
  const change = (prev, fn, wall) => { const next = JSON.parse(JSON.stringify(prev)); fn(next); stampEdits(prev, next, wall); return next }
  const base = { _ts: 1, workouts: [], homeLayout: null, daySchedule: null }
  it('each one follows the device that changed it last, whichever copy is newer overall', () => {
    const phone = change(base, s => { s.homeLayout = setHidden(layoutOf(s), 'cards', 'checkin', true) }, 100)
    const laptop = change(base, s => { s.daySchedule = { plans: [{ id: 'p', name: 'Morning shift', days: [1], rows: [] }] }; s._ts = 200 }, 200)
    for (const m of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) {
      expect(layoutOf(m).cards.hidden).toEqual(['checkin'])
      expect(m.daySchedule.plans[0].name).toBe('Morning shift')
    }
  })
})
