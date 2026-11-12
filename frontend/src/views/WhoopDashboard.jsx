import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n.js'
import { DASH, numOrDash, fmtSleep, fmtSteps, zoneLine } from '../lib/whoop.js'
import { fmtAgo } from '../lib/format.js'
import { stepsSourceOf, STEPS_APPLE } from '../lib/steps-source.js'
import {
  bandOf, pct, trendOf, clockOf, durMin, STEP_GOAL, STRAIN_MAX, ZONE_INK, WH, BAND_COLOR,
  dayView, dayStrip, dayParts, shiftDay, fmtDay, seriesOf, windowTo, statsOf, trendArrow, METRICS, metricDetail,
  contributors, stageParts, bedTrack, zoneContrib, chartScale, indexAt, xOf,
} from '../lib/whoop-view.js'
import { useStore } from '../store/useStore.js'
import { hasMyPlan } from '../lib/my-plan.js'
import Icon from '../components/Icon.jsx'
import './whoop.css'

const BAND_INK = BAND_COLOR
const ZINK = { 'var(--red)': WH.red, 'var(--yellow)': WH.yellow, 'var(--green)': WH.green, 'var(--grey)': WH.dim }
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const RANGES = [7, 30, 90]

/* The Whoop dashboard (our addition): everything the server keeps from Whoop, drawn as rings, bars
   and lines in plain SVG. Every missing value is a dash, never a 0 (lib/whoop.js). The rules (which
   day, which scale, which slot is under the finger) are pure helpers in lib/whoop-view.js. */

// ---- motion ---------------------------------------------------------------------------------

