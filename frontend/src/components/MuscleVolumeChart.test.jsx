// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MuscleVolumeChart from './MuscleVolumeChart.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const vol = {
  weeks: ['2026-10-26', '2026-11-02', '2026-11-09'],
  byMuscle: { chest: [100, 0, 300], triceps: [40, 0, 120] },
  totals: { chest: 400, triceps: 160 },
  ranked: ['chest', 'triceps'],
}
const draw = muscles => act(() => root.render(<MuscleVolumeChart vol={vol} muscles={muscles} unit="kg" />))
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('MuscleVolumeChart', () => {
  it('draws a stacked layer per muscle with volume and opens on the latest week', () => {
    draw(['chest', 'triceps'])
    // One hit area per week plus a layer per muscle in the two weeks with volume.
    expect(container.querySelectorAll('g[data-week] rect').length).toBe(3 + 4)
    expect(container.querySelector('[data-week-total]').textContent).toMatch(/420 kg/)
  })

  it('shows the numbers of a tapped week, and a second tap puts them away', () => {
    draw(['chest', 'triceps'])
    const first = container.querySelector('g[data-week="2026-10-26"]')
    click(first)
    expect(container.querySelector('[data-week-total]').textContent).toMatch(/140 kg/)
    expect(container.querySelector('.slegend').textContent).toMatch(/40 kg/)
    click(container.querySelector('g[data-week="2026-10-26"]'))
    expect(container.querySelector('[data-week-total]')).toBeNull()
  })

  it('says so when there is nothing to draw', () => {
    draw([])
    expect(container.textContent).toMatch(/No data yet/)
  })
})
