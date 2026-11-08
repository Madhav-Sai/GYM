import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { DASH, numOrDash, fmtSleep, fmtSteps, zoneLine, BAND_INK } from '../lib/whoop.js'
import { bandOf, pct, trendOf, clockOf, durMin, STEP_GOAL, STRAIN_MAX, ZONE_INK } from '../lib/whoop-view.js'
import Icon from '../components/Icon.jsx'
import './whoop.css'

/* The Whoop dashboard (our addition): everything the server keeps from Whoop, drawn as rings, bars
   and lines in plain SVG. Every missing value is a dash, never a 0 (lib/whoop.js). */

export function Ring({ value, max = 100, ink, size = 96, stroke = 9, big, unit, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const f = pct(value, max)
  return <div className="whd-ring" style={{ width: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hair)" strokeWidth={stroke} />
      {f != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ink} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="whd-arc" />}
    </svg>
    <div className="whd-ring-c">
      <div className="whd-ring-n" style={{ color: f != null ? ink : undefined }}>{big}{f != null && unit && <small>{unit}</small>}</div>
    </div>
    <div className="whd-ring-l">{label}</div>
  </div>
}

/** Bars, oldest left. `ink(v)` colours each bar; `goal` draws a dashed line. */
export function Bars({ values, ink, max, goal, height = 64 }) {
  const n = values.length
  const top = max ?? Math.max(1, goal || 0, ...values.filter(v => v != null))
  const w = 100 / Math.max(n, 1)
  return <svg className="whd-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
    {values.map((v, i) => v == null ? null : <rect key={i} x={i * w + w * 0.15} width={w * 0.7}
      y={height - Math.max(1.5, (v / top) * (height - 2))} height={Math.max(1.5, (v / top) * (height - 2))} rx={Math.min(1.5, w * 0.3)} fill={typeof ink === 'function' ? ink(v) : ink} />)}
    {goal != null && <line x1="0" x2="100" y1={height - (goal / top) * (height - 2)} y2={height - (goal / top) * (height - 2)} stroke="var(--label-3)" strokeDasharray="2 2" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />}
  </svg>
}

/** A line with a soft area under it, gaps where Whoop sent nothing. */
export function Line({ values, ink, height = 64 }) {
  const pts = values.map((v, i) => [i, v]).filter(p => p[1] != null)
  if (pts.length < 2) return <div className="whd-empty">{DASH}</div>
  const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]))
  const span = hi - lo || 1, n = Math.max(values.length - 1, 1)
  const X = i => (i / n) * 100, Y = v => height - 4 - ((v - lo) / span) * (height - 10)
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ')
  const area = `${d} L${X(pts[pts.length - 1][0]).toFixed(2)},${height} L${X(pts[0][0]).toFixed(2)},${height} Z`
  const last = pts[pts.length - 1]
  return <svg className="whd-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
    <path d={area} fill={ink} opacity="0.14" />
    <path d={d} fill="none" stroke={ink} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={X(last[0])} cy={Y(last[1])} r="2.2" fill={ink} vectorEffect="non-scaling-stroke" />
  </svg>
}

function Trend({ now, avg, good = 'up', unit = '' }) {
  const tr = trendOf(now, avg, good)
  if (!tr) return null
  return <span className={'whd-trend ' + tr.tone}>{tr.arrow} {tr.text}{unit}</span>
}

function Tile({ icon, ink, label, value, unit, sub, children }) {
  return <div className="whd-tile">
    <div className="whd-tile-h"><Icon name={icon} style={{ color: ink }} /><span>{label}</span></div>
    <div className="whd-tile-n">{value}{value !== DASH && unit && <small>{unit}</small>}</div>
    {sub && <div className="whd-tile-s">{sub}</div>}
    {children}
  </div>
}

/** The three rings: recovery, day strain, sleep performance. */
export function WhoopRings({ s, size = 96 }) {
  const rec = s?.today?.recovery, cyc = s?.today?.cycle, sl = s?.today?.sleep
  const band = bandOf(rec?.score)
  return <div className="whd-rings">
    <Ring value={rec?.score} ink={band ? BAND_INK[band] : 'var(--grey)'} size={size} big={numOrDash(rec?.score)} unit="%" label={t('Recovery')} />
    <Ring value={cyc?.strain} max={STRAIN_MAX} ink="var(--whd-strain)" size={size} big={numOrDash(cyc?.strain, 1)} label={t('Strain')} />
    <Ring value={sl?.performance} ink="var(--whd-sleep)" size={size} big={numOrDash(sl?.performance)} unit="%" label={t('Sleep')} />
  </div>
}

