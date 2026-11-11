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
import { visitOf, withVisit, withVisitDetails, withVisitClass, canCheckIn, checkInDay, monthVisits, recentCentres, CENTRE_MAX, VISIT_NOTE_MAX, CLS_MAX, VISIT_CLASSES } from '../lib/gym-visits.js'
import { applyCultNames } from '../lib/whoop-import.js'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// The latest day a check-in can be for: the 04:00 check-in day, never past the phone's own date.
const latestDay = () => { const a = checkInDay(), b = todayISO(); return a > b ? a : b }

/** Check `iso` in (on) or take it back. */
export function setVisit(iso, on) {
  useStore.getState().update(st => {
    st.gymVisits = withVisit(st.gymVisits, iso, on, Date.now(), latestDay())
    applyCultNames(st)
  })
}

/** Check `iso` in with class `cls` ('' clears it), and name that day's Whoop workout after it. */
export function setVisitClass(iso, cls) {
  useStore.getState().update(st => {
    st.gymVisits = withVisitClass(st.gymVisits, iso, cls, Date.now(), latestDay())
    applyCultNames(st)
  })
}

// Written out as t() literals so check-source-strings sees them (lib/gym-visits.js VISIT_CLASSES).
const CLASS_LABEL = {
  'Gym floor (my plan)': () => t('Gym floor (my plan)'),
  'HRX': () => t('HRX'),
  'Strength & Conditioning': () => t('Strength & Conditioning'),
  'Boxing': () => t('Boxing'),
  'Dance Fitness': () => t('Dance Fitness'),
  'Yoga': () => t('Yoga'),
  'Spin': () => t('Spin'),
  'Burn': () => t('Burn'),
  'HIIT': () => t('HIIT'),
}
const classLabel = c => (CLASS_LABEL[c.label] ? CLASS_LABEL[c.label]() : c.label)

/**
 * "What did you do?": one chip per Cult format and "Gym floor" for your own plan, plus Other for
 * free text (the check-in sheet). A tap checks the day in with that class; a tap on the chosen
 * one clears it.
 */
export function ClassChips({ iso, value, onPick, onOther }) {
  const known = VISIT_CLASSES.some(c => c.v === value)
  const pick = onPick || (v => setVisitClass(iso, v))
  return <div className="visit-classes" data-testid="visit-classes">
    <div className="small dim" style={{ marginBottom: 6 }}>{t('What did you do?')}</div>
    <div className="chips" style={{ margin: 0 }}>
      {VISIT_CLASSES.map(c => <button key={c.v} type="button" className={'chip nocap' + (value === c.v ? ' on' : '')} aria-pressed={value === c.v}
        onClick={() => pick(value === c.v ? '' : c.v)}>{classLabel(c)}</button>)}
      {onOther && <button type="button" className={'chip nocap' + (value && !known ? ' on' : '')} aria-pressed={!!value && !known} onClick={onOther}>{value && !known ? value : t('Other')}</button>}
    </div>
  </div>
}

function VisitSheet({ iso, close }) {
  const S = useStore(s => s.S)
  const had = visitOf(S, iso)
  const [centre, setCentre] = useState(had?.centre || '')
  const [note, setNote] = useState(had?.note || '')
  const [cls, setCls] = useState(had?.cls || '')
  const recent = recentCentres(S)
  const save = () => {
    useStore.getState().update(st => {
      st.gymVisits = withVisitDetails(st.gymVisits, iso, { centre, note, cls }, Date.now(), latestDay())
      applyCultNames(st)
    })
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
    <ClassChips iso={iso} value={cls} onPick={setCls} />
    <input id="visit-cls" className="input" maxLength={CLS_MAX} value={cls} placeholder={t('Or type it, for example Pilates')} aria-label={t('What did you do?')}
      onChange={e => setCls(e.target.value)} style={{ marginTop: 8 }} />
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
        <div className="ss">{v ? [v.cls && cultLabel(v.cls), v.centre, v.note].filter(Boolean).join(' · ') || t('Add the centre or a note') : t('Check in for this day')}</div>
      </div>
      <Icon name={v ? 'pencil' : 'plus'} className="chev" />
    </div>
  </div>
}

const cultLabel = cls => { const c = VISIT_CLASSES.find(x => x.v === cls); return c ? classLabel(c) : cls }

/** Home's check-in card: one tap checks in today; once in, the centre and note are one tap away. */
export function CheckInCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const day = checkInDay()
  const v = visitOf(S, day)
  const here = !!v
  const month = monthVisits(S, latestDay())
  const sub = here
    ? [v.cls && cultLabel(v.cls), v.centre, t('It counts towards your streak.')].filter(Boolean).join(' · ')
    : t('One tap. It counts towards your streak.')
  return <div className="card checkin-card">
    <CardHead icon={here ? 'checkCircle' : 'pin'} tint="var(--blue)" eyebrow={t('At the gym')}
      title={here ? t('Checked in today') : t('Check in')} sub={sub}
      action={<Button size="sm" icon={here ? 'undo' : 'check'} onClick={() => setVisit(day, !here)}>{here ? t('Undo') : t('Check in')}</Button>} />
    <ClassChips iso={day} value={v?.cls || ''} onOther={() => visitSheet(day)} />
    <div className="checkin-foot">
      <span className="small dim">{month.days === 1 ? t('1 visit this month') : t('{0} visits this month', month.days)}</span>
      {here && <Button size="sm" variant="ghost" icon="pencil" onClick={() => visitSheet(day)}>{v.centre || v.note ? t('Edit centre or note') : t('Add centre or note')}</Button>}
    </div>
    {/* Only with a saved code: a gym without a turnstile code (Cult, for one) has nothing to show here. */}
    {(S.gymCards || []).length > 0 && <Button size="sm" icon="qr" onClick={() => nav('/checkin')}>{t('Membership codes')}</Button>}
  </div>
}

