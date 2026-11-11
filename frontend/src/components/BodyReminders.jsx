// Home's monthly body check (our addition, lib/body-reminders.js): a progress photo, an InBody scan
// and the waist, each shown only while it is due and one tap from its screen. On the phone a switch
// queues a reminder on the 1st of each month at 10:30 India time.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { MOBILE } from '../lib/mobile.js'
import { isOn } from '../lib/modules.js'
import { bodyReminders, syncBodyReminders } from '../lib/body-reminders.js'
import { useMedical } from './MedicalHome.jsx'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'
import { Row, Switch } from './ui.jsx'

const ICON = { photo: 'camera', inbody: 'scale', waist: 'target' }

export function BodyRemindersCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const { data } = useMedical()
  const notify = S.bodyReminderNotify === true
  // Keep a year of reminders queued while the switch is on; every Home visit tops it up.
  useEffect(() => { if (MOBILE && notify) syncBodyReminders(true).catch(() => {}) }, [notify])
  const body = isOn(S, 'body')
  const items = bodyReminders({ S, inbody: data ? data.inbody || [] : undefined, today: todayISO() })
    .filter(r => r.id === 'inbody' || body)
  if (!items.length) return null
  const setNotify = async v => {
    const ok = await syncBodyReminders(v, true)
    if (v && !ok) { useUI.getState().toast(t('Notifications are off for myGym')); return }
    useStore.getState().update(s => { s.bodyReminderNotify = v })
  }
  return <div className="card body-reminders">
    <CardHead icon="calendar" tint="var(--teal)" eyebrow={t('Body check')} title={items.length === 1 ? t('1 thing due') : t('{0} things due', items.length)} />
    {items.map(r => <Row key={r.id} icon={ICON[r.id]} iconTint="var(--teal)" title={t(r.title)} accessory="chevron" onClick={() => nav(r.to)}
      subtitle={(r.days == null ? t('None yet') : (r.days === 1 ? t('Last one yesterday') : t('Last one {0} days ago', r.days))) + (r.note ? '. ' + t(r.note) : '')} />)}
    {MOBILE && <Row icon="bell" title={t('Remind me on the 1st')} subtitle={t('10:30 India time, every month')}>
      <Switch checked={notify} onChange={setNotify} aria-label={t('Remind me on the 1st')} />
    </Row>}
  </div>
}
