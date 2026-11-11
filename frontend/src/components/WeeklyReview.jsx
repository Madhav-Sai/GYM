// The weekly review (this fork, lib/weekly-review.js): the Home card on Sunday and Monday, and the
// sheet behind it (also opened from Stats → Weekly review) with the week's numbers and one or two
// suggestions, stepping a week back or forward. The synced state is read at once; Whoop, the diet
// log (one GET /api/health/diet per day) and the supplements come from our server as they arrive.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { fmtDateRange, fmtNum } from '../lib/format.js'
import { healthDay } from '../lib/ist.js'
import { DASH, fmtSleep } from '../lib/whoop.js'
import { weeklyReview, reviewDue, reviewWeekStart, stepWeek, daysOfWeek, mondayOf } from '../lib/weekly-review.js'
import { useWhoopSummary } from '../views/WhoopSheets.jsx'
import { useHealthOn, useDietTargets } from '../views/health-data.js'
import { useWhoopOffered } from './SmartDay.jsx'
import Icon from './Icon.jsx'
import CardHead from './CardHead.jsx'
import { Button } from './ui.jsx'
import './weekly-review.css'

/** The diet days and supplements of a week from our server: { dietDays, supplements } (null until known). */
export function useWeekHealth(from, today, enabled) {
  const [h, setH] = useState({ from: null, dietDays: null, supplements: null })
  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    const days = daysOfWeek(from).filter(d => d <= today)
    Promise.all([
      Promise.all(days.map(d => api('/api/health/diet?day=' + encodeURIComponent(d)).then(v => [d, v]).catch(() => null))),
      api('/api/health/supplements').catch(() => null),
    ]).then(([diet, supplements]) => {
      if (!live) return
      const ok = diet.filter(Boolean)
      setH({ from, dietDays: ok.length ? Object.fromEntries(ok) : null, supplements })
    })
    return () => { live = false }
  }, [from, today, enabled])
  return h.from === from ? h : { from, dietDays: null, supplements: null }
}

/** The review of one week with whatever the server has sent so far. */
export function useWeeklyReview(from, { enabled = true } = {}) {
  const S = useStore(s => s.S)
  const today = healthDay()
  const offered = useWhoopOffered()
  const healthOn = useHealthOn()
  const w = useWhoopSummary(enabled && offered)
  const h = useWeekHealth(from, today, enabled && healthOn)
  const prefs = h.dietDays ? Object.values(h.dietDays)[0]?.prefs : null
  const targets = useDietTargets(prefs, 'training')
  return weeklyReview(S, from, today, { whoop: w.data, dietDays: h.dietDays, supplements: h.supplements, proteinTarget: targets.protein })
}

const sign = n => (n > 0 ? '+' + n : String(n))
const pct = n => (Number.isFinite(n) ? Math.round(n) + '%' : DASH)

// Sessions you logged, Whoop's imported workouts left out (shown on their own line).
const logged = r => Math.max(0, r.workouts.sessions - (r.workouts.whoop || 0))

/** The headline tiles, shared by the card and the sheet. */
function tilesOf(r) {
  const out = [
    { id: 'workouts', label: t('Workouts'), value: r.workouts.planned ? `${r.workouts.plannedDone}/${r.workouts.planned}` : fmtNum(r.workouts.sessions) },
    { id: 'prs', label: t('PRs'), value: fmtNum(r.prs.length) },
  ]
  if (r.whoop) out.push({ id: 'recovery', label: t('Recovery'), value: pct(r.whoop.recovery), sub: Number.isFinite(r.whoop.trend) ? sign(r.whoop.trend) : null })
  // Days the protein target was hit out of the days logged; a dash for a week with nothing logged.
  if (r.diet) out.push({ id: 'protein', label: t('Protein'), value: r.diet.hit != null && r.diet.logged ? `${r.diet.hit}/${r.diet.logged}` : DASH })
  else out.push({ id: 'gym', label: t('Gym days'), value: fmtNum(r.gym.gymDays) })
  return out
}

function Tiles({ r }) {
  return <div className="wr-tiles">
    {tilesOf(r).map(x => <div key={x.id} className="wr-tile" data-wr={x.id}>
      <div className="wr-v">{x.value}{x.sub && <small className={x.sub.startsWith('-') ? 'down' : 'up'}> {x.sub}</small>}</div>
      <div className="wr-l">{x.label}</div>
    </div>)}
  </div>
}

