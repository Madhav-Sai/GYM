// Gym check-in (this fork): the Home card, the sheet to name the Cult centre and add a note, and the
// row on a day's sheet that checks in a missed day afterwards. The rules live in lib/gym-visits.js.
// Sheets open through useUI directly, not through sheets.jsx, so the Home tests' mock of that module
// stays as it is.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { isOn } from '../lib/modules.js'
import { visitOf, withVisit, withVisitDetails, canCheckIn, checkInDay, monthVisits, recentCentres, CENTRE_MAX, VISIT_NOTE_MAX } from '../lib/gym-visits.js'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// The latest day a check-in can be for: the 04:00 check-in day, never past the phone's own date.
const latestDay = () => { const a = checkInDay(), b = todayISO(); return a > b ? a : b }

/** Check `iso` in (on) or take it back. */
export function setVisit(iso, on) {
  useStore.getState().update(st => { st.gymVisits = withVisit(st.gymVisits, iso, on, Date.now(), latestDay()) })
}

function VisitSheet({ iso, close }) {
  const S = useStore(s => s.S)
  const had = visitOf(S, iso)
  const [centre, setCentre] = useState(had?.centre || '')
  const [note, setNote] = useState(had?.note || '')
  const recent = recentCentres(S)
  const save = () => {
    useStore.getState().update(st => { st.gymVisits = withVisitDetails(st.gymVisits, iso, { centre, note }, Date.now(), latestDay()) })
    close()
    useUI.getState().toast(had ? t('Saved') : t('Checked in for {0}', fmtDate(iso, true)))
  }
  const undo = () => { setVisit(iso, false); close(); useUI.getState().toast(t('Check-in taken back')) }
  return <>
    <h3>{fmtDate(iso, true)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{had ? t('You checked in on this day.') : t('Check in for this day. It counts towards your streak.')}</div>
    <label className="small dim" htmlFor="visit-centre">{t('Which gym (optional)')}</label>
    <input id="visit-centre" className="input" maxLength={CENTRE_MAX} value={centre} placeholder={t('For example Cult HSR Layout')}
      onChange={e => setCentre(e.target.value)} style={{ marginTop: 4 }} />
    {recent.length > 0 && <div className="chips" style={{ margin: '8px 0 0' }}>
      {recent.map(c => <button key={c} type="button" className={'chip nocap' + (c === centre ? ' on' : '')} aria-pressed={c === centre} onClick={() => setCentre(c)}>{c}</button>)}
    </div>}
    <div style={{ height: 12 }} />
    <label className="small dim" htmlFor="visit-note">{t('Note (optional)')}</label>
    <textarea id="visit-note" className="input" rows={2} maxLength={VISIT_NOTE_MAX} value={note} placeholder={t('Class, crowd, how it went')}
      onChange={e => setNote(e.target.value)} style={{ marginTop: 4 }} />
    <div style={{ height: 18 }} />
    <Button variant="primary" icon="check" onClick={save}>{had ? t('Save') : t('Check in')}</Button>
    {had && <><div style={{ height: 10 }} /><Button variant="ghost" icon="undo" onClick={undo}>{t('Take back check-in')}</Button></>}
  </>
}

/** The check-in sheet for a day: check in (today or a missed day), name the centre, add a note, or take it back. */
export const visitSheet = iso => useUI.getState().openSheet(close => <VisitSheet iso={iso} close={close} />)

/** A day sheet's check-in row (sheets.jsx DayOverride): today and past days only. */
export function VisitDayRow({ iso, close }) {
  const S = useStore(s => s.S)
  if (!isOn(S, 'checkin') || !canCheckIn(iso, latestDay())) return null
  const v = visitOf(S, iso)
  const open = () => { close?.(); visitSheet(iso) }
  return <div className="visit-day" style={{ marginBottom: 14 }}>
    <div className="item visit-day-row" {...tappable(open)}>
      <span className="lrow-i" style={{ background: v ? 'var(--blue)' : 'var(--surface-3)', ...(v ? {} : { color: 'var(--label-2)' }) }}><Icon name={v ? 'checkCircle' : 'pin'} /></span>
      <div className="grow">
        <div className="tt">{v ? t('Checked in') : t('I was at the gym')}</div>
        <div className="ss">{v ? [v.centre, v.note].filter(Boolean).join(' · ') || t('Add the centre or a note') : t('Check in for this day')}</div>
      </div>
      <Icon name={v ? 'pencil' : 'plus'} className="chev" />
    </div>
  </div>
}

/** Home's check-in card: one tap checks in today; once in, the centre and note are one tap away. */
export function CheckInCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const day = checkInDay()
  const v = visitOf(S, day)
  const here = !!v
  const month = monthVisits(S, latestDay())
  const sub = here
    ? [v.centre, t('It counts towards your streak.')].filter(Boolean).join(' · ')
    : t('One tap. It counts towards your streak.')
  return <div className="card checkin-card">
    <CardHead icon={here ? 'checkCircle' : 'pin'} tint="var(--blue)" eyebrow={t('At the gym')}
      title={here ? t('Checked in today') : t('Check in')} sub={sub}
      action={<Button size="sm" icon={here ? 'undo' : 'check'} onClick={() => setVisit(day, !here)}>{here ? t('Undo') : t('Check in')}</Button>} />
    <div className="checkin-foot">
      <span className="small dim">{month.days === 1 ? t('1 visit this month') : t('{0} visits this month', month.days)}</span>
      {here && <Button size="sm" variant="ghost" icon="pencil" onClick={() => visitSheet(day)}>{v.centre || v.note ? t('Edit centre or note') : t('Add centre or note')}</Button>}
    </div>
    {/* Only with a saved code: a gym without a turnstile code (Cult, for one) has nothing to show here. */}
    {(S.gymCards || []).length > 0 && <Button size="sm" icon="qr" onClick={() => nav('/checkin')}>{t('Membership codes')}</Button>}
  </div>
}

