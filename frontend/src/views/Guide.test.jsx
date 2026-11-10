// @vitest-environment happy-dom
// The Guide (this fork): every screen it opens is a real route in App.jsx, and its buttons go there.
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { PAGES } from './settings-pages.js'

const { navSpy } = vi.hoisted(() => ({ navSpy: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy }))
const { default: Guide, GUIDE_LINKS } = await import('./Guide.jsx')

const app = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8')
const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1])

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  navSpy.mockClear()
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: structuredClone(DEF), user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('the Guide', () => {
  it('links only to routes App.jsx has', () => {
    for (const link of GUIDE_LINKS) {
      if (link.startsWith('/settings/')) {
        expect(routes).toContain('/settings/:page')
        expect(PAGES[link.split('/')[2]], link).toBeTruthy()
      } else expect(routes, link).toContain(link)
    }
    expect(routes).toEqual(expect.arrayContaining(['/schedule', '/guide']))
  })
  it('every button goes to one of those links, or opens the check-in sheet', () => {
    act(() => root.render(<Guide />))
    const buttons = [...host.querySelectorAll('.guide-step button')]
    expect(buttons.length).toBeGreaterThanOrEqual(12)
    const known = GUIDE_LINKS.map(l => new RegExp('^' + l.replace(':id', '[^/]+') + '$'))
    for (const b of buttons) {
      navSpy.mockClear()
      act(() => b.click())
      const to = navSpy.mock.calls.at(-1)?.[0]
      if (b.textContent === 'Check in today') { expect(useUI.getState().sheets.length).toBe(1); continue }
      expect(known.some(re => re.test(to)), `${b.textContent} -> ${to}`).toBe(true)
    }
  })
  it('Load my plan works with routines already there, and New routine opens its editor', () => {
    act(() => root.render(<Guide />))
    const btn = name => [...host.querySelectorAll('button')].find(b => b.textContent === name)
    act(() => btn('Load my plan').click())
    const n = useStore.getState().S.routines.length
    expect(n).toBeGreaterThan(0)
    act(() => btn('Load my plan').click())
    expect(useStore.getState().S.routines.length).toBe(n) // never twice
    act(() => btn('New routine').click())
    const r = useStore.getState().S.routines.at(-1)
    expect(navSpy).toHaveBeenLastCalledWith('/plan/r/' + r.id)
  })
})
