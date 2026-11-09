// The Medical screens' small charts, plain SVG (no chart library): a marker's reference bar, a
// trend line with its reference band shaded, the waist against weight chart and a goal's bar.
import { fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { DASH, fmtVal, refBar, targetText } from '../lib/medical.js'

const W = 320

/** The reference band as a strip with a tick where the value sits. */
export function RefBar({ m, ink }) {
  const r = refBar(m)
  if (!r) return null
  const pct = x => Math.max(0, Math.min(100, x * 100)) + '%'
  return <div className="med-refbar" aria-hidden="true">
    <span className="med-refbar-band" style={{ left: pct(r.lo), width: `calc(${pct(r.hi)} - ${pct(r.lo)})` }} />
    <span className="med-refbar-dot" style={{ left: pct(r.value), background: ink }} />
  </div>
}

// One y scale for a set of numbers, padded so a flat line is not glued to an edge.
function scale(values, h, pad = 12) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x))
  let lo = Math.min(...v), hi = Math.max(...v)
  if (!(hi > lo)) { lo -= 1; hi += 1 }
  const span = hi - lo
  lo -= span * 0.12; hi += span * 0.12
  return { lo, hi, y: x => pad + (1 - (x - lo) / (hi - lo)) * (h - pad * 2) }
}
function xScale(points, left = 30, right = 8) {
  const ts = points.map(p => p.t)
  const a = Math.min(...ts), b = Math.max(...ts)
  return x => (b > a ? left + ((x - a) / (b - a)) * (W - left - right) : (left + W - right) / 2)
}

/** A trend across readings with the reference band (lo/hi, either open) shaded behind it. */
export function TrendChart({ points, band = null, color = 'var(--acc)', h = 120, unit = '', label }) {
  if (!points?.length) return <div className="med-chart-empty dim small">{t('No readings yet')}</div>
  const bLo = band?.lo ?? null, bHi = band?.hi ?? null
  const ys = scale([...points.map(p => p.y), ...(bLo != null ? [bLo] : []), ...(bHi != null ? [bHi] : [])], h)
  const x = xScale(points)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${ys.y(p.y).toFixed(1)}`).join('')
  const top = bHi != null ? ys.y(bHi) : 0, bottom = bLo != null ? ys.y(bLo) : h
  return <svg className="med-chart" viewBox={`0 0 ${W} ${h + 16}`} role="img" aria-label={label || t('Trend')}>
    {band && (bLo != null || bHi != null) && <rect x="30" y={Math.max(0, top)} width={W - 38} height={Math.max(0, Math.min(h, bottom) - Math.max(0, top))} className="med-band" />}
    {[ys.lo + (ys.hi - ys.lo) * 0.12, ys.hi - (ys.hi - ys.lo) * 0.12].map((v, i) => <text key={i} x="0" y={ys.y(v) + 4} className="med-axis">{fmtVal(v)}</text>)}
    <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((p, i) => <circle key={i} cx={x(p.t)} cy={ys.y(p.y)} r="3.5" fill={color}><title>{`${fmtDate(p.d, false, true)}: ${fmtVal(p.y)} ${unit}`}</title></circle>)}
    <text x="30" y={h + 14} className="med-axis">{fmtDate(points[0].d, false, true)}</text>
    {points.length > 1 && <text x={W - 8} y={h + 14} textAnchor="end" className="med-axis">{fmtDate(points.at(-1).d, false, true)}</text>}
  </svg>
}

/** Waist (cm) and weight (kg) on one time axis, each on its own scale, so their slopes compare. */
export function WaistWeightChart({ waist, weight, h = 140 }) {
  const all = [...waist, ...weight]
  if (!waist.length || !weight.length) return <div className="med-chart-empty dim small">{t('Log your waist in Body measurements and weigh in to compare.')}</div>
  const x = xScale(all, 8, 8)
  const a = scale(waist.map(p => p.y), h), b = scale(weight.map(p => p.y), h)
  const path = (pts, s) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${s.y(p.y).toFixed(1)}`).join('')
  const ta = Math.min(...all.map(p => p.t)), tb = Math.max(...all.map(p => p.t))
  const day = ms => new Date(ms).toISOString().slice(0, 10)
  return <>
    <svg className="med-chart" viewBox={`0 0 ${W} ${h + 16}`} role="img" aria-label={t('Waist against weight')}>
      <path d={path(weight, b)} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" />
      {weight.map((p, i) => <circle key={'w' + i} cx={x(p.t)} cy={b.y(p.y)} r="2.5" fill="var(--blue)" />)}
      <path d={path(waist, a)} fill="none" stroke="var(--teal)" strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />
      {waist.map((p, i) => <circle key={'c' + i} cx={x(p.t)} cy={a.y(p.y)} r="3" fill="var(--teal)" />)}
      <text x="8" y={h + 14} className="med-axis">{fmtDate(day(ta), false, true)}</text>
      <text x={W - 8} y={h + 14} textAnchor="end" className="med-axis">{fmtDate(day(tb), false, true)}</text>
    </svg>
    <div className="med-legend small dim">
      <span><i style={{ background: 'var(--teal)' }} />{t('Waist')} {fmtVal(waist.at(-1).y)} cm</span>
      <span><i style={{ background: 'var(--blue)' }} />{t('Weight')} {fmtVal(weight.at(-1).y)} kg</span>
    </div>
  </>
}

/** A goal: where it started, where it is, the target band, and the days left. */
export function GoalBar({ goal, prog, compact = false }) {
  const ink = prog.met ? 'var(--green)' : prog.overdue ? 'var(--red)' : 'var(--acc)'
  const pct = prog.pct == null ? 0 : prog.pct * 100
  const unit = goal.unit ? ' ' + goal.unit : ''
  return <div className={'med-goal' + (compact ? ' compact' : '')}>
    <div className="med-goal-top">
      <span className="med-goal-name">{goal.label}</span>
      <span className="med-goal-num"><b>{prog.current == null ? DASH : fmtVal(prog.current)}</b><span className="dim"> / {targetText(goal)}{unit}</span></span>
    </div>
    <div className="med-goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={goal.label}>
      <span style={{ width: pct + '%', background: ink }} />
    </div>
    <div className="med-goal-meta small dim">
      <span>{t('From {0}', fmtVal(goal.start))}</span>
      <span>{prog.met ? t('Reached') : prog.daysLeft == null ? DASH : prog.overdue ? t('{0} days over', -prog.daysLeft) : t('{0} days left', prog.daysLeft)}</span>
    </div>
  </div>
}
