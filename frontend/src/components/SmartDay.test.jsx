// @vitest-environment happy-dom
// Smart day (lib/smart-day.js): the banner drawn from a mocked Whoop summary, its three one-tap
// actions, and nothing changed without a tap. Whoop is not configured in the dev stack, so these
// cover what the screenshots cannot.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { healthDay } from '../lib/ist.js'
import { keptOn } from '../lib/smart-day.js'

const { calls, summary } = vi.hoisted(() => ({ calls: [], summary: { current: null } }))
vi.mock('../lib/api.js', () => ({
  api: (path, opts) => {
    calls.push([path, opts?.method || 'GET', opts?.body ? JSON.parse(opts.body) : null])
    if (path === '/api/whoop/summary') return Promise.resolve(summary.current)
    if (path.startsWith('/api/health/diet/day')) return Promise.resolve({ dayType: 'rest', totals: {}, entries: [] })
    if (path.startsWith('/api/health/diet')) return Promise.resolve({ dayType: null, totals: { protein: 0 }, entries: [], prefs: {} })
    return Promise.resolve({})
  },
}))
const { cardioSpy } = vi.hoisted(() => ({ cardioSpy: vi.fn() }))
vi.mock('./MyPlan.jsx', () => ({ cardioPlanSheet: cardioSpy }))

import { SmartDayView, SmartDayBanner } from './SmartDay.jsx'

const band = (b, score) => ({ connected: true, today: { day: healthDay(), recovery: { score }, guidance: { band: b, text: '' } }, days: [], workouts: [] })
const lower = { id: 'r1', name: 'Lower A', planKey: 'lower-a', ex: [{ id: 'squat' }] }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0
  cardioSpy.mockClear()
  useUI.setState({ sheets: [], toastMsg: '' })
  const wd = new Date().getDay()
  useStore.setState({
    S: { ...structuredClone(DEF), routines: [lower], week: { [wd]: 'r1' } },
    user: { id: 'u1', name: 'madhav' },
    config: { integrations: { providers: ['whoop'] } },
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
const buttons = () => [...host.querySelectorAll('button')].map(b => b.textContent.trim())
const press = name => act(() => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === name).click())
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

describe('SmartDayView', () => {
  it('red on a lifting day: three actions, and the text says keep last week', () => {
    const onDietDay = vi.fn(), onKeep = vi.fn(), onCardio = vi.fn()
    act(() => root.render(<SmartDayView summary={band('red', 22)} routines={[lower]} dayType="training" onDietDay={onDietDay} onKeep={onKeep} onCardio={onCardio} />))
    const el = host.querySelector('[data-testid="smart-day"]')
    expect(el.dataset.band).toBe('red')
    expect(el.textContent).toContain('Recovery is red')
    expect(el.textContent).toContain('22%')
    expect(el.textContent).toMatch(/keep last week's weights/)
    expect(buttons()).toEqual(['Switch diet to rest day', 'Do cardio instead', 'Keep my plan'])
    press('Switch diet to rest day'); expect(onDietDay).toHaveBeenCalledWith('rest')
    press('Do cardio instead'); expect(onCardio).toHaveBeenCalledWith('postLift')
    press('Keep my plan'); expect(onKeep).toHaveBeenCalled()
  })
  it('yellow and green: train, one dismiss button', () => {
    act(() => root.render(<SmartDayView summary={band('yellow', 50)} routines={[lower]} dayType="training" />))
    expect(host.textContent).toContain('no new weight')
    expect(buttons()).toEqual(['Keep my plan'])
    act(() => root.render(<SmartDayView summary={band('green', 80)} routines={[lower]} dayType="training" />))
    expect(host.textContent).toContain('try progression')
  })
  it('nothing without a band, when not connected, when kept or switched off', () => {
    act(() => root.render(<SmartDayView summary={{ connected: true, today: { guidance: null } }} routines={[lower]} />))
    expect(host.innerHTML).toBe('')
    act(() => root.render(<SmartDayView summary={{ ...band('red', 10), connected: false }} routines={[lower]} />))
    expect(host.innerHTML).toBe('')
    act(() => root.render(<SmartDayView summary={band('red', 10)} routines={[lower]} kept />))
    expect(host.innerHTML).toBe('')
    act(() => root.render(<SmartDayView summary={band('red', 10)} routines={[lower]} on={false} />))
    expect(host.innerHTML).toBe('')
  })
})

describe('SmartDayBanner', () => {
  it('reads the summary, posts the diet day only on a tap, opens the cardio plan, keeps the day', async () => {
    summary.current = band('red', 20)
    act(() => root.render(<SmartDayBanner />))
    await flush()
    expect(host.querySelector('[data-testid="smart-day"]')).toBeTruthy()
    expect(calls.some(c => c[1] === 'POST')).toBe(false) // nothing changed on its own
    press('Switch diet to rest day')
    await flush()
    const post = calls.find(c => c[1] === 'POST')
    expect(post[0]).toBe('/api/health/diet/day')
    expect(post[2].day).toBe(healthDay())
    expect(['rest', null]).toContain(post[2].dayType) // null when the weekday is a rest day anyway
    press('Do cardio instead')
    expect(cardioSpy).toHaveBeenCalledWith('postLift')
    press('Keep my plan')
    expect(keptOn(useStore.getState().S, healthDay())).toBe(true)
    expect(host.querySelector('[data-testid="smart-day"]')).toBeNull()
  })
  it('switched off in Settings: no request, no banner', async () => {
    summary.current = band('red', 20)
    useStore.getState().update(s => { s.smartDay = false })
    act(() => root.render(<SmartDayBanner />))
    await flush()
    expect(host.innerHTML).toBe('')
    expect(calls).toHaveLength(0)
  })
  it('on the Diet screen the switch goes through the screen\'s own post', async () => {
    summary.current = band('red', 20)
    const onDietDay = vi.fn()
    act(() => root.render(<SmartDayBanner dayType="training" onDietDay={onDietDay} />))
    await flush()
    press('Switch diet to rest day')
    expect(onDietDay).toHaveBeenCalledWith('rest')
    expect(calls.some(c => c[0].startsWith('/api/health/diet'))).toBe(false)
  })
})
