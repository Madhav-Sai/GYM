// Water reminders (lib/water-reminders.js), the UI side: the setting S.waterReminders, its section
// in Settings → Reminders, the one-tap switch on the Diet screen's water card, and the hook that
// re-plans the phone's reminders each time a screen learns today's water total. Local
// notifications are the phone's: on the website the section only says so, and the Diet switch is
// not shown.
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { MOBILE } from '../lib/mobile.js'
import { healthDay } from '../lib/ist.js'
import { waterSettingsOf, syncWaterReminders, knownWater, WATER_EVERY, WATER_TARGET_ML } from '../lib/water-reminders.js'
import { Section, Row, Switch, Segmented } from './ui.jsx'

/** Today's total for a sync that has none: the last one seen, else asked of the server. */
async function todayWater() {
  const known = knownWater()
  if (known != null) return known
  if (!useStore.getState().user) return null
  try {
    const d = await api('/api/health/diet?day=' + encodeURIComponent(healthDay()))
    return typeof d?.water === 'number' ? d.water : null
  } catch { return null }
}

/**
 * Changes the setting and re-plans the reminders. Turning it on asks for notification permission
 * first (as Set phone reminders on Supplements does) and stays off when that is refused.
 */
export async function setWaterReminders(patch) {
  const st = useStore.getState()
  const cur = waterSettingsOf(st.S)
  const next = { ...cur, ...patch }
  if (MOBILE) {
    const turningOn = next.on && !cur.on
    const ok = await syncWaterReminders({ ...st.S, waterReminders: next }, await todayWater(), { interactive: turningOn })
    if (turningOn && !ok) { useUI.getState().toast(t('Notifications are off for myGym')); return false }
  }
  useStore.getState().update(s => { s.waterReminders = next })
  return true
}

/**
 * Re-plans today's water reminders from `water` (the screen's total for `day`): a new glass, the
 * app opening, a new day, or the setting or timing plan changing on another device.
 */
export function useWaterReminderSync(water, day) {
  const setting = useStore(s => s.S.waterReminders)
  const plan = useStore(s => s.S.daySchedule)
  useEffect(() => {
    if (!MOBILE || typeof water !== 'number' || (day && day !== healthDay())) return
    syncWaterReminders(useStore.getState().S, water).catch(() => {})
  }, [water, day, setting, plan])
}

const litres = ml => String(Math.round(ml / 100) / 10)

/** The one-tap switch on the Diet screen's water card. The phone only. */
export function WaterReminderSwitch() {
  const on = useStore(s => waterSettingsOf(s.S).on)
  if (!MOBILE) return null
  return <Row icon="bell" iconTint="var(--blue)" title={t('Remind me to drink water')}>
    <Switch checked={on} onChange={v => setWaterReminders({ on: v })} aria-label={t('Remind me to drink water')} />
  </Row>
}

/** Settings → Reminders: the switch, the interval and the gym's quiet hours; on the web, where they work. */
export function WaterReminderSettings() {
  const set = waterSettingsOf({ waterReminders: useStore(s => s.S.waterReminders) })
  const target = t('{0} L a day', litres(WATER_TARGET_ML))
  if (!MOBILE) {
    return <Section footer={t('Water reminders are phone notifications: turn them on in the iPhone app.')}>
      <Row icon="drop" iconTint="var(--blue)" title={t('Water reminders')} subtitle={t('Works in the iPhone app')} />
    </Section>
  }
  return <Section footer={t('While you are awake, from your daily timing plan. Each one says how much to drink to stay on pace, and they stop once you reach the target.')}>
    <Row icon="drop" iconTint="var(--blue)" title={t('Water reminders')}>
      <Switch checked={set.on} onChange={v => setWaterReminders({ on: v })} aria-label={t('Water reminders')} />
    </Row>
    {set.on && <>
      <Row icon="timer" iconTint="var(--purple)" title={t('Remind every')}>
        <Segmented className="seg-inline" options={WATER_EVERY.map(v => ({ value: v, label: t('{0} min', v) }))}
          value={set.every} onChange={v => setWaterReminders({ every: v })} />
      </Row>
      <Row icon="dumbbell" iconTint="var(--acc)" title={t('Quiet during the gym')}>
        <Switch checked={set.quietGym} onChange={v => setWaterReminders({ quietGym: v })} aria-label={t('Quiet during the gym')} />
      </Row>
      <Row icon="leaf" iconTint="var(--green)" title={t('Daily target')} subtitle={t('From your diet targets')} value={target} />
    </>}
  </Section>
}