/** Home: the rings, four vitals and the week's recovery. */
export function WhoopHomeDash({ s, onOpen }) {
  const rec = s?.today?.recovery, sl = s?.today?.sleep
  const week = (s?.days || []).slice(-7)
  return <div className="whd-home" onClick={onOpen} role="button" tabIndex={0}>
    <WhoopRings s={s} size={88} />
    {s?.today?.guidance && <div className="whd-guide" style={{ color: BAND_INK[s.today.guidance.band] }}>{t(s.today.guidance.text)}</div>}
    <div className="whd-mini">
      <div><b>{numOrDash(rec?.hrv)}</b><span>{t('HRV ms')}</span></div>
      <div><b>{numOrDash(rec?.rhr)}</b><span>{t('RHR bpm')}</span></div>
      <div><b>{fmtSleep(sl?.asleepMin)}</b><span>{t('Asleep')}</span></div>
      <div><b>{fmtSteps(s?.steps?.value)}</b><span>{t('Steps')}</span></div>
    </div>
    {week.length > 1 && <div className="whd-week">
      <Bars values={week.map(d => d.recovery)} max={100} ink={v => BAND_INK[bandOf(v)]} height={40} />
      <div className="whd-axis">{week.map(d => <span key={d.day}>{d.day.slice(8)}</span>)}</div>
    </div>}
    {(s?.hrFlags || []).length > 0 && <div className="whd-alert"><Icon name="warning" /> {t('Heart rate went above {0} bpm in the last 14 days.', s.hrFlags[0].ceiling)}</div>}
  </div>
}

const RANGES = [7, 30, 90]

