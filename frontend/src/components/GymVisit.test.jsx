// @vitest-environment happy-dom
// Checking in a missed day from the calendar (this fork): the day sheet's row opens the check-in
// sheet for that day, saving checks it in with its centre, and a future day has no row.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, isoOf } from '../lib/format.js'
import { visitOf, visitOn } from '../lib/gym-visits.js'
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
  it('a future day has no check-in row', () => {
    const d = new Date(); d.setDate(d.getDate() + 3)
    act(() => dayOverrideSheet(isoOf(d)))
    expect(renderTop().querySelector('.visit-day')).toBeNull()
  })
})
