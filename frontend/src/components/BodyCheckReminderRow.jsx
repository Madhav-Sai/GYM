// The "Monthly body check" phone reminder (lib/body-reminders.js): one switch, shown on Home's body
// check card while something is due and always in Settings → Reminders, so it can be turned off when
// the card is not showing. S.bodyReminderNotify either way.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { syncBodyReminders } from '../lib/body-reminders.js'
import { Row, Switch } from './ui.jsx'

export async function setBodyReminderNotify(v) {
  const ok = await syncBodyReminders(v, true)
  if (v && !ok) { useUI.getState().toast(t('Notifications are off for myGym')); return false }
  useStore.getState().update(s => { s.bodyReminderNotify = v })
  return true
}

export default function BodyCheckReminderRow({ title = 'Remind me on the 1st', subtitle = '10:30 India time, every month', iconTint }) {
  const notify = useStore(s => s.S.bodyReminderNotify === true)
  return <Row icon="bell" iconTint={iconTint} title={t(title)} subtitle={t(subtitle)}>
    <Switch checked={notify} onChange={setBodyReminderNotify} aria-label={t(title)} />
  </Row>
}
