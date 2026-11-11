import { describe, it, expect } from 'vitest'
import { pickSteps, needsStepsFallback, withStepsFallback, stepsSourceOf, stepsSourceLabel, todayWindow, STEPS_APPLE, STEPS_WHOOP } from './steps-source.js'
import { whoopWidgetBlock } from './widgets.js'

const summary = steps => ({ connected: true, today: { day: '2026-11-11' }, steps })

describe('pickSteps', () => {
  it('takes Whoop when it has a count, zero included', () => {
    expect(pickSteps(5400, 9000)).toEqual({ value: 5400, source: STEPS_WHOOP })
    expect(pickSteps(0, 9000)).toEqual({ value: 0, source: STEPS_WHOOP })
  })
  it('falls back to Apple Health when Whoop has none, rounded', () => {
    expect(pickSteps(null, 8123.6)).toEqual({ value: 8124, source: STEPS_APPLE })
    expect(pickSteps(undefined, 0)).toEqual({ value: 0, source: STEPS_APPLE })
  })
  it('is nothing when neither has a count', () => {
    expect(pickSteps(null, null)).toEqual({ value: null, source: null })
    expect(pickSteps(null, NaN)).toEqual({ value: null, source: null })
    expect(pickSteps(null, -3)).toEqual({ value: null, source: null })
  })
})

describe('withStepsFallback', () => {
  it('asks only for a connected summary with a today and no step count', () => {
    expect(needsStepsFallback(summary({ value: null, source: 'whoop' }))).toBe(true)
    expect(needsStepsFallback(summary(null))).toBe(true)
    expect(needsStepsFallback(summary({ value: 4000, source: 'whoop' }))).toBe(false)
    expect(needsStepsFallback({ connected: false, today: {} })).toBe(false)
    expect(needsStepsFallback({ connected: true, today: null })).toBe(false)
    expect(needsStepsFallback(null)).toBe(false)
  })
  it('puts Apple Health in when Whoop has nothing, and marks it', () => {
    const s = summary({ value: null, day: '2026-11-11', source: 'whoop' })
    const out = withStepsFallback(s, 7000, '2026-11-11')
    expect(out.steps).toEqual({ value: 7000, day: '2026-11-11', source: STEPS_APPLE })
    expect(stepsSourceOf(out)).toBe(STEPS_APPLE)
    expect(s.steps.value).toBe(null)   // the summary itself is left alone
  })
  it('leaves the summary as it is otherwise (the same object)', () => {
    const whoop = summary({ value: 4000, source: 'whoop' })
    expect(withStepsFallback(whoop, 7000)).toBe(whoop)
    const none = summary({ value: null })
    expect(withStepsFallback(none, null)).toBe(none)
    expect(stepsSourceOf(none)).toBe(null)
  })
})

describe('labels and the widget block', () => {
  it('names the source', () => {
    expect(stepsSourceLabel(STEPS_APPLE)).toBe('Apple Health')
    expect(stepsSourceLabel(STEPS_WHOOP)).toBe('Whoop')
    expect(stepsSourceOf(summary({ value: 10, source: 'whoop' }))).toBe(STEPS_WHOOP)
  })
  it('carries stepsSource into the widget block', () => {
    expect(whoopWidgetBlock(summary({ value: 10, source: 'whoop' })).stepsSource).toBe(STEPS_WHOOP)
    expect(whoopWidgetBlock(withStepsFallback(summary({ value: null }), 900, '2026-11-11'))).toMatchObject({ steps: 900, stepsSource: STEPS_APPLE })
    expect(whoopWidgetBlock(summary({ value: null })).stepsSource).toBe(null)
  })
  it('reads from local midnight to now', () => {
    const now = new Date(2026, 10, 11, 15, 30).getTime()
    expect(todayWindow(now)).toEqual({ from: new Date(2026, 10, 11).getTime(), to: now })
  })
})
