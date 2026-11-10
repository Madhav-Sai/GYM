// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import MedicalHub, { MedicalLabs, MedicalInbody } from './Medical.jsx'
import { MedicalHomeCard } from '../components/MedicalHome.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const lab = {
  id: 'lab-1', date: '2026-08-12', lab: 'Orange Health Labs', markers: [
    { key: 'vitd', name: 'Vitamin D (25-OH)', panel: 'Vitamins', value: 11.8, unit: 'ng/mL', ref: { lo: 30, hi: 100, text: '30-100', below: 20 }, flag: 'deficient' },
    { key: 'hdl', name: 'HDL cholesterol', panel: 'Lipid profile', value: 33, unit: 'mg/dL', ref: { lo: 50, hi: null, text: '>50' }, flag: 'low' },
    { key: 'b12', name: 'Vitamin B12', panel: 'Vitamins', value: 389, unit: 'pg/mL', ref: { lo: 187, hi: 883, text: '187-883' }, flag: 'normal' },
    { key: 'urea', name: 'Urea', panel: 'Kidney', value: 17, unit: 'mg/dL', ref: { lo: 19, hi: 43, text: '19-43' }, flag: 'low' },
  ],
}
const DOC = {
  v: 1, profile: { name: 'Madhav', age: 24, heightCm: 172 }, tracked: ['vitd', 'hdl'], labs: [lab],
  inbody: [{ id: 'i1', date: '2026-10-02', weight: 72.9, bodyFatPct: 30.5, skeletalMuscle: 28.4, visceralFat: 10, whr: 1.03, score: 63, bmr: 1465,
    segmental: { la: { kg: 3.03, flag: 'normal' }, ra: { kg: 2.99, flag: 'normal' }, trunk: { kg: 24.8, flag: 'normal' }, ll: { kg: 7.93, flag: 'under' }, rl: { kg: 7.92, flag: 'under' } },
    targets: { weight: 65, fatControl: -12.5, muscleControl: 4.6 } }],
  goals: [{ id: 'g-vitd', key: 'lab:vitd', label: 'Vitamin D', unit: 'ng/mL', start: 11.8, lo: 30, hi: null, by: '2099-12-25' }],
}

const draw = async el => {
  const d = document.createElement('div'); document.body.appendChild(d)
  const r = createRoot(d)
  await act(async () => r.render(<MemoryRouter>{el}</MemoryRouter>))
  await act(async () => { await new Promise(res => setTimeout(res, 0)) })
  return d
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => DOC })))
  useStore.setState({ user: { id: 'u', name: 'Madhav' } })
})
afterEach(() => { vi.unstubAllGlobals(); useStore.setState({ user: null }); document.body.innerHTML = '' })

describe('Medical screens', () => {
  it('Labs: tracked markers as cards on top, the other panels folded', async () => {
    const d = await draw(<MedicalLabs />)
    const cards = d.querySelectorAll('.med-card')
    expect(cards.length).toBe(2)
    expect(cards[0].textContent).toContain('11.8')
    expect(cards[0].textContent).toContain('Deficient')
    expect(d.querySelectorAll('.med-refbar').length).toBe(2)
    const panels = [...d.querySelectorAll('.med-panel-h')]
    expect(panels.map(p => p.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
    expect(d.textContent).not.toContain('389')
    await act(async () => panels[0].click())
    expect(d.textContent).toContain('389')
  })
  it('InBody: the sheet with segmental flags and targets, and the trend charts', async () => {
    const d = await draw(<MedicalInbody />)
    expect(d.textContent).toContain('72.9')
    expect(d.textContent).toContain('Under')
    expect(d.textContent).toContain('-12.5')
    expect(d.textContent).toContain('+4.6')
    expect(d.querySelectorAll('svg.med-chart').length).toBeGreaterThan(2)
  })
  it('the hub and the Home card show the goal bars and the retest flag', async () => {
    const d = await draw(<><MedicalHub /><MedicalHomeCard /></>)
    expect(d.querySelectorAll('.med-goal').length).toBe(2)
    expect(d.textContent).toContain('Retest: vitamin D + lipid profile + InBody (not the full panel)')
    expect(d.textContent).toContain('days left')
  })
  it('signed out: no request and no Home card', async () => {
    useStore.setState({ user: null })
    const d = await draw(<MedicalHomeCard />)
    expect(d.textContent).toBe('')
  })
})