function Suggestions({ r }) {
  if (!r.suggestions.length) return null
  return <div className="wr-sugg">
    {r.suggestions.map(s => <div key={s.id} className="wr-sugg-row" data-sugg={s.id}><Icon name="lightbulb" /><span>{t(s.text, ...s.args)}</span></div>)}
  </div>
}

/** Home: the review of the week, on Sunday and Monday, until its × puts it away. */
export function WeeklyReviewHomeCard() {
  const S = useStore(s => s.S)
  const today = healthDay()
  const due = reviewDue(S, today)
  if (!due) return null
  return <WeeklyReviewCardBody from={reviewWeekStart(today)} />
}

function WeeklyReviewCardBody({ from }) {
  const update = useStore(s => s.update)
  const r = useWeeklyReview(from)
  // A week with nothing planned, logged or checked in needs no review.
  if (!r.workouts.sessions && !r.workouts.planned && !r.gym.gymDays) return null
  const dismiss = () => update(s => { s.weeklyReviewSeen = r.key })
  return <div className="card tap-host weekly-review-card" data-testid="weekly-review-card">
    <CardHead icon="chartLine" tint="var(--indigo)" eyebrow={fmtDateRange(r.from, r.to, true)} title={t('Weekly review')}
      open={{ onClick: () => weeklyReviewSheet(r.from), haspopup: 'dialog' }}
      action={<button type="button" className="iconbtn" aria-label={t('Put it away')} onClick={dismiss}><Icon name="xmark" /></button>} />
    <Tiles r={r} />
    <Suggestions r={r} />
  </div>
}

const LIFT_INK = { up: 'var(--green)', down: 'var(--red)', same: 'var(--label-2)', new: 'var(--blue)' }
const LIFT_WORD = { up: () => t('Up'), down: () => t('Down'), same: () => t('Same'), new: () => t('New') }

