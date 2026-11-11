// @vitest-environment happy-dom
// Stats → Weekly activity: twelve weeks of minutes, Whoop workouts included, and this week's line.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import ActivityWeeksCard, { thisWeekLine } from './ActivityWeeksCard.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const at = (iso, h) => new Date(iso + 'T' + String(h).padStart(2, '0') + ':00:00').getTime()
const S = {
  weekStart: 1,
  workouts: [
    { id: 'a', d: '2026-11-09', start: at('2026-11-09', 10), end: at('2026-11-09', 11), entries: [] },
    { id: 'whoop-b', d: '2026-11-10', start: at('2026-11-10', 18), end: at('2026-11-10', 18) + 45 * 60000, entries: [], source: 'whoop', whoop: { id: 'b', strain: 13 } },
  ],
}

let root, host
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('ActivityWeeksCard', () => {
  it('counts a Whoop workout with no sets in this week', () => {
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<ActivityWeeksCard S={S} today="2026-11-11" />))
    expect(host.querySelector('[data-activity-now]').textContent).toBe('This week: 2 sessions, 105 min, avg strain 13')
    const rows = host.querySelectorAll('.sbar-row')
    expect(rows).toHaveLength(12)
    expect(rows[0].textContent).toContain('105 min')
    expect(rows[0].textContent).toContain('strain 13')
  })

  it('says so when the week is still empty', () => {
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    expect(thisWeekLine({ sessions: 0 })).toBe('This week: no sessions yet.')
    expect(thisWeekLine({ sessions: 1, minutes: 40, avgStrain: null })).toBe('This week: 1 session, 40 min')
  })
})
