// The switch from the old 11 am timing plan to the 6 am one (lib/day-schedule.js isOldTimetable,
// applySixAmTimetable): a banner on the Schedule screen and above Home's Now strip while a stored
// plan is still the old one, with Switch and Not now (S.sixAmDismissed, synced), and the row in
// Settings → Plan & schedule. A switch re-plans the phone's timing-plan and water reminders.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { offerSixAm, applySixAmTimetable, planDay } from '../lib/day-schedule.js'
import { syncScheduleReminders } from '../lib/schedule-reminders.js'
import { syncWaterReminders } from '../lib/water-reminders.js'
import { Button } from './ui.jsx'

/** Moves the stored plan to the 6 am timetable, keeping the user's own extra plans. */
export function switchToSixAm() {
  const next = applySixAmTimetable(useStore.getState().S)
  useStore.getState().update(s => { s.daySchedule = next; s.sixAmDismissed = true })
  if (MOBILE) {
    syncScheduleReminders(next, planDay()).catch(() => {})
    syncWaterReminders(useStore.getState().S, null).catch(() => {})
  }
  useUI.getState().toast(t('Switched to the 6 am timetable'))
  return next
}

export function SixAmBanner() {
  const offer = useStore(s => offerSixAm(s.S))
  if (!offer) return null
  return <div className="card" role="status">
    <div style={{ fontWeight: 600 }}>{t('Your timetable is the old 11 am one. Switch to the 6 am plan?')}</div>
    <div className="row" style={{ gap: 8, marginTop: 10 }}>
      <Button size="sm" variant="tinted" icon="check" onClick={switchToSixAm}>{t('Switch')}</Button>
      <Button size="sm" variant="ghost" onClick={() => useStore.getState().update(s => { s.sixAmDismissed = true })}>{t('Not now')}</Button>
    </div>
  </div>
}
