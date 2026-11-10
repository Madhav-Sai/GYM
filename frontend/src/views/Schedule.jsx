// The daily timing plan (this fork, lib/day-schedule.js): a timeline of the day with the row in
// progress highlighted and a "now" line, tap a row to change it, several named plans each on its own
// weekdays (a different one for the Sunday rest day or a morning shift), Duplicate and Reset.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DAYS, DAYN } from '../lib/format.js'
import { MOBILE } from '../lib/mobile.js'
import { healthMinutes } from '../lib/ist.js'
import {
  scheduleOf, defaultSchedule, whereNow, planDay, planFor, sortRows, dayMinutes, fmtLeft, KINDS, KIND_ICON, KIND_TINT,
  addRow, editRow, removeRow, moveRow, duplicatePlan, renamePlan, toggleDay, removePlan, uncoveredDays, ALL_DAYS, MAX_ROWS,
} from '../lib/day-schedule.js'
import { syncScheduleReminders } from '../lib/schedule-reminders.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Switch } from '../components/ui.jsx'
import '../components/hub.css'

const KIND_LABEL = { wake: 'Wake', meal: 'Meal', gym: 'Gym', work: 'Work', supp: 'Supplement', sleep: 'Sleep', other: 'Other' }
const save = next => useStore.getState().update(st => { st.daySchedule = next })
const toast = m => useUI.getState().toast(m)

function RowSheet({ planId, row, close }) {
  const S = useStore(s => s.S)
  const schedule = scheduleOf(S)
  const plan = schedule.plans.find(p => p.id === planId)
  const isNew = !row
  const [time, setTime] = useState(row?.time || '12:00')
  const [label, setLabel] = useState(row?.label || '')
  const [kind, setKind] = useState(row?.kind || 'other')
  const [note, setNote] = useState(row?.note || '')
  const [remind, setRemind] = useState(row?.remind !== false)
  const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const done = () => {
    if (!ok) return
    const patch = { time, label: label.trim() || t(KIND_LABEL[kind]), kind, note: note.trim(), remind }
    save(isNew ? addRow(schedule, planId, patch) : editRow(schedule, planId, row.id, patch))
    close()
  }
  const rows = sortRows(plan?.rows || [])
  const i = row ? rows.findIndex(r => r.id === row.id) : -1
  return <>
    <h3>{isNew ? t('Add a row') : t('Edit row')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{plan?.name}{dayMinutes(time) >= 1440 ? ' · ' + t('after midnight, still the same plan day') : ''}</div>
    <label className="small dim" htmlFor="sched-time">{t('Time')}</label>
    <input id="sched-time" className="input" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ marginTop: 4 }} />
    <div style={{ height: 12 }} />
    <label className="small dim" htmlFor="sched-label">{t('What')}</label>
    <input id="sched-label" className="input" maxLength={60} value={label} placeholder={t('For example Lunch')} onChange={e => setLabel(e.target.value)} style={{ marginTop: 4 }} />
    <div className="sched-kinds" role="group" aria-label={t('Kind')}>
      {KINDS.map(k => <button key={k} type="button" className={'chip nocap ichip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>
        <Icon name={KIND_ICON[k]} />{t(KIND_LABEL[k])}</button>)}
    </div>
    <label className="small dim" htmlFor="sched-note">{t('Note (optional)')}</label>
    <textarea id="sched-note" className="input" rows={2} maxLength={200} value={note} onChange={e => setNote(e.target.value)} style={{ marginTop: 4 }} />
    {MOBILE && schedule.remind && <div className="row between" style={{ marginTop: 12 }}>
      <span>{t('Remind me')}</span><Switch checked={remind} onChange={setRemind} aria-label={t('Remind me')} />
    </div>}
    <div style={{ height: 16 }} />
    <Button variant="primary" icon="check" disabled={!ok} onClick={done}>{isNew ? t('Add') : t('Save')}</Button>
    {!isNew && <div className="sched-actions">
      <Button size="sm" variant="tinted" icon="arrowUp" disabled={i <= 0} onClick={() => { save(moveRow(schedule, planId, row.id, -1)); close() }}>{t('Earlier slot')}</Button>
      <Button size="sm" variant="tinted" icon="arrowDown" disabled={i < 0 || i >= rows.length - 1} onClick={() => { save(moveRow(schedule, planId, row.id, 1)); close() }}>{t('Later slot')}</Button>
      <Button size="sm" variant="ghost" icon="trash" onClick={() => { save(removeRow(schedule, planId, row.id)); close(); toast(t('Row removed')) }}>{t('Delete')}</Button>
    </div>}
  </>
}
const rowSheet = (planId, row) => useUI.getState().openSheet(close => <RowSheet planId={planId} row={row} close={close} />)

