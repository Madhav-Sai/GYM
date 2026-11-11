// Smart day (this fork, lib/smart-day.js): today's Whoop recovery band against today's plan, as a
// banner on Home (under the Now strip) and at the top of the Diet screen. Every change is a tap:
// "Switch diet to rest day" posts the day type the way the Diet screen's own switch does,
// "Do cardio instead" opens the treadmill table, "Keep my plan" hides it for the day.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO } from '../lib/demo.js'
import { isOn } from '../lib/modules.js'
import { todayISO } from '../lib/format.js'
import { healthDay } from '../lib/ist.js'
import { BAND_INK } from '../lib/whoop.js'
import { dayTypeOf } from '../lib/diet-plan.js'
import { effectiveRoutines } from '../lib/history.js'
import { smartDay, smartDayOn, keptOn, withKept } from '../lib/smart-day.js'
import { useWhoopSummary } from '../views/WhoopSheets.jsx'
import { useDietDay, useHealthOn } from '../views/health-data.js'
import { cardioPlanSheet } from './MyPlan.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import './weekly-review.css'

// Written out as t() literals so check-source-strings sees them (lib/smart-day.js returns these keys).
const WORDS = {
  'Recovery is green': () => t('Recovery is green'),
  'Recovery is yellow': () => t('Recovery is yellow'),
  'Recovery is red': () => t('Recovery is red'),
  "Swap today's lifting for the easy 20 minutes of cardio, or rest. If you lift anyway, keep last week's weights.":
    () => t("Swap today's lifting for the easy 20 minutes of cardio, or rest. If you lift anyway, keep last week's weights."),
  'Make it the easy 20 minutes on the treadmill, or rest. Nothing hard today.': () => t('Make it the easy 20 minutes on the treadmill, or rest. Nothing hard today.'),
  'A rest day is the right call. Sleep and eat well.': () => t('A rest day is the right call. Sleep and eat well.'),
  'Train as planned, but no new weight today. Repeat last week.': () => t('Train as planned, but no new weight today. Repeat last week.'),
  'Do the cardio, and stay in the heart-rate bands.': () => t('Do the cardio, and stay in the heart-rate bands.'),
  'A rest day suits today.': () => t('A rest day suits today.'),
  'Train and try progression: add weight where you hit every rep last time.': () => t('Train and try progression: add weight where you hit every rep last time.'),
  'Do the full cardio plan today.': () => t('Do the full cardio plan today.'),
  'Green on a rest day. An easy walk is fine.': () => t('Green on a rest day. An easy walk is fine.'),
}
const say = key => (WORDS[key] ? WORDS[key]() : t(key))
const DIET_LABEL = { rest: () => t('Switch diet to rest day'), cardio: () => t('Switch diet to cardio day') }

/** Whether this profile can ask our server for Whoop (as the Whoop card asks). */
export function useWhoopOffered() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  return !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations')
}

/**
 * The banner itself, from a summary and the diet's day type. Pure drawing, so the render tests
 * hand it a mocked summary. `onDietDay(dayType)` switches the diet; `onKeep` hides it for today.
 */
export function SmartDayView({ summary, routines, dayType, kept, on = true, onDietDay, onKeep, onCardio, compact }) {
  const band = summary?.connected === false ? null : summary?.today?.guidance?.band
  const s = smartDay({ band, routines, dayType, kept, on })
  if (!s) return null
  const ink = BAND_INK[s.band]
  return <div className={'card smart-day' + (compact ? ' compact' : '')} data-testid="smart-day" data-band={s.band} role="status"
    style={{ borderInlineStart: `4px solid ${ink}`, background: `color-mix(in srgb, ${ink} 10%, var(--surface))` }}>
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="lrow-i" style={{ background: ink, flex: 'none' }} aria-hidden="true"><Icon name="heart" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="lbl2">{t('Smart day')}{Number.isFinite(summary?.today?.recovery?.score) ? ` · ${Math.round(summary.today.recovery.score)}%` : ''}</div>
        <div style={{ fontWeight: 600 }}>{say(s.title)}</div>
        <div className="small" style={{ marginTop: 2, color: 'var(--label-2)' }}>{say(s.text)}</div>
      </div>
    </div>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      {s.actions.includes('diet') && <Button size="sm" variant="tinted" icon="leaf" onClick={() => onDietDay?.(s.dietDayType)}>{DIET_LABEL[s.dietDayType]()}</Button>}
      {s.actions.includes('cardio') && <Button size="sm" variant="tinted" icon="figureRun" onClick={() => (onCardio ? onCardio(s.cardioKey) : cardioPlanSheet(s.cardioKey))}>{t('Do cardio instead')}</Button>}
      <Button size="sm" variant="ghost" icon="check" onClick={onKeep}>{t('Keep my plan')}</Button>
    </div>
  </div>
}

/** "Keep my plan": hidden for today's health day, on every device (a synced setting). */
export const keepToday = day => useStore.getState().update(s => { s.smartDayKept = withKept(s.smartDayKept, day) })

/**
 * The banner wired to the app: the summary, today's routines and, on Home, the diet's day type.
 * On the Diet screen pass `dayType` and `onDietDay`, so the switch posts through the screen's own
 * resource and the screen moves at once.
 */
export function SmartDayBanner({ dayType: givenType, onDietDay: givenDietDay, compact }) {
  const S = useStore(s => s.S)
  const offered = useWhoopOffered()
  const enabled = offered && smartDayOn(S)
  const w = useWhoopSummary(enabled)
  const healthOn = useHealthOn()
  const day = healthDay()
  // Home reads the day type itself; the Diet screen already has it (and its own post).
  const d = useDietDay(day, enabled && healthOn && givenType == null && !!w.data?.today?.guidance)
  if (!enabled || !w.data) return null
  const auto = dayTypeOf(day)
  const dayType = givenType ?? dayTypeOf(day, d.data?.dayType)
  const onDietDay = givenDietDay || (async v => {
    const r = await d.post('/api/health/diet/day', { day, dayType: v === auto ? null : v })
    if (r) useUI.getState().toast(v === 'rest' ? t('Diet set to a rest day') : t('Diet set to a cardio day'))
  })
  return <SmartDayView summary={w.data} routines={effectiveRoutines(S, todayISO())} dayType={dayType} kept={keptOn(S, day)}
    onDietDay={onDietDay} onKeep={() => keepToday(day)} compact={compact} />
}
