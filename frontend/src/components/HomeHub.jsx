// Home as a hub (this fork): the "Now" strip from the daily timing plan, the grid of big tiles with
// live numbers, and the Customize Home sheet. Each tile reads the same sources Home's cards already
// use (the synced state, and for Whoop, Diet, Supplements and Medical the same hooks as their cards),
// so nothing new is asked of the server; a value that is not to hand shows a dash.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO } from '../lib/demo.js'
import { isOn } from '../lib/modules.js'
import { todayISO, exCount as exCountText } from '../lib/format.js'
import { effectiveRoutines } from '../lib/history.js'
import { weekTally } from '../lib/queue.js'
import { MOBILE } from '../lib/mobile.js'
import { syncScheduleReminders } from '../lib/schedule-reminders.js'
import { scheduleOf, planDay, whereNow, fmtLeft, KIND_ICON, KIND_TINT } from '../lib/day-schedule.js'
import { layoutOf, visibleIds, moveItem, setHidden } from '../lib/home-layout.js'
import { visitOn, checkInDay } from '../lib/gym-visits.js'
import { healthDay } from '../lib/ist.js'
import { TARGETS, dayTypeOf } from '../lib/diet-plan.js'
import { checklist, pendingCount } from '../lib/supplements.js'
import { nextTests } from '../lib/medical.js'
import { useWhoopSummary } from '../views/WhoopSheets.jsx'
import { useDietDay, useSupplements, useHealthOn } from '../views/health-data.js'
import { useMedical, goalRows } from './MedicalHome.jsx'
import { visitSheet } from './GymVisit.jsx'
import Icon from './Icon.jsx'
import { Button, Switch } from './ui.jsx'
import './hub.css'

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A number that counts up to its value once (or simply shows it with reduced motion). */
export function CountUp({ value, decimals = 0 }) {
  const [shown, setShown] = useState(() => (reduced() || typeof requestAnimationFrame !== 'function' ? value : 0))
  const from = useRef(shown)
  useEffect(() => {
    if (!Number.isFinite(value)) return undefined
    if (reduced() || typeof requestAnimationFrame !== 'function') { setShown(value); return undefined }
    const start = performance.now(), a = from.current, dur = 550
    let raf = 0
    const step = now => {
      const k = Math.min(1, (now - start) / dur)
      const v = a + (value - a) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  if (!Number.isFinite(value)) return <>-</>
  return <>{Number(shown).toFixed(decimals)}</>
}

/** Re-render once a minute, so "now" moves on. */
function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id) }, [])
  return now
}

/** The Now strip: the timing plan's current row and the next one with the time left. Opens /schedule. */
export function NowStrip() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const now = useMinute()
  const w = whereNow(scheduleOf(S), now)
  const cur = w.now
  // The phone's timing-plan reminders are re-queued on each open of Home, as on the Schedule screen.
  useEffect(() => { if (MOBILE) syncScheduleReminders(scheduleOf(useStore.getState().S), planDay()).catch(() => {}) }, [S.daySchedule]) // eslint-disable-line react-hooks/exhaustive-deps
  return <button type="button" className="card now-strip" onClick={() => nav('/schedule')} aria-label={t('Daily timing plan')}>
    <span className="now-dot" style={{ background: cur ? KIND_TINT[cur.kind] : 'var(--label-3)' }}><Icon name={cur ? KIND_ICON[cur.kind] : 'moon'} /></span>
    <span className="now-main">
      <span className="now-eyebrow">{t('Now')} · {w.plan?.name}</span>
      <span className="now-title">{cur ? cur.label || cur.time : t('Before your day starts')}</span>
      {w.next && <span className="now-next">{t('Next')}: {w.next.label} {t('at {0}', w.next.time)}{w.tomorrow ? ' (' + t('tomorrow') + ')' : ''}</span>}
    </span>
    {w.next && <span className="now-left"><b>{fmtLeft(w.minutesLeft)}</b><small>{t('left')}</small></span>}
  </button>
}

function Tile({ id, icon, tint, label, value, sub, onOpen }) {
  return <button type="button" className="hub-tile" data-tile={id} onClick={onOpen} style={{ '--tile-tint': tint }}>
    <span className="hub-ico"><Icon name={icon} /></span>
    <span className="hub-label">{label}</span>
    <span className="hub-value">{value}</span>
    {sub ? <span className="hub-sub">{sub}</span> : null}
  </button>
}