/** The full review of one week, for the sheet and the render tests. */
export function WeeklyReviewView({ r, unit = 'kg' }) {
  const w = r.whoop, d = r.diet, sp = r.supplements
  const set = s => `${fmtNum(s.w)} ${unit} x ${s.r}`
  return <>
    <Tiles r={r} />
    <Suggestions r={r} />

    <h4 className="sec">{t('Training')}</h4>
    <div className="list">
      <div className="item"><div className="grow"><div className="tt">{t('Workouts')}</div>
        <div className="ss">{r.workouts.planned ? t('{0} of {1} planned days trained', r.workouts.plannedDone, r.workouts.planned) : t('No plan this week')}</div></div>
        <div className="wr-val">{logged(r) === 1 ? t('1 session') : t('{0} sessions', logged(r))}</div></div>
      {/* Whoop workouts (a Cult class, a run) are sessions too, but never a planned day trained. */}
      {r.workouts.whoop > 0 && <div className="item" data-testid="wr-whoop-sessions"><div className="grow"><div className="tt">{t('Whoop and Cult')}</div>
        <div className="ss">{t('Not counted as planned days')}</div></div>
        <div className="wr-val">{r.workouts.whoop === 1 ? t('1 Whoop/Cult session') : t('{0} Whoop/Cult sessions', r.workouts.whoop)}</div></div>}
      <div className="item"><div className="grow"><div className="tt">{t('Gym check-ins')}</div><div className="ss">{r.gym.gymDays === 1 ? t('1 gym day') : t('{0} gym days', r.gym.gymDays)}</div></div>
        <div className="wr-val">{fmtNum(r.gym.checkIns)}</div></div>
      <div className="item"><div className="grow"><div className="tt">{t('PRs')}</div><div className="ss">{r.prs.length ? r.prs.map(p => p.name).join(', ') : t('None this week')}</div></div>
        <div className="wr-val">{fmtNum(r.prs.length)}</div></div>
    </div>

    {r.lifts.length > 0 && <>
      <h4 className="sec">{t('Lifts against last week')}</h4>
      <div className="list" data-testid="wr-lifts">
        {r.lifts.map(l => <div key={l.id} className="item">
          <div className="grow"><div className="tt">{l.name}</div>
            <div className="ss">{set(l.now)}{l.prev ? ' · ' + t('last week {0}', set(l.prev)) : ''}{l.stalled ? ' · ' + t('stalled 2 weeks') : ''}</div></div>
          <div className="wr-val" style={{ color: LIFT_INK[l.status] }}>{LIFT_WORD[l.status]()}</div>
        </div>)}
      </div>
    </>}

    <h4 className="sec">Whoop</h4>
    {w ? <div className="list" data-testid="wr-whoop">
      <div className="item"><div className="grow"><div className="tt">{t('Recovery average')}</div>
        <div className="ss">{Number.isFinite(w.prevRecovery) ? t('Last week {0}', pct(w.prevRecovery)) : t('No week before to compare')}</div></div>
        <div className="wr-val">{pct(w.recovery)}{Number.isFinite(w.trend) && <small className={w.trend < 0 ? 'down' : 'up'}> {sign(w.trend)}</small>}</div></div>
      <div className="item"><div className="grow"><div className="tt">{t('Average sleep')}</div></div><div className="wr-val">{fmtSleep(w.sleepMin)}</div></div>
      <div className="item"><div className="grow"><div className="tt">{t('Zone 4 to 5')}</div><div className="ss">{t('Target {0} to {1} min a week', w.zoneTarget[0], w.zoneTarget[1])}</div></div>
        <div className="wr-val">{w.zone45 == null ? DASH : w.zone45 + ' min'}</div></div>
      <div className="item"><div className="grow"><div className="tt">{t('Over 175 bpm')}</div>
        <div className="ss">{w.hrFlags.length ? w.hrFlags.map(f => `${f.day}: ${f.maxHr} bpm`).join(', ') : t('Never. Good.')}</div></div>
        <div className="wr-val" style={w.hrFlags.length ? { color: 'var(--red)' } : undefined}>{w.hrFlags.length ? <Icon name="warning" /> : <Icon name="check" />}</div></div>
    </div> : <div className="empty small">{t('Connect Whoop to see recovery, sleep and heart-rate zones here.')}</div>}

    <h4 className="sec">{t('Diet and supplements')}</h4>
    <div className="list" data-testid="wr-health">
      <div className="item"><div className="grow"><div className="tt">{t('Protein target hit')}</div>
        <div className="ss">{d?.logged ? t('Average {0} g on {1} logged days, target {2} g', d.avgProtein ?? DASH, d.logged, d.target ?? DASH) : t('No diet log this week')}</div></div>
        <div className="wr-val">{d && d.hit != null && d.logged ? `${d.hit}/${d.logged}` : DASH}</div></div>
      <div className="item"><div className="grow"><div className="tt">{t('Supplements taken')}</div>
        <div className="ss">{sp?.missed?.length ? t('Missed: {0}', sp.missed.map(m => `${m.name} ${m.taken}/${m.due}`).join(', ')) : sp ? t('Nothing missed') : t('Not loaded')}</div></div>
        <div className="wr-val">{sp ? pct(sp.pct) : DASH}</div></div>
      {sp?.d3 && <div className="item"><div className="grow"><div className="tt">D3</div></div>
        <div className="wr-val" style={sp.d3.taken < sp.d3.due ? { color: 'var(--orange)' } : undefined}>{sp.d3.taken}/{sp.d3.due}</div></div>}
    </div>
  </>
}

function WeeklyReviewSheet({ from: from0, close }) {
  const S = useStore(s => s.S)
  const today = healthDay()
  const [from, setFrom] = useState(from0)
  const r = useWeeklyReview(from)
  const atNewest = from >= mondayOf(today)
  return <div className="weekly-review">
    <div className="row between" style={{ marginBottom: 6 }}>
      <button type="button" className="iconbtn" aria-label={t('Previous week')} onClick={() => setFrom(stepWeek(from, -1, today))}><Icon name="chevronLeft" /></button>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: 0 }}>{t('Weekly review')}</h3>
        <div className="small muted">{fmtDateRange(r.from, r.to, true)}{r.current ? ' · ' + t('so far') : ''}</div>
      </div>
      <button type="button" className="iconbtn" aria-label={t('Next week')} disabled={atNewest} onClick={() => setFrom(stepWeek(from, 1, today))}><Icon name="chevronRight" /></button>
    </div>
    <WeeklyReviewView r={r} unit={S.unit} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>
}

/** The review sheet, on the week starting `from` (default: the week the card would show). */
export const weeklyReviewSheet = (from = reviewWeekStart(healthDay())) => useUI.getState().openSheet(close => <WeeklyReviewSheet from={from} close={close} />)
