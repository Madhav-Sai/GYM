// The owner's plan and the Whoop pieces of a workout (our addition). The rules live in lib/:
// my-plan.js (the routines and the week), cardio-plans.js (the treadmill tables), whoop-match.js
// (which Whoop workout a session was). This file only draws them.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO } from '../lib/demo.js'
import { isOn } from '../lib/modules.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { fmtSpeed, speedUnitOf } from '../lib/speed.js'
import { BAND_INK } from '../lib/whoop.js'
import { useNavigate } from 'react-router-dom'
import { applyMyPlan, hasMyPlan, myPlanLoadedOn, myPlanOutdated, upgradeMyPlan, isPlanLiftDay } from '../lib/my-plan.js'
import { cardioPlan, cardioForRoutine, planWeek, HR_CEILING, FOURTH_ROUND_WEEK, INTERVAL_ROUNDS_MAX } from '../lib/cardio-plans.js'
import { sundayChecklist, showSundayChecklist, toggleSundayCheck } from '../lib/sunday-checklist.js'
import { matchWhoopWorkout, whoopMatchView } from '../lib/whoop-match.js'
import { useWhoopSummary } from '../views/WhoopSheets.jsx'
import Icon from './Icon.jsx'
import CardHead from './CardHead.jsx'
import { Button } from './ui.jsx'

const ui = () => useUI.getState()

/** Loads the plan (lib/my-plan.js applyMyPlan). Safe to tap twice: nothing is added the second time. */
export function loadMyPlan() {
  useStore.getState().update(s => { applyMyPlan(s, todayISO()) })
  ui().toast(t('{0} loaded', t('My plan')))
}

/** Brings a plan loaded before the 6 am version up to it (lib/my-plan.js upgradeMyPlan): adds, never changes a weight. */
export function updateMyPlan() {
  useStore.getState().update(s => { upgradeMyPlan(s) })
  ui().toast(t('Plan updated to the 6 am version'))
}

/** Whether this profile can ask our server for its Whoop numbers (signed in, the server offers Whoop, Integrations on). */
function useWhoopOn() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  return !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations')
}

// Written out as t() literals so check-source-strings sees them; the server sends the same English.
const GUIDANCE = {
  green: () => t('Green. Push for a PR today.'),
  yellow: () => t('Yellow. Hit targets, do not force new weight.'),
  red: () => t("Red. Drop to last week's weight or make it a cardio day."),
}

/** The top of a workout in progress: today's Whoop recovery band and what it means for the session. */
export function RecoveryBanner() {
  const on = useWhoopOn()
  const w = useWhoopSummary(on)
  const g = w.data?.connected ? w.data?.today?.guidance : null
  if (!on || !g || !GUIDANCE[g.band]) return null
  const ink = BAND_INK[g.band]
  return <div className="small" role="status" data-testid="recovery-banner" style={{
    display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px', padding: '8px 12px', borderRadius: 12,
    borderInlineStart: `4px solid ${ink}`, background: `color-mix(in srgb, ${ink} 14%, transparent)`, fontWeight: 600
  }}>
    <Icon name="heart" style={{ color: ink, flex: 'none' }} />
    <span>{GUIDANCE[g.band]()}</span>
  </div>
}

const PLAN_NAME = {
  steady: () => t('Steady cardio'),
  intervals: () => t('Intervals'),
  postLift: () => t('Treadmill after lifting'),
}
const KIND = {
  warm: () => t('Warm up'),
  hard: () => t('Hard'),
  recover: () => t('Recover'),
  cool: () => t('Cool down'),
}
const hrText = hr => !hr ? null
  : hr.max != null ? t('under {0} bpm', hr.max)
    : hr.at != null ? hr.at + ' bpm'
      : `${hr.lo}-${hr.hi} bpm`