// The four tiles whose number comes from our server: each one its own component, so its hook only
// runs while the tile is shown.
function WhoopTile({ onOpen }) {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  const offered = !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations')
  const w = useWhoopSummary(offered)
  const rec = w.data?.today?.recovery?.score
  return <Tile id="whoop" icon="heart" tint="var(--red)" label="Whoop" onOpen={onOpen}
    value={Number.isFinite(rec) ? <><CountUp value={rec} />%</> : '-'}
    sub={!offered ? t('Not connected') : w.data?.connected === false ? t('Connect it') : t('Recovery')} />
}
function DietTile({ onOpen }) {
  const on = useHealthOn()
  const day = healthDay()
  const d = useDietDay(day, on)
  const p = d.data?.totals?.protein
  return <Tile id="diet" icon="leaf" tint="var(--green)" label={t('Diet')} onOpen={onOpen}
    value={Number.isFinite(p) ? <><CountUp value={Math.round(p)} /><small> / {TARGETS.protein} g</small></> : '-'}
    sub={on ? t('Protein today') : t('Sign in to track')} />
}
function SuppTile({ onOpen }) {
  const on = useHealthOn()
  const sp = useSupplements(on)
  const day = healthDay()
  const n = sp.data ? pendingCount(checklist(sp.data.list, sp.data.log, day, dayTypeOf(day))) : null
  return <Tile id="supps" icon="pill" tint="var(--purple)" label={t('Supplements')} onOpen={onOpen}
    value={n == null ? '-' : n ? <CountUp value={n} /> : <Icon name="check" />}
    sub={n == null ? t('Sign in to track') : n ? t('to take') : t('All done today')} />
}
function MedicalTile({ onOpen }) {
  const S = useStore(s => s.S)
  const { data } = useMedical()
  let value = '-', sub = t('Goals and blood tests')
  if (data) {
    // A test to book now (or the prominent one, until ticked) before the goals.
    const urgent = nextTests(data.tests, todayISO()).find(x => x.status === 'overdue' || x.status === 'due' || (x.prominent && x.status !== 'done'))
    const rows = goalRows(data, S)
    const open = rows.find(x => !x.prog.met)
    if (urgent) { value = <Icon name="warning" />; sub = urgent.title }
    else if (open) { value = Number.isFinite(open.prog.pct) ? <><CountUp value={Math.round(open.prog.pct * 100)} />%</> : '-'; sub = open.goal.label }
    else if (rows.length) { value = <Icon name="check" />; sub = t('All goals met') }
  }
  return <Tile id="medical" icon="heart" tint="var(--pink)" label={t('Medical')} value={value} sub={sub} onOpen={onOpen} />
}

/** The grid of tiles, in the profile's order (lib/home-layout.js). */
export function HubTiles({ streak }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const now = useMinute()
  const layout = layoutOf(S)
  const today = todayISO()
  const routines = effectiveRoutines(S, today)
  const exCount = routines.reduce((n, r) => n + (r.ex?.length || 0), 0)
  const day = checkInDay(now)
  const here = visitOn(S, day)
  const tally = weekTally(S, today)
  const w = whereNow(scheduleOf(S), now)
  const tiles = {
    workout: () => <Tile id="workout" icon={S.active ? 'play' : routines.length ? 'dumbbell' : 'moon'} tint={S.active ? 'var(--orange)' : 'var(--acc)'} label={t('Workout')}
      value={S.active ? t('In progress') : routines.length ? routines.map(r => r.name).join(' + ') : t('Rest day')}
      sub={S.active ? S.active.name : routines.length ? exCountText(exCount) : t('Tap to train anyway')}
      onOpen={() => nav('/workout')} />,
    checkin: () => isOn(S, 'checkin') ? <Tile id="checkin" icon={here ? 'checkCircle' : 'pin'} tint="var(--blue)" label={t('Check-in')}
      value={here ? t('Done') : t('Not yet')} sub={t('{0} week streak', streak?.current || 0)}
      onOpen={() => visitSheet(day)} /> : null,
    whoop: () => <WhoopTile onOpen={() => nav('/settings/whoop')} />,
    diet: () => <DietTile onOpen={() => nav('/diet')} />,
    supps: () => <SuppTile onOpen={() => nav('/supplements')} />,
    medical: () => <MedicalTile onOpen={() => nav('/medical')} />,
    schedule: () => <Tile id="schedule" icon="clock" tint="var(--teal)" label={t('Schedule')}
      value={w.next ? w.next.time : '-'} sub={w.next ? w.next.label : t('Daily timing plan')} onOpen={() => nav('/schedule')} />,
    stats: () => <Tile id="stats" icon="chart" tint="var(--indigo)" label={t('Stats')}
      value={<><CountUp value={tally.done} />{tally.planned ? <small> / {tally.planned}</small> : null}</>} sub={t('this week')} onOpen={() => nav('/stats')} />,
    history: () => <Tile id="history" icon="history" tint="var(--orange)" label={t('History')}
      value={<CountUp value={S.workouts.length} />} sub={t('workouts logged')} onOpen={() => nav('/history')} />,
    library: () => <Tile id="library" icon="magnifier" tint="var(--yellow)" label={t('Exercises')}
      value={(S.favEx || []).length ? <CountUp value={S.favEx.length} /> : t('Browse')} sub={(S.favEx || []).length ? t('favourites') : t('The exercise library')} onOpen={() => nav('/library')} />,
    plan: () => <Tile id="plan" icon="calendar" tint="var(--green)" label={t('Plan')}
      value={<CountUp value={S.routines.length} />} sub={S.routines.length === 1 ? t('routine') : t('routines')} onOpen={() => nav('/plan')} />,
    guide: () => <Tile id="guide" icon="lightbulb" tint="var(--gold-ink, var(--yellow))" label={t('Guide')}
      value={t('How to')} sub={t('Workouts and plans')} onOpen={() => nav('/guide')} />,
  }
  const shown = visibleIds(layout, 'tiles').map(id => [id, tiles[id]?.()]).filter(([, el]) => el)
  if (!shown.length) return null
  return <div className="hub-grid" data-testid="hub-tiles">
    {shown.map(([id, el]) => <div key={id} className="hub-cell">{el}</div>)}
  </div>
}