function RenameSheet({ planId, close }) {
  const schedule = scheduleOf(useStore.getState().S)
  const plan = schedule.plans.find(p => p.id === planId)
  const [name, setName] = useState(plan?.name || '')
  return <>
    <h3>{t('Rename plan')}</h3>
    <input className="input" maxLength={40} value={name} onChange={e => setName(e.target.value)} aria-label={t('Plan name')} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { save(renamePlan(schedule, planId, name)); close() }}>{t('Save')}</Button>
  </>
}

export default function Schedule() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const schedule = useMemo(() => scheduleOf(S), [S.daySchedule]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setTick(new Date()), 60000); return () => clearInterval(id) }, [])
  const where = whereNow(schedule, tick)
  const todayPlan = planFor(schedule, planDay(tick))
  const [sel, setSel] = useState(null)
  const plan = schedule.plans.find(p => p.id === sel) || todayPlan || schedule.plans[0]
  const isToday = plan?.id === todayPlan?.id
  const mins = healthMinutes(tick)
  const rows = sortRows(plan?.rows || [])
  const holes = uncoveredDays(schedule)
  // Phone reminders follow every change (and each open): ids 5000 to 5199 (lib/schedule-reminders.js).
  const key = JSON.stringify(schedule)
  useEffect(() => { if (MOBILE) syncScheduleReminders(schedule, planDay()).catch(() => {}) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const timeline = []
  let lineShown = false
  rows.forEach(r => {
    if (isToday && !lineShown && dayMinutes(r.time) > mins) {
      lineShown = true
      timeline.push(<div key="now" className="sched-now" aria-hidden="true"><span>{t('Now')}</span></div>)
    }
    const cur = isToday && where.now?.id === r.id
    const past = isToday && !cur && dayMinutes(r.time) <= mins
    timeline.push(<button key={r.id} type="button" className={'sched-row' + (cur ? ' cur' : '') + (past ? ' past' : '')}
      style={{ '--row-tint': KIND_TINT[r.kind] }} onClick={() => rowSheet(plan.id, r)} aria-current={cur ? 'step' : undefined}>
      <span className="sched-time">{r.time}</span>
      <span className="sched-ico"><Icon name={KIND_ICON[r.kind]} /></span>
      <span className="sched-txt"><span className="tt">{r.label}</span>{(r.note || cur) && <span className="ss">{cur ? t('Now') + (r.note ? ' · ' + r.note : '') : r.note}</span>}</span>
      <Icon name="chevronRight" className="chev" />
    </button>)
  })
  if (isToday && !lineShown && rows.length) timeline.push(<div key="now" className="sched-now" aria-hidden="true"><span>{t('Now')}</span></div>)

  const duplicate = () => {
    const { schedule: next, id } = duplicatePlan(schedule, plan.id, t('{0} copy', plan.name))
    if (!id) { toast(t('That is as many plans as fit')); return }
    save(next); setSel(id)
    toast(t('Copied. Pick the days it covers.'))
  }
  const reset = () => confirmSheet({
    title: t('Reset to default?'), message: t('Every plan goes back to the one Shift 2pm-11pm plan on all days.'), confirmText: t('Reset'), danger: true,
    onConfirm: () => { save(defaultSchedule()); setSel(null); toast(t('Back to the default plan')) },
  })
  const del = () => confirmSheet({
    title: t('Delete this plan?'), message: t('“{0}” and its rows will be removed. Its days go back to the first plan.', plan.name), confirmText: t('Delete'), danger: true,
    onConfirm: () => { save(removePlan(schedule, plan.id)); setSel(null) },
  })

  return <div className="narrow schedule-view">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}>
        <h1>{t('Daily timing plan')}</h1>
        <div className="sub">{where.next ? t('Next: {0} at {1}, in {2}', where.next.label, where.next.time, fmtLeft(where.minutesLeft)) : t('Your day, hour by hour')}</div>
      </div>
    </div>

    {schedule.plans.length > 1 && <div className="chips sched-plans" role="tablist" aria-label={t('Plans')}>
      {schedule.plans.map(p => <button key={p.id} type="button" role="tab" aria-selected={p.id === plan.id} className={'chip nocap' + (p.id === plan.id ? ' on' : '')} onClick={() => setSel(p.id)}>
        {p.name}{p.id === todayPlan?.id ? ' · ' + t('today') : ''}</button>)}
    </div>}

    <div className="card">
      <div className="row between" style={{ gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="small dim">{isToday ? t('Today’s plan') : t('Plan')}</div>
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-title3)', overflowWrap: 'anywhere' }}>{plan.name}</div>
        </div>
        <Button size="sm" variant="ghost" icon="pencil" onClick={() => useUI.getState().openSheet(close => <RenameSheet planId={plan.id} close={close} />)}>{t('Rename')}</Button>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{t('Days this plan covers')}</div>
      <div className="sched-days" role="group" aria-label={t('Days this plan covers')}>
        {ALL_DAYS.map(d => <button key={d} type="button" className={'sched-day' + (plan.days.includes(d) ? ' on' : '')} aria-pressed={plan.days.includes(d)}
          aria-label={t(DAYN[d])} onClick={() => save(toggleDay(schedule, plan.id, d))}>{t(DAYS[d])}</button>)}
      </div>
      {holes.length > 0 && <div className="small dim">{t('Days no plan covers use the first plan: {0}', holes.map(d => t(DAYS[d])).join(', '))}</div>}
    </div>

    <div className="card">
      <div className="sched-line">{timeline.length ? timeline : <div className="dim small">{t('No rows yet. Add your first one.')}</div>}</div>
      <div style={{ height: 10 }} />
      <Button variant="tinted" icon="plus" disabled={rows.length >= MAX_ROWS} onClick={() => rowSheet(plan.id, null)}>{t('Add row')}</Button>
      <div className="small dim" style={{ marginTop: 8 }}>{t('A day runs from 04:00 to 04:00, so 01:30 sleep belongs to the day before.')}</div>
    </div>

    {MOBILE && <div className="card">
      <div className="row between" style={{ gap: 12 }}>
        <div><div style={{ fontWeight: 600 }}>{t('Phone reminders')}</div><div className="small dim">{t('A notification at each row. Switch single rows off in the row.')}</div></div>
        <Switch checked={schedule.remind} aria-label={t('Phone reminders')} onChange={v => {
          const next = { ...schedule, remind: v }
          save(next)
          syncScheduleReminders(next, planDay(), true).catch(() => {})
        }} />
      </div>
    </div>}

    <div className="sched-actions" style={{ marginBottom: 24 }}>
      <Button variant="tinted" icon="copy" onClick={duplicate}>{t('Duplicate')}</Button>
      <Button variant="ghost" icon="reset" onClick={reset}>{t('Reset to default')}</Button>
      {schedule.plans.length > 1 && <Button variant="ghost" icon="trash" onClick={del}>{t('Delete plan')}</Button>}
    </div>
  </div>
}