function CardioPlanSheet({ planKey }) {
  const S = useStore(s => s.S)
  const unit = speedUnitOf(S)
  const week = planWeek(myPlanLoadedOn(S), todayISO())
  const plan = cardioPlan(planKey, { week })
  if (!plan) return null
  const speed = s => fmtSpeed(s.speed, unit) + (s.speedTo != null ? ' → ' + fmtSpeed(s.speedTo, unit) : '')
  return <>
    <h3>{t('Treadmill plan')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{PLAN_NAME[planKey]()} · {plan.min} {t('min')}</div>
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, marginBottom: 12,
      background: 'color-mix(in srgb, var(--red) 18%, transparent)', color: 'var(--red)', fontWeight: 700, fontSize: 'var(--fs-headline)' }}>
      <Icon name="warning" /> {t('Never above {0} bpm', HR_CEILING)}
    </div>
    {planKey === 'intervals' && <div className="small dim" style={{ marginBottom: 8 }}>
      {plan.rounds >= INTERVAL_ROUNDS_MAX ? t('Round {0}', INTERVAL_ROUNDS_MAX) + ' ✓' : t('Round 4 unlocks in week {0}.', FOURTH_ROUND_WEEK)}
      {week != null && <> · {t('Week {0}', week)}</>}
    </div>}
    {plan.elliptical && <div className="small dim" style={{ marginBottom: 8 }}>
      {t('Elliptical alternative: level {0} main block, level {1} for the {2} push.', plan.elliptical.level, plan.elliptical.pushLevel, plan.elliptical.pushFrom + '-' + plan.elliptical.pushTo)}
    </div>}
    <div className="list">
      {plan.segments.map(s => {
        const hard = s.kind === 'hard'
        return <div key={s.from} className="item" style={hard ? { boxShadow: 'inset 3px 0 0 var(--red)' } : undefined}>
          <div style={{ minWidth: 64, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.from}-{s.to} {t('min')}</div>
          <div className="grow">
            <div className="tt">{speed(s)} · {fmtNum(s.incline)}%{s.kind && <> · <span style={hard ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{KIND[s.kind]()}</span></>}</div>
            {s.hr && <div className="ss"><Icon name="heart" style={{ fontSize: 'var(--fs-caption)', marginInlineEnd: 4, verticalAlign: '-1px', color: 'var(--red)' }} />{hrText(s.hr)}</div>}
          </div>
        </div>
      })}
    </div>
  </>
}

export const cardioPlanSheet = planKey => ui().openSheet(() => <CardioPlanSheet planKey={planKey} />)

/** A button to the treadmill table of the first plan routine among `routines`, or nothing. */
export function TreadmillPlanButton({ routines, size = 'sm', style }) {
  const key = (routines || []).map(cardioForRoutine).find(Boolean)
  if (!key) return null
  const b = <Button size={size} variant="tinted" icon="figureRun" onClick={() => cardioPlanSheet(key)}>{t('Treadmill plan')}</Button>
  return style ? <div style={style}>{b}</div> : b
}

/** The top of a lifting day of the plan: the 10 minute warm-up the plan asks for before the first set. */
export function WarmupNote({ routines, style }) {
  if (!(routines || []).some(isPlanLiftDay)) return null
  return <div className="card" data-testid="plan-warmup" style={{ padding: '10px 12px', ...style }}>
    <div className="row" style={{ gap: 8, fontWeight: 600, marginBottom: 4 }}><Icon name="flame" style={{ color: 'var(--orange)' }} />{t('Warm-up, 10 min')}</div>
    <div className="small">{t('5 min treadmill walk, 5 km/h, 3% incline')}</div>
    <div className="small">{t('2 min arm circles, leg swings, bodyweight squats')}</div>
    <div className="small">{t('3 min first exercise at 50% of working weight, 10 reps')}</div>
  </div>
}

/** Home and Settings: the one-tap move to the 6 am version, only while the plan is out of date. */
export function UpdateMyPlanCard() {
  const S = useStore(s => s.S)
  if (!myPlanOutdated(S)) return null
  return <div className="card" data-testid="plan-update">
    <CardHead icon="clipboard" tint="var(--orange)" eyebrow={t('My plan')} title={t('A new version of your plan is ready')}
      sub={t('Core work on Tuesday and Friday, a 45 s plank and a 15 minute walk after lifting. Your current weights stay as they are.')} />
    <div style={{ height: 10 }} />
    <Button variant="primary" icon="clipboard" onClick={updateMyPlan}>{t('Update my plan to the 6 am version')}</Button>
  </div>
}

const SUNDAY_LABEL = {
  weigh: () => t('Weigh yourself, empty stomach'),
  waist: () => t('Measure waist at the belly button'),
  d3: () => t('D3 capsule with dinner (first Sunday of the month)'),
  plan: () => t("Plan next week's weights"),
}

/** Home on a Sunday with nothing to train: the rest day's checklist, ticks synced per Sunday. */
export function SundayChecklistCard({ routines }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const nav = useNavigate()
  const today = todayISO()
  if (!hasMyPlan(S) || !showSundayChecklist(today, (routines || []).length)) return null
  const rows = sundayChecklist(S, today)
  return <div className="card" data-testid="sunday-checklist">
    <CardHead icon="moon" tint="var(--indigo)" eyebrow={t('Rest day')} title={t('Sunday checklist')}
      sub={t('{0} of {1} done', rows.filter(r => r.done).length, rows.length)} />
    <div className="list" style={{ marginTop: 8 }}>
      {rows.map(r => <div key={r.id} className="item">
        <button type="button" className="row grow" role="checkbox" aria-checked={r.done} disabled={r.auto}
          style={{ gap: 10, background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'start', cursor: r.auto ? 'default' : 'pointer' }}
          onClick={() => update(s => { toggleSundayCheck(s, today, r.id) })}>
          <Icon name={r.done ? 'checkCircle' : 'dot'} style={{ color: r.done ? 'var(--green)' : 'var(--label-3)', flex: 'none' }} />
          <span className="tt" style={r.done ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>{SUNDAY_LABEL[r.id]()}</span>
        </button>
        {r.id === 'plan' && <Button size="sm" variant="tinted" onClick={() => nav('/plan')}>{t('Plan')}</Button>}
      </div>)}
    </div>
  </div>
}

/** Home: today's treadmill session, when today is a day of the plan. */
export function TodayCardioCard({ routines }) {
  const key = (routines || []).map(cardioForRoutine).find(Boolean)
  if (!key) return null
  return <div className="card tap-host">
    <CardHead icon="figureRun" tint="var(--red)" eyebrow={t('Treadmill plan')} title={PLAN_NAME[key]()}
      sub={t('Never above {0} bpm', HR_CEILING)} open={{ onClick: () => cardioPlanSheet(key), haspopup: 'dialog' }}
      action={<Icon name="chevronRight" className="chev" />} />
  </div>
}

/** Home's welcome card and Settings: the one-tap load, only while the plan is not all there. */
export function LoadMyPlanButton({ variant = 'primary' }) {
  const S = useStore(s => s.S)
  if (hasMyPlan(S)) return null
  return <Button variant={variant} icon="clipboard" onClick={loadMyPlan}>{t('Load my plan')}</Button>
}

/** The session detail: the Whoop workout this session was, when Whoop recorded one at the same time. */
export function WhoopMatchSection({ w }) {
  const on = useWhoopOn()
  const s = useWhoopSummary(on)
  const m = whoopMatchView(on && s.data?.connected ? matchWhoopWorkout(w, s.data.workouts) : null)
  if (!m) return null
  const n = (v, dp = 0) => (v == null ? '–' : fmtNum(dp ? v : Math.round(v)))
  return <div className="row" data-testid="whoop-match" style={{ gap: 14, flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 12px', borderRadius: 12, background: 'var(--surface-2)' }}>
    <span className="row" style={{ gap: 6, fontWeight: 600 }}><Icon name="heart" style={{ color: 'var(--red)' }} />Whoop</span>
    <span className="small"><span className="dim">{t('Strain')}</span> <b>{n(m.strain, 1)}</b></span>
    <span className="small"><span className="dim">{t('Average HR')}</span> <b>{n(m.avgHr)}</b></span>
    <span className="small" style={m.over ? { color: 'var(--red)' } : undefined}><span className={m.over ? undefined : 'dim'}>{t('Max HR')}</span> <b>{n(m.maxHr)}</b>{m.over && ' ⚠'}</span>
  </div>
}