const TILE_NAME = {
  workout: 'Workout', checkin: 'Check-in', whoop: 'Whoop', diet: 'Diet', supps: 'Supplements', medical: 'Medical',
  schedule: 'Schedule', stats: 'Stats', history: 'History', library: 'Exercises', plan: 'Plan', guide: 'Guide',
}
const CARD_NAME = {
  now: 'Now strip', smartday: 'Smart day', tiles: 'Tiles', review: 'Weekly review', week: 'Week and today', highlights: 'Recaps and seasonal', recovery: 'Recovery hint',
  whoop: 'Whoop card', medical: 'Medical card', cardio: 'Today’s cardio', health: 'Diet and supplements cards',
  challenges: 'Challenges', checkin: 'Gym check-in', bodycheck: 'Monthly body check', bodyweight: 'Body weight', streak: 'Streak',
}
const nameOf = (group, id) => t((group === 'tiles' ? TILE_NAME : CARD_NAME)[id] || id)

function CustomizeHome({ close }) {
  const S = useStore(s => s.S)
  const layout = layoutOf(S)
  const save = next => useStore.getState().update(st => { st.homeLayout = next })
  const group = (g, title) => <>
    <h4 className="sec">{title}</h4>
    <div className="list cust-list">
      {layout[g].order.map((id, i) => {
        const shown = !layout[g].hidden.includes(id)
        return <div key={id} className={'item cust-row' + (shown ? '' : ' off')}>
          <div className="grow"><div className="tt">{nameOf(g, id)}</div></div>
          <button type="button" className="iconbtn" disabled={i === 0} aria-label={t('Move {0} up', nameOf(g, id))} onClick={() => save(moveItem(layout, g, id, -1))}><Icon name="chevronUp" /></button>
          <button type="button" className="iconbtn" disabled={i === layout[g].order.length - 1} aria-label={t('Move {0} down', nameOf(g, id))} onClick={() => save(moveItem(layout, g, id, 1))}><Icon name="chevronDown" /></button>
          <Switch checked={shown} onChange={v => save(setHidden(layout, g, id, !v))} aria-label={t('Show {0}', nameOf(g, id))} />
        </div>
      })}
    </div>
  </>
  return <>
    <h3>{t('Customize Home')}</h3>
    <div className="muted small" style={{ marginBottom: 8 }}>{t('Move things up or down, and switch off what you do not need. It syncs to your other devices.')}</div>
    {group('tiles', t('Tiles'))}
    {group('cards', t('Cards'))}
    <div style={{ height: 14 }} />
    <Button variant="ghost" icon="reset" onClick={() => { save(null); useUI.getState().toast(t('Home is back to the default')) }}>{t('Reset to default')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}

/** The Customize Home sheet. */
export const customizeHomeSheet = () => useUI.getState().openSheet(close => <CustomizeHome close={close} />)