const RM = '(prefers-reduced-motion: reduce)'
function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(RM)?.matches)
  useEffect(() => {
    const m = typeof window !== 'undefined' ? window.matchMedia?.(RM) : null
    if (!m?.addEventListener) return undefined
    const f = () => setR(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return r
}

/** Counts 0 → target (ease-out) whenever the target or `key` changes; straight there with reduced motion. */
function useCountUp(target, key, ms = 900) {
  const reduce = useReducedMotion()
  const still = reduce || !isNum(target) || typeof requestAnimationFrame !== 'function'
  const [v, setV] = useState(still ? target : 0)
  useEffect(() => {
    if (still) { setV(target); return undefined }
    let raf = 0, t0 = null
    const step = now => {
      if (t0 == null) t0 = now
      const k = Math.min(1, (now - t0) / ms)
      setV(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    setV(0)
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, key, still, ms])
  return still ? target : v
}

/** A clock that ticks every `ms`, for "updated 3 minutes ago". */
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

// ---- rings ----------------------------------------------------------------------------------

export function Ring({ value, max = 100, ink, size = 96, stroke = 9, dp = 0, fmt, unit, label, animKey, onClick, ariaLabel }) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const f = pct(value, max)
  // Draw from 0 on mount and on every new day: one frame with no transition at 0, then the real share.
  const [drawn, setDrawn] = useState({ f: reduce ? f : 0, still: true })
  useEffect(() => {
    if (reduce || f == null || typeof requestAnimationFrame !== 'function') { setDrawn({ f, still: true }); return undefined }
    setDrawn({ f: 0, still: true })
    let b = 0
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setDrawn({ f, still: false })) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [f, animKey, reduce])
  const shown = useCountUp(isNum(value) ? value : null, animKey)
  const big = fmt ? fmt(shown) : numOrDash(shown, dp)
  const df = drawn.f ?? 0
  const arc = { strokeDasharray: `${c * df} ${c}`, transition: drawn.still ? 'none' : undefined }
  const body = <>
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ overflow: 'visible', height: 'auto', aspectRatio: '1' }}>
      <defs>
        <linearGradient id={'g' + id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={ink} stopOpacity="0.55" /><stop offset="1" stopColor={ink} /></linearGradient>
        <filter id={'f' + id} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      {f != null && <>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ink} strokeOpacity="0.45" strokeWidth={stroke} strokeLinecap="round"
          style={arc} transform={`rotate(-90 ${size / 2} ${size / 2})`} filter={`url(#f${id})`} className="whd-arc" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round"
          style={arc} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="whd-arc" />
      </>}
    </svg>
    <span className="whd-ring-c">
      <span className="whd-ring-n" style={{ color: f != null ? '#fff' : undefined }}>{big}{f != null && unit && <small style={{ color: ink }}>{unit}</small>}</span>
    </span>
    <span className="whd-ring-l" style={{ color: f != null ? ink : undefined }}>{label}</span>
  </>
  // At 320 px three 104 px rings do not fit: each may shrink to a third of the row.
  const box = { width: size, maxWidth: '31%' }
  if (onClick) return <button type="button" className="whd-ring tap" style={box} onClick={onClick} aria-label={ariaLabel}>{body}</button>
  return <div className="whd-ring" style={box}>{body}</div>
}

/** The three rings: recovery, day strain, sleep performance. `v` is a dayView (lib/whoop-view.js). */
function RingsOf({ v, size = 96, animKey, onRing }) {
  const rec = v?.recovery, cyc = v?.cycle, sl = v?.sleep
  const band = bandOf(rec?.score)
  const open = k => (onRing ? () => onRing(k) : undefined)
  const al = (name, val, unit = '') => t('{0}: {1}. Show details', name, val === DASH ? DASH : val + unit)
  return <div className="whd-rings">
    <Ring value={rec?.score} ink={band ? BAND_INK[band] : WH.dim} size={size} unit="%" label={t('Recovery')} animKey={animKey}
      onClick={open('recovery')} ariaLabel={al(t('Recovery'), numOrDash(rec?.score), '%')} />
    <Ring value={cyc?.strain} max={STRAIN_MAX} ink={WH.strain} size={size} dp={1} label={t('Strain')} animKey={animKey}
      onClick={open('strain')} ariaLabel={al(t('Strain'), numOrDash(cyc?.strain, 1))} />
    <Ring value={sl?.performance} ink={WH.sleep} size={size} unit="%" label={t('Sleep')} animKey={animKey}
      onClick={open('sleep')} ariaLabel={al(t('Sleep'), numOrDash(sl?.performance), '%')} />
  </div>
}

/** The rings for what the server calls today (kept for callers that only want the rings). */
export function WhoopRings({ s, size = 96 }) {
  return <RingsOf v={dayView(s, null)} size={size} animKey={s?.today?.day} />
}

// ---- charts ---------------------------------------------------------------------------------

/** A trend chart, bars or a line, with a finger/mouse cursor and a tooltip, axis min/max, an average
 *  line and (with `onPick`) a tap target per day. Vertical scrolling still works (touch-action: pan-y).
 *  `marks` draws a tick per bar (the sleep need), `goal` a dashed line. */
export const Chart = memo(function Chart({
  days, values, kind = 'bar', ink, max, min, goal, marks, height = 72, fmt = v => numOrDash(v), title,
  onPick, selected, showAvg = true, axis = true, animKey, compact,
}) {
  const id = useId().replace(/:/g, '')
  const n = values.length
  const sc = useMemo(() => chartScale(values, { kind, max, min, goal, marks }), [values, kind, max, min, goal, marks])
  const [hover, setHover] = useState(null)
  const box = useRef(null)
  const colorOf = useCallback(v => (typeof ink === 'function' ? ink(v) : ink), [ink])
  const inks = useMemo(() => [...new Set(values.filter(isNum).map(colorOf))], [values, colorOf])
  const geo = useMemo(() => {
    if (kind === 'bar') {
      const w = 100 / Math.max(n, 1)
      return { bars: values.map((v, i) => { if (!isNum(v)) return null; const y = sc.y(v) * height; return { x: i * w + w * 0.16, w: w * 0.68, y: Math.min(y, height - 1.5), h: Math.max(1.5, height - y) } }) }
    }
    const pts = values.map((v, i) => [i, v]).filter(p => isNum(p[1]))
    const X = i => xOf(i, n, 'line') * 100, Y = v => 3 + sc.y(v) * (height - 6)
    // A gap where Whoop sent nothing: a new segment starts after a missing day.
    let d = '', prev = -2
    for (const [i, v] of pts) { d += `${i === prev + 1 ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)} `; prev = i }
    const area = pts.length > 1 ? `M${X(pts[0][0]).toFixed(2)},${height} ` + pts.map(([i, v]) => `L${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ') + ` L${X(pts[pts.length - 1][0]).toFixed(2)},${height} Z` : ''
    return { d: d.trim(), area, pts: pts.length, Y }
  }, [values, kind, n, sc, height])
  const yOf = v => (kind === 'bar' ? sc.y(v) * height : geo.Y(v))

  if (kind === 'line' && geo.pts < 2) return <div className="whd-empty">{DASH}</div>

  const measure = e => { box.current = e.currentTarget.getBoundingClientRect(); return box.current }
  const at = e => { const r = box.current || measure(e); return indexAt((e.clientX - r.left) / r.width, n, kind) }
  const onDown = e => { measure(e); setHover(at(e)) }
  const onMove = e => { if (e.pointerType === 'mouse' || e.buttons) setHover(at(e)) }
  const onLeave = e => { box.current = null; if (e.pointerType === 'mouse') setHover(null) }
  const onCancel = () => { box.current = null; setHover(null) }

  const h = hover != null && hover < n ? hover : null
  const hx = h != null ? xOf(h, n, kind) * 100 : null
  const hv = h != null ? values[h] : null
  const sx = selected != null && selected >= 0 && selected < n ? xOf(selected, n, kind) * 100 : null
  const avgY = showAvg && isNum(sc.avg) ? yOf(sc.avg) : null
  const goalY = isNum(goal) ? yOf(goal) : null

  return <div className={'whd-plot' + (compact ? ' compact' : '')}>
    <div className="whd-plot-area" style={{ height }} onPointerDown={onDown} onPointerMove={onMove} onPointerLeave={onLeave} onPointerCancel={onCancel}
      onClick={onPick ? e => e.stopPropagation() : undefined}>
      <svg key={animKey} className="whd-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
        <defs>
          {inks.map((c, k) => <linearGradient key={k} id={`b${id}${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity="0.25" /></linearGradient>)}
          {kind === 'line' && <linearGradient id={'a' + id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={colorOf(sc.max)} stopOpacity="0.35" /><stop offset="1" stopColor={colorOf(sc.max)} stopOpacity="0" /></linearGradient>}
          <clipPath id={'c' + id}><rect className="whd-reveal" x="0" y="0" width="100" height={height} /></clipPath>
        </defs>
        {[0.25, 0.5, 0.75].map(g => <line key={g} x1="0" x2="100" y1={height * g} y2={height * g} stroke="rgba(255,255,255,0.05)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {sx != null && <rect x={kind === 'bar' ? sx - 50 / n : sx - 1.2} width={kind === 'bar' ? 100 / n : 2.4} y="0" height={height} fill="rgba(255,255,255,0.08)" />}
        {kind === 'bar' && geo.bars.map((b, i) => b && <rect key={i} className={'whd-bar' + (h != null && h !== i ? ' dim' : '') + (h === i ? ' hot' : '')}
          style={{ animationDelay: Math.min(i * 12, 360) + 'ms' }} x={b.x} width={b.w} y={b.y} height={b.h} fill={`url(#b${id}${inks.indexOf(colorOf(values[i]))})`} />)}
        {kind === 'bar' && marks && marks.map((m, i) => isNum(m) && <line key={'m' + i} x1={i * (100 / n) + 100 / n * 0.08} x2={(i + 1) * (100 / n) - 100 / n * 0.08}
          y1={yOf(m)} y2={yOf(m)} stroke="rgba(255,255,255,0.75)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {kind === 'line' && <g clipPath={`url(#c${id})`}>
          <path d={geo.area} fill={`url(#a${id})`} />
          <path d={geo.d} fill="none" stroke={colorOf(sc.max)} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </g>}
        {avgY != null && <line x1="0" x2="100" y1={avgY} y2={avgY} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        {goalY != null && <line x1="0" x2="100" y1={goalY} y2={goalY} stroke="rgba(255,255,255,0.55)" strokeDasharray="4 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {avgY != null && !compact && <span className="whd-avg-l" style={{ top: avgY }}>{t('avg')} {fmt(sc.avg)}</span>}
      {axis && !compact && isNum(sc.max) && <span className="whd-ax top">{fmt(sc.max)}</span>}
      {axis && !compact && isNum(sc.min) && sc.min !== sc.max && <span className="whd-ax bot">{fmt(sc.min)}</span>}
      {h != null && <>
        <span className="whd-cursor" style={{ left: hx + '%' }} />
        {kind === 'line' && isNum(hv) && <span className="whd-dot" style={{ left: hx + '%', top: yOf(hv), background: colorOf(hv) }} />}
        <span className="whd-tip" role="status" style={{ left: Math.max(14, Math.min(86, hx)) + '%' }}>
          <span>{fmtDay(days[h])}</span><b>{fmt(hv, h)}</b>
        </span>
      </>}
      {onPick && <span className="whd-picks">{days.map((d, i) => <button key={d} type="button" tabIndex={compact ? -1 : 0}
        aria-label={t('{0}: {1}', fmtDay(d), fmt(values[i], i)) + (title ? ' (' + title + ')' : '')}
        aria-current={selected === i ? 'date' : undefined}
        onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={e => { e.stopPropagation(); onPick(d) }} />)}</span>}
    </div>
    {axis && !compact && n > 1 && <div className="whd-xax"><span>{fmtDay(days[0], { weekday: false })}</span><span>{fmtDay(days[n - 1], { weekday: false })}</span></div>}
  </div>
})

/** Kept for the Home card and any caller that wants plain bars. */
export function Bars({ values, ink, max, goal, height = 64, days }) {
  const ds = days || values.map((_, i) => String(i))
  return <Chart days={ds} values={values} ink={ink} max={max} goal={goal} height={height} axis={false} showAvg={false} />
}
export function Line({ values, ink, height = 64, days }) {
  const ds = days || values.map((_, i) => String(i))
  return <Chart kind="line" days={ds} values={values} ink={ink} height={height} axis={false} showAvg={false} />
}

// ---- small parts ----------------------------------------------------------------------------

function Trend({ now, avg, good = 'up', unit = '' }) {
  const tr = trendOf(now, avg, good)
  if (!tr) return null
  return <span className={'whd-trend ' + tr.tone}>{tr.arrow} {tr.text}{unit}</span>
}

function Ago({ ts }) {
  const now = useNow(30000)
  if (!ts) return <span>{t('Not synced yet')}</span>
  return <span>{t('Updated {0}', fmtAgo(ts, now))}</span>
}

/** The bar at the top: when it last synced (ticking) and a refresh button that spins while it works. */
function RefreshBar({ syncedAt, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const go = async () => {
    if (busy || !onRefresh) return
    setBusy(true)
    try { await onRefresh() } finally { if (alive.current) setBusy(false) }
  }
  return <div className="whd-top">
    <span className="whd-ago"><i className={'whd-live' + (busy ? ' busy' : '')} />{busy ? t('Syncing with Whoop…') : <Ago ts={syncedAt} />}</span>
    {onRefresh && <button type="button" className={'whd-refresh' + (busy ? ' busy' : '')} onClick={go} disabled={busy} aria-label={t('Sync with Whoop now')}>
      <Icon name="repeat" />
    </button>}
  </div>
}

/** The horizontal day picker: date and a dot in that day's recovery colour. */
function DayStrip({ items, day, onPick }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const box = ref.current
    const el = box?.querySelector('.whd-sd.on')
    if (!box || !el || typeof box.scrollTo !== 'function') return
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' })
  }, [day, reduce])
  return <div className="whd-strip" ref={ref} role="group" aria-label={t('Pick a day')}>
    {items.map(d => {
      const p = dayParts(d.day)
      return <button key={d.day} type="button" className={'whd-sd' + (d.day === day ? ' on' : '')} aria-pressed={d.day === day}
        aria-label={t('{0}, recovery {1}', fmtDay(d.day), d.recovery != null ? d.recovery + '%' : DASH)} onClick={() => onPick(d.day)}>
        <span className="wd">{t(p.wd)}</span><b>{p.dom}</b>
        <i style={d.band ? { background: BAND_INK[d.band], boxShadow: `0 0 6px ${BAND_INK[d.band]}` } : undefined} />
      </button>
    })}
  </div>
}

/** A vitals tile; a tap opens it to the last 14 days with their average and direction. */
function Tile({ icon, ink, label, value, unit, sub, children, open, onToggle, spark }) {
  const head = <>
    <span className="whd-tile-h"><Icon name={icon} style={{ color: ink }} /><span>{label}</span>{onToggle && <Icon name={open ? 'chevronUp' : 'chevronDown'} className="whd-tile-x" />}</span>
    <span className="whd-tile-n">{value}{value !== DASH && unit && <small>{unit}</small>}</span>
    {sub && <span className="whd-tile-s">{sub}</span>}
    {children}
  </>
  if (!onToggle) return <div className="whd-tile">{head}</div>
  return <div className={'whd-tile' + (open ? ' open' : '')}>
    <button type="button" className="whd-tile-b" aria-expanded={!!open} onClick={onToggle}>{head}</button>
    {open && spark}
  </div>
}

function Spark({ days, values, ink, unit, dp = 0, good = 'up', fmt }) {
  const st = statsOf(values), tr = trendArrow(values, good)
  const f = fmt || (v => (isNum(v) ? numOrDash(v, dp) + unit : DASH))
  return <div className="whd-spark">
    <Chart kind="line" days={days} values={values} ink={ink} height={44} fmt={f} compact />
    <div className="whd-spark-m">
      <span>{t('14-day avg')} <b>{f(st.avg)}</b></span>
      {tr ? <span className={'whd-trend ' + tr.tone}>{tr.arrow} {tr.dir > 0 ? t('rising') : tr.dir < 0 ? t('falling') : t('steady')}</span> : <span className="whd-trend flat">{DASH}</span>}
    </div>
  </div>
}

// ---- the metric sheet -----------------------------------------------------------------------

function MetricSheet({ s, metric, day, onClose, onPick }) {
  const closeRef = useRef(null)
  const d = useMemo(() => metricDetail(s, metric, day, 30), [s, metric, day])
  const cons = useMemo(() => (metric === 'recovery' ? contributors(s, day) : []), [s, metric, day])
  useEffect(() => {
    closeRef.current?.focus?.()
    const key = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  if (!d) return null
  const fmt = v => (isNum(v) ? numOrDash(v, d.dp) + d.unit : DASH)
  const ink = metric === 'recovery' ? (v => BAND_INK[bandOf(v)] || WH.dim) : metric === 'strain' ? WH.strain : WH.sleep
  const head = metric === 'recovery' ? (BAND_INK[bandOf(d.value)] || '#fff') : metric === 'strain' ? WH.strain : WH.sleep
  const sel = d.days.indexOf(d.day)
  return <div className="whd-sheet-bg" onClick={onClose}>
    <div className="whd-sheet" role="dialog" aria-modal="true" aria-label={t(d.label)} onClick={e => e.stopPropagation()}>
      <div className="whd-sheet-grab" aria-hidden="true" />
      <div className="whd-sheet-h">
        <div><div className="whd-eyebrow">{fmtDay(d.day)}</div><h3>{t(d.label)}</h3></div>
        <button type="button" ref={closeRef} className="whd-x" onClick={onClose} aria-label={t('Close')}><Icon name="xmark" /></button>
      </div>
      <p className="whd-meaning">{t(d.meaning)}</p>
      <div className="whd-cmp">
        <div><b style={{ color: head }}>{fmt(d.value)}</b><span>{t('This day')}</span></div>
        <div><b>{fmt(d.d7)}</b><span>{t('7-day avg')}</span></div>
        <div><b>{fmt(d.d30)}</b><span>{t('30-day avg')}</span></div>
      </div>
      <div className="whd-kvs">
        <div className="whd-kv"><span>{t('Lowest')}{d.minDay ? ' · ' + fmtDay(d.minDay, { weekday: false }) : ''}</span><b>{fmt(d.min)}</b></div>
        <div className="whd-kv"><span>{t('Highest')}{d.maxDay ? ' · ' + fmtDay(d.maxDay, { weekday: false }) : ''}</span><b>{fmt(d.max)}</b></div>
      </div>
      <div className="whd-sub">{t('Last 30 days')}</div>
      <Chart days={d.days} values={d.values} ink={ink} max={metric === 'strain' ? STRAIN_MAX : 100} fmt={fmt}
        selected={sel} onPick={onPick} title={t(d.label)} height={84} animKey={metric} />
      {cons.length > 0 && <>
        <div className="whd-sub">{t('What fed it (vs your 30-day average)')}</div>
        <div className="whd-cons">{cons.map(c => <div key={c.k} className="whd-con">
          <span className="whd-con-l">{t(c.label)}</span>
          <span className="whd-con-bar" aria-hidden="true">
            <i className="mid" />
            {c.dev != null && <b className={c.tone} style={c.dev >= 0 ? { left: '50%', width: Math.max(c.dev * 50, 1.5) + '%' } : { left: 50 + c.dev * 50 + '%', width: -c.dev * 50 + '%' }} />}
          </span>
          <span className="whd-con-v">{isNum(c.value) ? numOrDash(c.value, c.dp) + c.unit : DASH}<small>{t('avg')} {isNum(c.avg) ? numOrDash(c.avg, c.dp) : DASH}</small></span>
        </div>)}</div>
      </>}
    </div>
  </div>
}

// ---- Home -----------------------------------------------------------------------------------

/** Home: the rings, four vitals and the week's recovery; a tap on a bar opens that day. */
export function WhoopHomeDash({ s, onOpen, onDay }) {
  const v = dayView(s, null)
  const rec = v?.recovery, sl = v?.sleep
  const week = useMemo(() => (s?.days || []).slice(-7), [s])
  const wv = useMemo(() => week.map(d => d.recovery), [week])
  const wd = useMemo(() => week.map(d => d.day), [week])
  const fmtRec = useCallback(x => (isNum(x) ? Math.round(x) + '%' : DASH), [])
  const inkRec = useCallback(x => BAND_INK[bandOf(x)] || WH.dim, [])
  return <div className="whd-home" onClick={onOpen}>
    <RingsOf v={v} size={88} animKey={s?.today?.day} />
    {v?.guidance && <div className="whd-guide" style={{ color: BAND_INK[v.guidance.band] }}>{t(v.guidance.text)}</div>}
    <div className="whd-mini">
      <div><b>{numOrDash(rec?.hrv)}</b><span>{t('HRV ms')}</span></div>
      <div><b>{numOrDash(rec?.rhr)}</b><span>{t('RHR bpm')}</span></div>
      <div><b>{fmtSleep(sl?.asleepMin)}</b><span>{t('Asleep')}</span></div>
      <div><b>{fmtSteps(s?.steps?.value)}</b><span>{stepsSourceOf(s) === STEPS_APPLE ? t('Steps (Apple Health)') : t('Steps')}</span></div>
    </div>
    {week.length > 1 && <div className="whd-week">
      <Chart days={wd} values={wv} max={100} ink={inkRec} height={44} fmt={fmtRec} axis={false} showAvg={false}
        onPick={onDay} title={t('Recovery')} />
      <div className="whd-axis">{week.map(d => <span key={d.day}>{t(dayParts(d.day).wd).slice(0, 2)}</span>)}</div>
    </div>}
    {(s?.hrFlags || []).length > 0 && <div className="whd-alert"><Icon name="warning" /> {t('Heart rate went above {0} bpm in the last 14 days.', s.hrFlags[0].ceiling)}</div>}
  </div>
}

// ---- loading and first sync -----------------------------------------------------------------

/** Grey shapes that shimmer where the dashboard will be, instead of a blank page. */
export function WhoopSkeleton({ compact }) {
  return <div className={'whd whd-skel' + (compact ? ' compact' : '')} aria-busy="true" aria-label={t('Loading Whoop')}>
    {!compact && <div className="whd-strip skel">{Array.from({ length: 8 }, (_, i) => <span key={i} className="sk sk-day" />)}</div>}
    <div className="whd-card whd-hero">
      <div className="whd-rings">{[0, 1, 2].map(i => <span key={i} className={'sk sk-ring' + (compact ? ' sm' : '')} />)}</div>
      <span className="sk sk-line" />
    </div>
    {!compact && <div className="whd-grid">{[0, 1, 2, 3].map(i => <span key={i} className="sk sk-tile" />)}</div>}
  </div>
}

/** Connected, but Whoop has not sent a day yet. */
export function WhoopFirstSync({ onRefresh, syncedAt }) {
  return <div className="whd">
    <div className="whd-card whd-hero whd-first">
      <div className="whd-pulse" aria-hidden="true"><i /><i /><i /><Icon name="heart" /></div>
      <h3>{t('Your Whoop is connected')}</h3>
      <p className="whd-dim">{t('The first sync is pulling your recovery, sleep and strain. It usually takes a minute.')}</p>
    </div>
    <RefreshBar syncedAt={syncedAt} onRefresh={onRefresh} />
  </div>
}

// ---- the dashboard --------------------------------------------------------------------------

const STAGE_FMT = m => fmtSleep(m)

/** The full dashboard on the Whoop page. `initialDay` (YYYY-MM-DD) opens on that day; `onRefresh`
 *  syncs and reloads (the refresh button spins until it settles). */
export function WhoopDashboard({ s, initialDay = null, onRefresh }) {
  const splitSleep = useStore(st => hasMyPlan(st.S))
  const [day, setDay] = useState(initialDay)
  const [range, setRange] = useState(30)
  const [sheet, setSheet] = useState(null)
  const [openTile, setOpenTile] = useState(null)
  const [stage, setStage] = useState(null)
  const [openWo, setOpenWo] = useState(() => new Set())
  const swipe = useRef(null)
  useEffect(() => { if (initialDay) setDay(initialDay) }, [initialDay])

  const strip = useMemo(() => dayStrip(s, 30), [s])
  const v0 = useMemo(() => dayView(s, day), [s, day])
  const v = v0 || dayView(s, null)
  const selDay = v?.day
  const isToday = !v || v.isToday
  const days = useMemo(() => (s?.days || []).slice(-range), [s, range])
  const dayKeys = useMemo(() => days.map(d => d.day), [days])
  const series = useMemo(() => ({
    recovery: seriesOf(days, 'recovery'), hrv: seriesOf(days, 'hrv'), rhr: seriesOf(days, 'rhr'),
    strain: seriesOf(days, 'strain'), sleepMin: seriesOf(days, 'sleepMin'), steps: seriesOf(days, 'steps'),
  }), [days])
  const need = useMemo(() => (s?.days || []).map(d => d.neededMin).filter(isNum).slice(-1)[0] ?? null, [s])
  const last14 = useMemo(() => windowTo(s?.days || [], selDay, 14), [s, selDay])
  const sleep14 = useMemo(() => ({ days: last14.map(d => d.day), slept: seriesOf(last14, 'sleepMin'), need: seriesOf(last14, 'neededMin') }), [last14])
  const track = useMemo(() => bedTrack(s, selDay, 7), [s, selDay])
  const contrib = useMemo(() => zoneContrib(s), [s])
  const pick = useCallback(d => { setDay(d); setStage(null) }, [])
  const go = dir => { const d = shiftDay(s, selDay, dir); if (d) pick(d) }
  const closeSheet = useCallback(() => setSheet(null), [])
  const pickFromSheet = useCallback(d => { setDay(d) }, [])
  const fmtRec = useCallback(x => (isNum(x) ? Math.round(x) + '%' : DASH), [])
  const inkRec = useCallback(x => BAND_INK[bandOf(x)] || WH.dim, [])
  const inkSteps = useCallback(x => (x >= STEP_GOAL ? WH.steps : '#3FA9F5'), [])

  if (!s?.today) return null
  const rec = v.recovery || {}, cyc = v.cycle || {}, sl = v.sleep || {}, avg = s.avg || {}
  const z = zoneLine(s.zone45)
  const parts = stageParts(sl)
  const stageTotal = parts.reduce((a, x) => a + (x.min || 0), 0)
  const zMax = Math.max(s.zone45?.warnAbove || 30, (s.zone45?.minutes || 0)) * 1.15
  const selIdx = dayKeys.indexOf(selDay)
  const a = k => avg[k]?.[range === 7 ? 'd7' : 'd30']
  const hasTrack = track.some(r => r.from != null)
  const stageOn = parts.find(x => x.k === stage)
  const zInk = ZINK[z?.ink] || WH.dim

  const vital = (k, icon, ink, value, unit, extra = {}) => {
    const m = METRICS[k]
    const fmt = x => (isNum(x) ? (k === 'kcal' ? fmtSteps(x) : numOrDash(x, m.dp)) + m.unit : DASH)
    return <Tile key={k} icon={icon} ink={ink} label={t(m.label)} value={value} unit={unit} sub={extra.sub} open={openTile === k}
      onToggle={() => setOpenTile(openTile === k ? null : k)}
      spark={<Spark days={last14.map(d => d.day)} values={seriesOf(last14, k)} ink={ink} unit={m.unit} dp={m.dp} good={m.good === 'none' ? 'none' : m.good} fmt={fmt} />}>
      {extra.children}
    </Tile>
  }

  const onHeroDown = e => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onHeroUp = e => {
    const st = swipe.current; swipe.current = null
    if (!st) return
    const dx = e.clientX - st.x, dy = e.clientY - st.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }

  return <div className="whd">
    <RefreshBar syncedAt={s.syncedAt} onRefresh={onRefresh} />
    <DayStrip items={strip} day={selDay} onPick={pick} />

    <div className="whd-card whd-hero" onPointerDown={onHeroDown} onPointerUp={onHeroUp} onPointerCancel={() => { swipe.current = null }}>
      <div className="whd-hero-nav">
        <button type="button" className="whd-nav" onClick={() => go(-1)} disabled={!shiftDay(s, selDay, -1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <div className="whd-day">
          <span>{isToday ? (rec.day && rec.day !== s.today.day ? t('Recovery from {0}', fmtDay(rec.day)) : t('Today')) : fmtDay(selDay)}</span>
          {!isToday && <button type="button" className="whd-chip" onClick={() => pick(null)}>{t('Back to today')}</button>}
        </div>
        <button type="button" className="whd-nav" onClick={() => go(1)} disabled={!shiftDay(s, selDay, 1)} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
      </div>
      <RingsOf v={v} size={104} animKey={selDay} onRing={setSheet} />
      {v.guidance && <div className="whd-guide big" style={{ color: BAND_INK[v.guidance.band] }}>{t(v.guidance.text)}</div>}
      {isToday && rec.calibrating && <div className="whd-note">{t('Whoop is still calibrating your recovery.')}</div>}
      <div className="whd-hint">{t('Tap a ring for details. Swipe to change the day.')}</div>
    </div>

    <div className="whd-h">{t('Vitals')}</div>
    <div className="whd-grid">
      {vital('hrv', 'heart', WH.hrv, numOrDash(rec.hrv), ' ms', { children: <Trend now={rec.hrv} avg={avg.hrv?.d30} /> })}
      {vital('rhr', 'heart', WH.rhr, numOrDash(rec.rhr), ' bpm', { children: <Trend now={rec.rhr} avg={avg.rhr?.d30} good="down" /> })}
      {vital('spo2', 'target', '#5AC8FA', numOrDash(rec.spo2, 1), '%')}
      {vital('skinTemp', 'sun', '#FF9F0A', numOrDash(rec.skinTemp, 1), ' °C')}
      {vital('respRate', 'repeat', WH.sleep, numOrDash(sl.respRate, 1), ' /min')}
      {vital('kcal', 'flame', '#FF9F0A', cyc.kcal != null ? fmtSteps(cyc.kcal) : DASH, ' kcal')}
      {vital('avgHr', 'gauge', WH.strain, numOrDash(cyc.avgHr), ' bpm')}
      {vital('maxHr', 'bolt', cyc.maxHr > 175 ? WH.red : WH.rhr, numOrDash(cyc.maxHr), ' bpm', { sub: cyc.maxHr > 175 ? t('Above the 175 bpm ceiling') : null })}
    </div>

    <div className="whd-card whd-steps">
      <Ring value={v.steps} max={STEP_GOAL} ink={WH.steps} size={84} stroke={8} fmt={fmtSteps} label={t('Steps')} animKey={selDay} />
      <div className="whd-steps-r">
        <div className="whd-kv"><span>{t('Goal')}</span><b>{fmtSteps(STEP_GOAL)}</b></div>
        <div className="whd-kv"><span>{t('7-day average')}</span><b>{fmtSteps(avg.steps?.d7)}</b></div>
        <div className="whd-kv"><span>{t('30-day average')}</span><b>{fmtSteps(avg.steps?.d30)}</b></div>
        <div className="whd-src">{v.isToday && stepsSourceOf(s) === STEPS_APPLE ? t('Counted by Apple Health') : t('Counted by Whoop')}</div>
      </div>
    </div>

    <div className="whd-h">{t('Sleep')}</div>
    <div className="whd-card">
      <div className="whd-sleep-top">
        <div><div className="whd-big">{fmtSleep(sl.asleepMin)}</div><div className="whd-dim">{t('asleep of {0} needed', fmtSleep(sl.neededMin))}</div></div>
        <div className="whd-times">{clockOf(sl.start)} → {clockOf(sl.end)}</div>
      </div>
      {stageTotal > 0 && <>
        <div className="whd-stack tall" role="group" aria-label={t('Sleep stages')}>
          {parts.map(x => x.min ? <button key={x.k} type="button" className={'whd-stage' + (stage === x.k ? ' on' : '') + (stage && stage !== x.k ? ' dim' : '')}
            style={{ flex: x.min, background: x.ink }} aria-pressed={stage === x.k} aria-label={t('{0}: {1}, {2}% of sleep', t(x.label), STAGE_FMT(x.min), x.pct)}
            onClick={() => setStage(stage === x.k ? null : x.k)} /> : null)}
        </div>
        {stageOn ? <div className="whd-stage-info" role="status">
          <b style={{ color: stageOn.ink }}>{t(stageOn.label)}</b> {STAGE_FMT(stageOn.min)} · {stageOn.pct != null ? t('{0}% of sleep', stageOn.pct) : DASH}
          <div className="whd-dim">{t(stageOn.meaning)}</div>
        </div> : <div className="whd-legend">{parts.map(x => <button key={x.k} type="button" className="whd-leg" onClick={() => x.min && setStage(x.k)}>
          <i style={{ background: x.ink }} />{t(x.label)} {fmtSleep(x.min)}</button>)}</div>}
      </>}
      <div className="whd-kvs">
        <div className="whd-kv"><span>{t('Performance')}</span><b>{numOrDash(sl.performance)}{isNum(sl.performance) && '%'}</b></div>
        <div className="whd-kv"><span>{t('Efficiency')}</span><b>{numOrDash(sl.efficiency)}{isNum(sl.efficiency) && '%'}</b></div>
        <div className="whd-kv"><span>{t('Consistency')}</span><b>{numOrDash(sl.consistency)}{isNum(sl.consistency) && '%'}</b></div>
        <div className="whd-kv"><span>{t('In bed')}</span><b>{fmtSleep(sl.inBedMin)}</b></div>
        <div className="whd-kv"><span>{t('Sleep debt')}</span><b>{fmtSleep(sl.debtMin)}</b></div>
        <div className="whd-kv"><span>{t('Disturbances')}</span><b>{numOrDash(sl.disturbances)}</b></div>
      </div>
      {/* The 6 am plan sleeps in two blocks (lib/my-plan.js, lib/hrv-watch.js). */}
      {splitSleep && <div className="whd-note" data-testid="split-sleep-note">{t("Two sleep blocks: Whoop's sleep consistency will read low. Watch HRV and RHR instead.")}</div>}
      {isToday && (s.naps || []).length > 0 && <div className="whd-dim">{t('Last nap: {0}', fmtSleep(s.naps[0].asleepMin))}</div>}

      {sleep14.days.length > 1 && <>
        <div className="whd-sub">{t('Sleep vs need, 14 days')}</div>
        <Chart days={sleep14.days} values={sleep14.slept} marks={sleep14.need} ink={WH.sleep} height={56} showAvg={false}
          fmt={(x, i) => (isNum(x) ? fmtSleep(x) + (i != null && isNum(sleep14.need[i]) ? ' / ' + fmtSleep(sleep14.need[i]) : '') : DASH)}
          selected={sleep14.days.indexOf(selDay)} onPick={pick} title={t('Sleep vs need')} />
        <div className="whd-legend"><span><i style={{ background: WH.sleep }} />{t('Slept')}</span><span><i className="tick" />{t('Needed')}</span></div>
      </>}

      {hasTrack && <>
        <div className="whd-sub">{t('Bedtime and wake, 7 days')}</div>
        <div className="whd-track">
          {track.map(r => <div key={r.day} className={'whd-tr' + (r.day === selDay ? ' on' : '')}>
            <span className="whd-tr-d">{t(dayParts(r.day).wd)}</span>
            <span className="whd-tr-l" aria-label={t('{0}: bed {1}, up {2}', fmtDay(r.day), r.start || DASH, r.end || DASH)} role="img">
              {r.from != null && r.to != null && <i className="seg" style={{ left: r.from * 100 + '%', width: (r.to - r.from) * 100 + '%' }} />}
              {r.from != null && <i className="dot bed" style={{ left: r.from * 100 + '%' }} />}
              {r.to != null && <i className="dot up" style={{ left: r.to * 100 + '%' }} />}
            </span>
          </div>)}
          <div className="whd-tr whd-tr-ax"><span className="whd-tr-d" /><span className="whd-tr-l">{['18', '00', '06', '12', '18'].map((h, i) => <em key={i} style={{ left: i * 25 + '%' }}>{h}</em>)}</span></div>
        </div>
      </>}
    </div>

    <div className="whd-h whd-h-row">{t('Trends')}
      <div className="whd-seg" role="group" aria-label={t('Range')}>{RANGES.map(n => <button key={n} type="button" className={n === range ? 'on' : ''} aria-pressed={n === range} onClick={() => setRange(n)}>{n}d</button>)}</div>
    </div>
    <TrendCard title={t('Recovery')} now={numOrDash(a('recovery'))} unit="% avg">
      <Chart days={dayKeys} values={series.recovery} max={100} ink={inkRec} fmt={fmtRec} selected={selIdx} onPick={pick} title={t('Recovery')} animKey={range} />
    </TrendCard>
    <TrendCard title={t('HRV')} now={numOrDash(a('hrv'))} unit=" ms avg">
      <Chart kind="line" days={dayKeys} values={series.hrv} ink={WH.hrv} fmt={x => (isNum(x) ? Math.round(x) + ' ms' : DASH)} selected={selIdx} onPick={pick} title={t('HRV')} animKey={range} />
    </TrendCard>
    <TrendCard title={t('Resting heart rate')} now={numOrDash(a('rhr'))} unit=" bpm avg">
      <Chart kind="line" days={dayKeys} values={series.rhr} ink={WH.rhr} fmt={x => (isNum(x) ? Math.round(x) + ' bpm' : DASH)} selected={selIdx} onPick={pick} title={t('Resting heart rate')} animKey={range} />
    </TrendCard>
    <TrendCard title={t('Day strain')} now={numOrDash(a('strain'), 1)} unit=" avg">
      <Chart days={dayKeys} values={series.strain} max={STRAIN_MAX} ink={WH.strain} fmt={x => numOrDash(x, 1)} selected={selIdx} onPick={pick} title={t('Day strain')} animKey={range} />
    </TrendCard>
    <TrendCard title={t('Hours asleep')} now={fmtSleep(isNum(a('sleepMin')) ? Math.round(a('sleepMin')) : null)} unit=" avg">
      <Chart days={dayKeys} values={series.sleepMin} goal={need} ink={WH.sleep} fmt={x => (isNum(x) ? fmtSleep(Math.round(x)) : DASH)} selected={selIdx} onPick={pick} title={t('Hours asleep')} animKey={range} />
    </TrendCard>
    <TrendCard title={t('Steps')} now={fmtSteps(a('steps'))} unit=" avg">
      <Chart days={dayKeys} values={series.steps} goal={STEP_GOAL} ink={inkSteps} fmt={fmtSteps} selected={selIdx} onPick={pick} title={t('Steps')} animKey={range} />
    </TrendCard>

    <div className="whd-h">{t('Heart-rate zones this week')}</div>
    <div className="whd-card">
      <div className="whd-sleep-top"><div><div className="whd-big" style={{ color: ZINK[z?.ink] || '#fff' }}>{s.zone45?.minutes ?? DASH}<small> min</small></div><div className="whd-dim">{t('Zone 4-5 · target {0}-{1} min, never over {2}', s.zone45?.target?.[0] ?? DASH, s.zone45?.target?.[1] ?? DASH, s.zone45?.warnAbove ?? DASH)}</div></div></div>
      <div className="whd-budget">
        <i className="tgt" style={{ left: pctStr(s.zone45?.target?.[0], zMax), width: pctStr((s.zone45?.target?.[1] || 0) - (s.zone45?.target?.[0] || 0), zMax) }} />
        <i className="warn" style={{ left: pctStr(s.zone45?.warnAbove, zMax) }} />
        {contrib.length > 0
          ? <span className="whd-budget-fill" style={{ width: pctStr(contrib.reduce((x, w) => x + w.minutes, 0), zMax) }}>
            {contrib.map((w, i) => <b key={w.id} style={{ flex: w.minutes, background: zInk }} title={`${w.sport || t('Workout')} ${w.minutes} min`}>{w.minutes >= 4 ? i + 1 : ''}</b>)}
          </span>
          : <span className="whd-budget-fill" style={{ width: pctStr(s.zone45?.minutes, zMax) }}><b style={{ flex: 1, background: zInk }} /></span>}
      </div>
      {z && <div className="whd-dim" style={{ color: ZINK[z.ink] }}>{t(z.key, ...z.args)}</div>}
      {contrib.length > 0 && <div className="whd-contrib">
        {contrib.map((w, i) => <div key={w.id} className="whd-kv"><span><i style={{ background: zInk }}>{i + 1}</i><em className="whd-cap">{w.sport || t('Workout')}</em> · {fmtDay(w.day)}</span><b>{w.minutes} min</b></div>)}
      </div>}
    </div>

    {(s.hrFlags || []).length > 0 && <div className="whd-card whd-alarm">
      <div className="whd-alarm-h"><Icon name="warning" /> {t('Above 175 bpm')}</div>
      {s.hrFlags.map((f, i) => <div key={i} className="whd-kv"><span>{fmtDay(f.day)} · {f.sport || t('Workout')}</span><b>{f.maxHr} bpm</b></div>)}
    </div>}

    {(s.workouts || []).length > 0 && <>
      <div className="whd-h">{t('Workouts')}</div>
      <div className="whd-card whd-wos">
        {s.workouts.slice(0, 12).map(w => <Workout key={w.id} w={w} open={openWo.has(w.id)}
          onToggle={() => setOpenWo(prev => { const n = new Set(prev); if (n.has(w.id)) n.delete(w.id); else n.add(w.id); return n })} />)}
        <div className="whd-legend">{ZONE_INK.map((c, i) => <span key={i}><i style={{ background: c }} />Z{i}</span>)}</div>
      </div>
    </>}

    {s.body && <>
      <div className="whd-h">{t('Body (from Whoop)')}</div>
      <div className="whd-grid">
        <Tile icon="ruler" ink="#22D3EE" label={t('Height')} value={s.body.heightM != null ? Math.round(s.body.heightM * 100) : DASH} unit=" cm" />
        <Tile icon="scale" ink="#3FA9F5" label={t('Weight')} value={numOrDash(s.body.weightKg, 1)} unit=" kg" />
        <Tile icon="heart" ink={WH.rhr} label={t('Max heart rate')} value={numOrDash(s.body.maxHr)} unit=" bpm" />
      </div>
    </>}

    {sheet && <MetricSheet s={s} metric={sheet} day={selDay} onClose={closeSheet} onPick={pickFromSheet} />}
  </div>
}

function Workout({ w, open, onToggle }) {
  const zs = w.zonesMin || [], tot = zs.reduce((a, x) => a + (x || 0), 0)
  const zmax = Math.max(1, ...zs.filter(isNum))
  const dur = durMin(w.start, w.end)
  const over = w.maxHr > 175
  return <div className={'whd-wo' + (open ? ' open' : '')}>
    <button type="button" className="whd-wo-b" aria-expanded={open} onClick={onToggle}>
      <span className="whd-wo-top">
        <span><b className="whd-cap">{w.sport || t('Workout')}</b><span className="whd-dim">{fmtDay(w.day)} · {clockOf(w.start)} · {dur != null ? dur + ' min' : DASH}</span></span>
        <span className="whd-wo-s"><b style={{ color: WH.strain }}>{numOrDash(w.strain, 1)}</b><span>{t('strain')}</span></span>
      </span>
      <span className="whd-wo-m">
        <span>{t('avg')} {numOrDash(w.avgHr)}</span>
        <span style={over ? { color: WH.red, fontWeight: 700 } : undefined}>{t('max')} {numOrDash(w.maxHr)} bpm</span>
        <span>{w.kj != null ? Math.round(w.kj / 4.184) + ' kcal' : DASH}</span>
        {w.distanceM != null && <span>{(w.distanceM / 1000).toFixed(2)} km</span>}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="whd-wo-x" />
      </span>
      {tot > 0 && <span className="whd-stack thin">{zs.map((x, i) => x ? <i key={i} style={{ flex: x, background: ZONE_INK[i] }} /> : null)}</span>}
    </button>
    {open && <div className="whd-wo-d">
      {over && <div className="whd-alert"><Icon name="warning" /> {t('Max heart rate {0} bpm, above the 175 bpm ceiling.', w.maxHr)}</div>}
      <div className="whd-zones">{ZONE_INK.map((c, i) => <div key={i} className="whd-zone">
        <span>Z{i}</span>
        <span className="whd-zone-bar"><i style={{ width: isNum(zs[i]) ? (zs[i] / zmax) * 100 + '%' : 0, background: c }} /></span>
        <b>{isNum(zs[i]) ? Math.round(zs[i]) + ' min' : DASH}</b>
      </div>)}</div>
      <div className="whd-kvs">
        <div className="whd-kv"><span>{t('Strain')}</span><b>{numOrDash(w.strain, 1)}</b></div>
        <div className="whd-kv"><span>{t('Duration')}</span><b>{dur != null ? dur + ' min' : DASH}</b></div>
        <div className="whd-kv"><span>{t('Average HR')}</span><b>{isNum(w.avgHr) ? w.avgHr + ' bpm' : DASH}</b></div>
        <div className="whd-kv"><span>{t('Max HR')}</span><b style={over ? { color: WH.red } : undefined}>{isNum(w.maxHr) ? w.maxHr + ' bpm' : DASH}</b></div>
        <div className="whd-kv"><span>{t('Calories')}</span><b>{w.kj != null ? fmtSteps(Math.round(w.kj / 4.184)) + ' kcal' : DASH}</b></div>
        <div className="whd-kv"><span>{t('Distance')}</span><b>{w.distanceM != null ? (w.distanceM / 1000).toFixed(2) + ' km' : DASH}</b></div>
      </div>
    </div>}
  </div>
}

const pctStr = (v, max) => (typeof v === 'number' && max ? Math.min(100, (v / max) * 100) + '%' : '0%')

function TrendCard({ title, now, unit, children }) {
  return <div className="whd-card whd-tc">
    <div className="whd-tc-h"><span>{title}</span><b>{now}{now !== DASH && <small>{unit}</small>}</b></div>
    {children}
  </div>
}
