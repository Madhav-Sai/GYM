// How do I build a workout, a plan, a day (this fork): short steps, each with a button that opens the
// real screen. Every target is a route in App.jsx (GUIDE_LINKS, checked by Guide.test.jsx).
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { uid } from '../lib/format.js'
import { DEFAULT_GLYPH } from '../lib/glyphs.js'
import { checkInDay } from '../lib/gym-visits.js'
import { loadMyPlan } from '../components/MyPlan.jsx'
import { visitSheet } from '../components/GymVisit.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import '../components/hub.css'

// The routes the guide opens (App.jsx). /plan/r/:id is a routine's own editor.
export const GUIDE_LINKS = ['/plan', '/plan/r/:id', '/library', '/workout', '/schedule', '/settings/whoop', '/diet', '/supplements', '/medical', '/history', '/stats']

function newRoutine(nav) {
  const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
  useStore.getState().update(s => { s.routines.push(r) })
  nav('/plan/r/' + r.id)
}

export default function Guide() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const first = S.routines[0]
  const openRoutine = () => (first ? nav('/plan/r/' + first.id) : newRoutine(nav))
  const sections = [
    { title: t('Start with my plan'), steps: [
      t('Load my plan adds your routines (Upper A and B, Lower A and B, two cardio days) on the right weekdays, Sunday off.'),
      t('It is safe to tap again: nothing is added twice. It is also in Settings, Plan and schedule.'),
    ], action: { icon: 'clipboard', label: t('Load my plan'), run: () => { loadMyPlan(); nav('/plan') } } },
    { title: t('Create a routine'), steps: [
      t('A routine is one workout, for example Upper A.'),
      t('Tap New routine, give it a name and an icon.'),
    ], action: { icon: 'plus', label: t('New routine'), run: () => newRoutine(nav) } },
    { title: t('Add exercises, sets, reps, weight and rest'), steps: [
      t('In the routine, tap Add exercise and pick from the library (search or filter by muscle).'),
      t('Tap an exercise to set its sets, reps, starting weight and rest time.'),
      t('Drag to reorder. Two exercises can be joined as a superset.'),
    ], action: { icon: 'pencil', label: first ? t('Open {0}', first.name) : t('New routine'), run: openRoutine },
      extra: { icon: 'magnifier', label: t('Exercise library'), run: () => nav('/library') } },
    { title: t('Put routines on weekdays'), steps: [
      t('Open Plan. Under the week, tap a weekday and pick its routine, or Rest day.'),
      t('Pick two routines to train them together on one day. Rotation is in Settings, Plan and schedule.'),
    ], action: { icon: 'calendar', label: t('Open Plan'), run: () => nav('/plan') } },
    { title: t('Change how the weight goes up'), steps: [
      t('In a routine, Progression picks the rule: add weight each session, or reps first then weight.'),
      t('Each exercise can have its own rule in its settings.'),
    ], action: { icon: 'chartLine', label: first ? t('Open {0}', first.name) : t('Open Plan'), run: () => (first ? nav('/plan/r/' + first.id) : nav('/plan')) } },
    { title: t('Start and log a workout'), steps: [
      t('Tap Today on Home, or Start in the tab bar.'),
      t('Tick each set as you do it. Change the weight or reps first if they were different.'),
      t('Finish saves it to History. Next time the weights move on by themselves.'),
    ], action: { icon: 'play', label: t('Start a workout'), run: () => nav('/workout') },
      extra: { icon: 'history', label: t('History'), run: () => nav('/history') } },
    { title: t('Plan your day, hour by hour'), steps: [
      t('The daily timing plan starts as your 2pm to 11pm shift: wake, meals, gym, work, sleep.'),
      t('Tap a row to change its time or what it is. Duplicate the plan for Sunday or a morning shift and pick its days.'),
    ], action: { icon: 'clock', label: t('Daily timing plan'), run: () => nav('/schedule') } },
    { title: t('Check in at the gym'), steps: [
      t('On Home, tap Check in when you reach the gym. It counts towards your streak.'),
      t('Add the Cult centre and a note if you like. Forgot? Open the calendar from the streak card, tap the day, then I was at the gym.'),
    ], action: { icon: 'pin', label: t('Check in today'), run: () => visitSheet(checkInDay()) } },
    { title: t('Connect Whoop'), steps: [
      t('Settings, Whoop, Connect. Sign in to Whoop and allow access.'),
      t('Recovery, sleep and strain then show on Home and guide each workout.'),
    ], action: { icon: 'heart', label: t('Whoop settings'), run: () => nav('/settings/whoop') } },
    { title: t('Log food and water'), steps: [
      t('Diet shows today’s calories, protein, carbs, fat, fibre and water against your targets.'),
      t('Add what you ate from the list, or type it in.'),
    ], action: { icon: 'leaf', label: t('Diet'), run: () => nav('/diet') } },
    { title: t('Supplements'), steps: [
      t('Tick each one as you take it. The phone app can remind you.'),
    ], action: { icon: 'pill', label: t('Supplements'), run: () => nav('/supplements') } },
    { title: t('Medical'), steps: [
      t('Add blood tests and InBody scans, set goals, and see when a retest is due.'),
    ], action: { icon: 'heart', label: t('Medical'), run: () => nav('/medical') } },
  ]
  return <div className="narrow guide-view">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}>
        <h1>{t('Guide')}</h1>
        <div className="sub">{t('How to build a workout, a plan and your day')}</div>
      </div>
    </div>
    {sections.map((s, i) => <section key={i} className="card guide-step" aria-labelledby={'guide-' + i}>
      <span className="guide-num" aria-hidden="true">{i + 1}</span>
      <div className="guide-body">
        <h3 id={'guide-' + i}>{s.title}</h3>
        <ol>{s.steps.map((x, j) => <li key={j}>{x}</li>)}</ol>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="tinted" icon={s.action.icon} onClick={s.action.run}>{s.action.label}</Button>
          {s.extra && <Button size="sm" variant="ghost" icon={s.extra.icon} onClick={s.extra.run}>{s.extra.label}</Button>}
        </div>
      </div>
    </section>)}
    <div style={{ height: 24 }} />
  </div>
}