/** The full dashboard on the Whoop page. */
export function WhoopDashboard({ s }) {
  const [range, setRange] = useState(30)
  if (!s?.today) return null
  const rec = s.today.recovery || {}, cyc = s.today.cycle || {}, sl = s.today.sleep || {}, avg = s.avg || {}
  const days = (s.days || []).slice(-range)
  const z = zoneLine(s.zone45)
  const stages = [
    { k: 'deepMin', label: t('Deep'), ink: 'var(--whd-deep)' },
    { k: 'remMin', label: t('REM'), ink: 'var(--whd-rem)' },
    { k: 'lightMin', label: t('Light'), ink: 'var(--whd-light)' },
    { k: 'awakeMin', label: t('Awake'), ink: 'var(--whd-awake)' },
  ]
  const stageTotal = stages.reduce((a, x) => a + (sl[x.k] || 0), 0)
  const zMax = Math.max(s.zone45?.warnAbove || 30, (s.zone45?.minutes || 0)) * 1.15

  return <div className="whd">
    <div className="whd-card whd-hero">
      <div className="whd-day">{rec.day && rec.day !== s.today.day ? t('Recovery from {0}', rec.day) : s.today.day}</div>
      <WhoopRings s={s} size={104} />
      {s.today.guidance && <div className="whd-guide big" style={{ color: BAND_INK[s.today.guidance.band] }}>{t(s.today.guidance.text)}</div>}
      {rec.calibrating && <div className="whd-note">{t('Whoop is still calibrating your recovery.')}</div>}
    </div>

    <div className="whd-h">{t('Vitals')}</div>
    <div className="whd-grid">
      <Tile icon="heart" ink="var(--green)" label={t('HRV')} value={numOrDash(rec.hrv)} unit=" ms"><Trend now={rec.hrv} avg={avg.hrv?.d30} /></Tile>
      <Tile icon="heart" ink="var(--red)" label={t('Resting HR')} value={numOrDash(rec.rhr)} unit=" bpm"><Trend now={rec.rhr} avg={avg.rhr?.d30} good="down" /></Tile>
      <Tile icon="target" ink="var(--blue)" label={t('Blood oxygen')} value={numOrDash(rec.spo2, 1)} unit="%" />
      <Tile icon="sun" ink="var(--orange)" label={t('Skin temp')} value={numOrDash(rec.skinTemp, 1)} unit=" °C" />
      <Tile icon="repeat" ink="var(--teal)" label={t('Respiratory rate')} value={numOrDash(sl.respRate, 1)} unit=" /min" />
      <Tile icon="flame" ink="var(--orange)" label={t('Calories')} value={cyc.kcal != null ? fmtSteps(cyc.kcal) : DASH} unit=" kcal" />
      <Tile icon="gauge" ink="var(--whd-strain)" label={t('Average HR')} value={numOrDash(cyc.avgHr)} unit=" bpm" />
      <Tile icon="bolt" ink={cyc.maxHr > 175 ? 'var(--red)' : 'var(--pink)'} label={t('Max HR')} value={numOrDash(cyc.maxHr)} unit=" bpm" sub={cyc.maxHr > 175 ? t('Above the 175 bpm ceiling') : null} />
    </div>

    <div className="whd-card whd-steps">
      <Ring value={s.steps?.value} max={STEP_GOAL} ink="var(--green)" size={84} stroke={8} big={fmtSteps(s.steps?.value)} label={t('Steps')} />
      <div className="whd-steps-r">
        <div className="whd-kv"><span>{t('Goal')}</span><b>{fmtSteps(STEP_GOAL)}</b></div>
        <div className="whd-kv"><span>{t('7-day average')}</span><b>{fmtSteps(avg.steps?.d7)}</b></div>
        <div className="whd-kv"><span>{t('30-day average')}</span><b>{fmtSteps(avg.steps?.d30)}</b></div>
        <div className="whd-src">{t('Counted by Whoop')}</div>
      </div>
    </div>

    <div className="whd-h">{t('Sleep')}</div>
    <div className="whd-card">
      <div className="whd-sleep-top">
        <div><div className="whd-big">{fmtSleep(sl.asleepMin)}</div><div className="whd-dim">{t('asleep of {0} needed', fmtSleep(sl.neededMin))}</div></div>
        <div className="whd-times">{clockOf(sl.start)} → {clockOf(sl.end)}</div>
      </div>
      {stageTotal > 0 && <>
        <div className="whd-stack">{stages.map(x => sl[x.k] ? <i key={x.k} style={{ flex: sl[x.k], background: x.ink }} /> : null)}</div>
        <div className="whd-legend">{stages.map(x => <span key={x.k}><i style={{ background: x.ink }} />{x.label} {fmtSleep(sl[x.k])}</span>)}</div>
      </>}
      <div className="whd-kvs">
        <div className="whd-kv"><span>{t('Performance')}</span><b>{numOrDash(sl.performance)}%</b></div>
        <div className="whd-kv"><span>{t('Efficiency')}</span><b>{numOrDash(sl.efficiency)}%</b></div>
        <div className="whd-kv"><span>{t('Consistency')}</span><b>{numOrDash(sl.consistency)}%</b></div>
        <div className="whd-kv"><span>{t('In bed')}</span><b>{fmtSleep(sl.inBedMin)}</b></div>
        <div className="whd-kv"><span>{t('Sleep debt')}</span><b>{fmtSleep(sl.debtMin)}</b></div>
        <div className="whd-kv"><span>{t('Disturbances')}</span><b>{numOrDash(sl.disturbances)}</b></div>
      </div>
      {(s.naps || []).length > 0 && <div className="whd-dim">{t('Last nap: {0}', fmtSleep(s.naps[0].asleepMin))}</div>}
    </div>

    <div className="whd-h whd-h-row">{t('Trends')}
      <div className="whd-seg">{RANGES.map(n => <button key={n} type="button" className={n === range ? 'on' : ''} onClick={() => setRange(n)}>{n}d</button>)}</div>
    </div>
    <TrendCard title={t('Recovery')} now={numOrDash(avg.recovery?.[range === 7 ? 'd7' : 'd30'])} unit="% avg">
      <Bars values={days.map(d => d.recovery)} max={100} ink={v => BAND_INK[bandOf(v)]} />
    </TrendCard>
    <TrendCard title={t('HRV')} now={numOrDash(avg.hrv?.[range === 7 ? 'd7' : 'd30'])} unit=" ms avg"><Line values={days.map(d => d.hrv)} ink="var(--green)" /></TrendCard>
    <TrendCard title={t('Resting heart rate')} now={numOrDash(avg.rhr?.[range === 7 ? 'd7' : 'd30'])} unit=" bpm avg"><Line values={days.map(d => d.rhr)} ink="var(--red)" /></TrendCard>
    <TrendCard title={t('Day strain')} now={numOrDash(avg.strain?.[range === 7 ? 'd7' : 'd30'], 1)} unit=" avg"><Bars values={days.map(d => d.strain)} max={STRAIN_MAX} ink="var(--whd-strain)" /></TrendCard>
    <TrendCard title={t('Hours asleep')} now={fmtSleep(avg.sleepMin?.[range === 7 ? 'd7' : 'd30'] != null ? Math.round(avg.sleepMin[range === 7 ? 'd7' : 'd30']) : null)} unit=" avg">
      <Bars values={days.map(d => d.sleepMin)} goal={days.map(d => d.neededMin).filter(v => v != null).slice(-1)[0] ?? null} ink="var(--whd-sleep)" />
    </TrendCard>
    <TrendCard title={t('Steps')} now={fmtSteps(avg.steps?.[range === 7 ? 'd7' : 'd30'])} unit=" avg"><Bars values={days.map(d => d.steps)} goal={STEP_GOAL} ink={v => (v >= STEP_GOAL ? 'var(--green)' : 'var(--teal)')} /></TrendCard>

    <div className="whd-h">{t('Heart-rate zones this week')}</div>
    <div className="whd-card">
      <div className="whd-sleep-top"><div><div className="whd-big" style={{ color: z?.ink }}>{s.zone45?.minutes ?? DASH}<small> min</small></div><div className="whd-dim">{t('Zone 4-5 · target {0}-{1} min, never over {2}', s.zone45?.target?.[0], s.zone45?.target?.[1], s.zone45?.warnAbove)}</div></div></div>
      <div className="whd-budget">
        <i className="tgt" style={{ left: pctStr(s.zone45?.target?.[0], zMax), width: pctStr((s.zone45?.target?.[1] || 0) - (s.zone45?.target?.[0] || 0), zMax) }} />
        <i className="warn" style={{ left: pctStr(s.zone45?.warnAbove, zMax) }} />
        <b style={{ width: pctStr(s.zone45?.minutes, zMax), background: z?.ink }} />
      </div>
      {z && <div className="whd-dim" style={{ color: z.ink }}>{t(z.key, ...z.args)}</div>}
    </div>

    {(s.hrFlags || []).length > 0 && <div className="whd-card whd-alarm">
      <div className="whd-alarm-h"><Icon name="warning" /> {t('Above 175 bpm')}</div>
      {s.hrFlags.map((f, i) => <div key={i} className="whd-kv"><span>{f.day} · {f.sport || t('Workout')}</span><b>{f.maxHr} bpm</b></div>)}
    </div>}

    {(s.workouts || []).length > 0 && <>
      <div className="whd-h">{t('Workouts')}</div>
      <div className="whd-card whd-wos">
        {s.workouts.slice(0, 12).map(w => {
          const zs = w.zonesMin || [], tot = zs.reduce((a, v) => a + (v || 0), 0)
          return <div key={w.id} className="whd-wo">
            <div className="whd-wo-top">
              <div><b className="whd-cap">{w.sport || t('Workout')}</b><div className="whd-dim">{w.day} · {clockOf(w.start)} · {durMin(w.start, w.end) != null ? durMin(w.start, w.end) + ' min' : DASH}</div></div>
              <div className="whd-wo-s"><b style={{ color: 'var(--whd-strain)' }}>{numOrDash(w.strain, 1)}</b><span>{t('strain')}</span></div>
            </div>
            <div className="whd-wo-m">
              <span>{t('avg')} {numOrDash(w.avgHr)}</span>
              <span style={w.maxHr > 175 ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{t('max')} {numOrDash(w.maxHr)} bpm</span>
              <span>{w.kj != null ? Math.round(w.kj / 4.184) + ' kcal' : DASH}</span>
              {w.distanceM != null && <span>{(w.distanceM / 1000).toFixed(2)} km</span>}
            </div>
            {tot > 0 && <div className="whd-stack thin">{zs.map((v, i) => v ? <i key={i} style={{ flex: v, background: ZONE_INK[i] }} title={'Zone ' + i} /> : null)}</div>}
          </div>
        })}
        <div className="whd-legend">{ZONE_INK.map((c, i) => <span key={i}><i style={{ background: c }} />Z{i}</span>)}</div>
      </div>
    </>}

    {s.body && <>
      <div className="whd-h">{t('Body (from Whoop)')}</div>
      <div className="whd-grid">
        <Tile icon="ruler" ink="var(--teal)" label={t('Height')} value={s.body.heightM != null ? Math.round(s.body.heightM * 100) : DASH} unit=" cm" />
        <Tile icon="scale" ink="var(--blue)" label={t('Weight')} value={numOrDash(s.body.weightKg, 1)} unit=" kg" />
        <Tile icon="heart" ink="var(--red)" label={t('Max heart rate')} value={numOrDash(s.body.maxHr)} unit=" bpm" />
      </div>
    </>}
  </div>
}

const pctStr = (v, max) => (typeof v === 'number' && max ? Math.min(100, (v / max) * 100) + '%' : '0%')

function TrendCard({ title, now, unit, children }) {
  return <div className="whd-card whd-tc">
    <div className="whd-tc-h"><span>{title}</span><b>{now}{now !== DASH && <small>{unit}</small>}</b></div>
    {children}
  </div>
}
