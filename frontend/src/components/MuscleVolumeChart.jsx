import { useEffect, useState } from 'react'
import { fmtNum, MONTHS } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { weekBreakdown } from '../lib/muscle-volume.js'

// Weekly volume per muscle as stacked bars (Stats → Lifts, our addition): one bar a week, one
// layer per muscle shown, in the order given (the most volume at the bottom). Plain SVG on the
// same 340-wide viewBox as LineChart. A tap on a week picks it and its numbers show under the
// chart; a second tap on it puts the selection away.

const W = 340
export const VOLUME_COLORS = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', 'var(--pink)', 'var(--teal)', 'var(--red)', 'var(--indigo)']
export const colorOf = i => VOLUME_COLORS[i % VOLUME_COLORS.length]

const short = v => (Math.abs(v) >= 10000 ? fmtNum(Math.round(v / 100) / 10) + 'k' : fmtNum(Math.round(v)))
const weekLabel = iso => { const d = new Date(iso + 'T12:00:00'); return d.getDate() + ' ' + t(MONTHS[d.getMonth()]) }

export default function MuscleVolumeChart({ vol, muscles, unit = 'kg', h = 170 }) {
  const n = vol?.weeks?.length || 0
  const [sel, setSel] = useState(n ? n - 1 : null)
  // A new window (another week started, another pick) starts on its latest week again.
  useEffect(() => { setSel(n ? n - 1 : null) }, [n, (muscles || []).join(',')])
  if (!n || !muscles?.length) return <div className="empty small">{t('No data yet')}</div>

  const P = { l: 34, r: 8, t: 10, b: 22 }
  const totals = vol.weeks.map((_, i) => muscles.reduce((a, m) => a + (vol.byMuscle[m]?.[i] || 0), 0))
  const max = Math.max(...totals, 0)
  // Gridlines on a round step, as in LineChart.
  let step = 1
  if (max > 0) {
    const raw = max / 3, pow = Math.pow(10, Math.floor(Math.log10(raw)))
    step = 10 * pow
    for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * pow) { step = k * pow; break }
  }
  const top = max > 0 ? Math.ceil(max / step) * step : 1
  const plotH = h - P.t - P.b
  const Y = v => P.t + plotH * (1 - v / top)
  const slot = (W - P.l - P.r) / n
  const bw = Math.min(26, slot * 0.62)
  const X = i => P.l + slot * i + (slot - bw) / 2

  const grid = []
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = Y(v)
    grid.push(<g key={'g' + v}>
      <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="var(--sep-op)" strokeWidth="1" />
      <text x={P.l - 5} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--label-2)">{short(v)}</text>
    </g>)
  }
  const pick = i => setSel(s => (s === i ? null : i))
  const info = sel != null ? weekBreakdown(vol, sel, muscles) : null

  return <div data-muscle-volume-chart>
    <div className="chart-i">
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${h}` }} role="img"
        aria-label={t('Volume by muscle')}>
        {grid}
        {vol.weeks.map((wk, i) => {
          let acc = 0
          const layers = muscles.map((m, k) => {
            const v = vol.byMuscle[m]?.[i] || 0
            if (!(v > 0)) return null
            const y0 = Y(acc), y1 = Y(acc + v)
            acc += v
            return <rect key={m} x={X(i)} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={colorOf(k)}
              opacity={sel == null || sel === i ? 1 : 0.35} />
          })
          return <g key={wk} data-week={wk} style={{ cursor: 'pointer' }} onClick={() => pick(i)}>
            <rect x={P.l + slot * i} y={P.t} width={slot} height={plotH} fill="transparent" />
            {layers}
            {(i % (n > 6 ? 2 : 1) === (n - 1) % (n > 6 ? 2 : 1)) &&
              <text x={X(i) + bw / 2} y={h - 7} textAnchor="middle" fontSize="9.5" fill={sel === i ? 'var(--label)' : 'var(--label-2)'}>{weekLabel(wk)}</text>}
          </g>
        })}
      </svg>
    </div>
    <ul className="slegend">
      {muscles.map((m, k) => {
        const v = info ? info.rows[k].v : null
        return <li key={m}>
          <span className="slegend-m fill" style={{ '--m': colorOf(k) }} aria-hidden="true" />
          <span className="slegend-l">{t(MUSCLE_NAME[m] || m)}</span>
          {v != null && <span className="slegend-v">{fmtNum(Math.round(v))} {unit}</span>}
        </li>
      })}
    </ul>
    {info && <div className="small dim" data-week-total>
      {t('Week of {0}', weekLabel(info.week))} · {t('Total')} <b>{fmtNum(Math.round(info.total))} {unit}</b>
    </div>}
  </div>
}
