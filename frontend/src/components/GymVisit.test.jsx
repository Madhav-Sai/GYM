// @vitest-environment happy-dom
// Checking in a missed day from the calendar (this fork): the day sheet's row opens the check-in
// sheet for that day, saving checks it in with its centre, and a future day has no row.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, isoOf } from '../lib/format.js'
import { visitOf, visitOn, checkInDay } from '../lib/gym-visits.js'
import { CheckInCard } from './GymVisit.jsx'
import { streakInfo } from '../lib/streak.js'
import { dayOverrideSheet } from '../sheets.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: '/', state: null, search: '' }) }))

const mounted = []
const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host); mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d) }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: structuredClone(DEF), user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('check in a missed day from the calendar', () => {
  it('the day sheet offers it, and saving checks the day in with its centre', () => {
    const day = daysAgo(2)
    act(() => dayOverrideSheet(day))
    const sheet = renderTop()
    const row = [...sheet.querySelectorAll('.visit-day .item')][0]
    expect(row.textContent).toContain('I was at the gym')
    act(() => row.click())
    const visit = renderTop()
    act(() => {
      const input = visit.querySelector('#visit-centre')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Cult Koramangala')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => [...visit.querySelectorAll('button')].find(b => b.textContent.trim() === 'Check in').click())
    const S = useStore.getState().S
    expect(visitOf(S, day)).toEqual({ on: true, centre: 'Cult Koramangala' })
    expect(streakInfo(S, todayISO()).current).toBeGreaterThan(0)
    // it survives a reload: the stored copy reads the same
    expect(visitOn(JSON.parse(JSON.stringify(S)), day)).toBe(true)
  })
  it('the card\'s "What did you do?" chips check in with a class and name the day\'s Whoop workout', () => {
    const day = checkInDay()
    const S = structuredClone(DEF)
    S.workouts = [{ id: 'whoop-1', d: day, start: 1, end: 2, name: 'Functional fitness', entries: [], prs: [], source: 'whoop', whoop: { id: '1', sport: 'functional fitness' } }]
    useStore.setState({ S })
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host); mounted.push(root)
    act(() => root.render(<CheckInCard />))
    const chips = [...host.querySelectorAll('[data-testid="visit-classes"] button')].map(b => b.textContent)
    expect(chips).toEqual(['Gym floor (my plan)', 'HRX', 'Strength & Conditioning', 'Boxing', 'Dance Fitness', 'Yoga', 'Spin', 'Burn', 'HIIT', 'Other'])
    const chip = name => [...host.querySelectorAll('[data-testid="visit-classes"] button')].find(b => b.textContent === name)
    act(() => chip('HRX').click())
    let st = useStore.getState().S
    expect(visitOf(st, day)).toEqual({ on: true, cls: 'HRX' })
    expect(st.workouts[0].name).toBe('Cult: HRX')
    expect(chip('HRX').getAttribute('aria-pressed')).toBe('true')
    act(() => chip('HRX').click())
    st = useStore.getState().S
    expect(visitOf(st, day)).toEqual({ on: true })
    expect(st.workouts[0].name).toBe('Functional fitness')
    act(() => chip('Other').click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })
  it('a future day has no check-in row', () => {
    const d = new Date(); d.setDate(d.getDate() + 3)
    act(() => dayOverrideSheet(isoOf(d)))
    expect(renderTop().querySelector('.visit-day')).toBeNull()
  })
})
