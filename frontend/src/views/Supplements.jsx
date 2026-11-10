import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { healthDay, weekdayOf } from '../lib/ist.js'
import { dayTypeOf } from '../lib/diet-plan.js'
import { checklist, adherence, phaseOf, pendingCount, ADHERENCE_DAYS, FAT_SOURCES } from '../lib/supplements.js'
import { syncSupplementReminders } from '../lib/supp-reminders.js'
import { useSupplements, useHealthOn } from './health-data.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import { Section, Row, Button, Switch, Segmented, TextField } from '../components/ui.jsx'
import { shortDay, D3Card } from '../components/HealthParts.jsx'
import './health.css'

/* Supplements (our addition): today's checklist (taken, or skipped with a reason), the vitamin D3
   loading phase (8 weekly Sundays, then every 4 weeks), 30-day adherence, and the list itself.
   India time (lib/ist.js); the list and log live on the server (GET /api/health/supplements). */

const DASH = '–'
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function scheduleText(s) {
  const sch = s.schedule || {}
  if (sch.kind === 'phase') return t('Weekly x{0}, then every {1} days', sch.weeklyDoses, sch.everyDays)
  if (sch.kind === 'weekly') return t('Weekly on {0}', t(DOW[sch.dow ?? 0]))
  return t('Daily')
}


function SkipSheet({ close, name, onSkip }) {
  const [reason, setReason] = useState('')
  const quick = ['Forgot', 'Out of stock', 'Medication gap', 'Not feeling well']
  return <>
    <h3>{t('Skip {0}?', name)}</h3>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {quick.map(q => <button key={q} type="button" className={'chip' + (reason === t(q) ? ' on' : '')} onClick={() => setReason(t(q))}>{t(q)}</button>)}
    </div>
    <div className="hl-field"><span>{t('Reason')}</span><TextField value={reason} maxLength={120} onChange={e => setReason(e.target.value)} /></div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={async () => { if (await onSkip(reason)) close() }}>{t('Skip today')}</Button>
  </>
}

function EditSheet({ close, s, onSave }) {
  const [v, setV] = useState(() => ({ name: '', dose: '', timing: '', requiresFat: false, remind: '', warning: '', active: true, ...(s || {}), schedule: s?.schedule || { kind: 'daily' } }))
  const set = patch => setV(x => ({ ...x, ...patch }))
  const phase = v.schedule.kind === 'phase'
  return <>
    <h3>{s ? t('Edit supplement') : t('Add supplement')}</h3>
    <div className="hl-field"><span>{t('Name')}</span><TextField value={v.name} maxLength={80} onChange={e => set({ name: e.target.value })} /></div>
    <div className="hl-field"><span>{t('Dose')}</span><TextField value={v.dose} maxLength={80} onChange={e => set({ dose: e.target.value })} /></div>
    <div className="hl-field"><span>{t('When')}</span><TextField value={v.timing} maxLength={80} onChange={e => set({ timing: e.target.value })} /></div>
    {!phase && <div className="hl-field"><span>{t('Schedule')}</span>
      <Segmented options={[{ value: 'daily', label: t('Daily') }, { value: 'weekly', label: t('Weekly') }]} value={v.schedule.kind}
        onChange={k => set({ schedule: k === 'weekly' ? { kind: 'weekly', dow: v.schedule.dow ?? 0 } : { kind: 'daily' } })} />
      {v.schedule.kind === 'weekly' && <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {DOW.map((d, i) => <button key={d} type="button" className={'chip' + (v.schedule.dow === i ? ' on' : '')} onClick={() => set({ schedule: { kind: 'weekly', dow: i } })}>{t(d)}</button>)}
      </div>}
    </div>}
    {phase && <div className="hl-dim" style={{ marginTop: 8 }}>{scheduleText(v)}</div>}
    <div className="hl-field"><span>{t('Reminder (India time, empty for none)')}</span><TextField type="time" value={v.remind || ''} onChange={e => set({ remind: e.target.value })} /></div>
    <div className="hl-field"><span>{t('Warning')}</span><TextField value={v.warning || ''} maxLength={200} onChange={e => set({ warning: e.target.value })} /></div>
    <Section>
      <Row title={t('Requires fat')} subtitle={t('Take it with a meal that has fat')}><Switch checked={!!v.requiresFat} onChange={x => set({ requiresFat: x })} aria-label={t('Requires fat')} /></Row>
      <Row title={t('Active')} subtitle={t('Off keeps its history but takes it off the checklist')}><Switch checked={v.active !== false} onChange={x => set({ active: x })} aria-label={t('Active')} /></Row>
    </Section>
    <Button variant="primary" icon="check" disabled={!v.name.trim()} onClick={async () => {
      const body = { ...v, remind: v.remind || null }
      if (await onSave(body)) close()
    }}>{t('Save')}</Button>
  </>
}

export default function Supplements() {
  const nav = useNavigate()
  const on = useHealthOn()
  const [day, setDay] = useState(() => healthDay())
  const [fatOpen, setFatOpen] = useState(null)
  useEffect(() => { const id = setInterval(() => setDay(healthDay()), 60000); return () => clearInterval(id) }, [])
  const sp = useSupplements(on)
  const data = sp.data
  // Phone reminders follow the list and the log (lib/supp-reminders.js); never asks for permission here.
  useEffect(() => { if (data) syncSupplementReminders(data.list, data.log, day).catch(() => {}) }, [data, day])

  const head = <div className="hdr">
    <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Supplements')}</h1><div className="sub">{t(DOW[weekdayOf(day)])}, {shortDay(day)}</div></div>
    <button className="iconbtn" onClick={() => nav('/diet')} aria-label={t('Diet')}><Icon name="leaf" /></button>
  </div>
  if (!on) return <div className="narrow">{head}<div className="empty">{t('Sign in to your server to track supplements.')}</div></div>
  if (!data) return <div className="narrow">{head}<div className="empty" role={sp.error ? 'alert' : undefined}>{sp.error ? t('Could not reach your server') : t('Loading…')}</div></div>

  const type = dayTypeOf(day)
  const items = checklist(data.list, data.log, day, type)
  const phase = phaseOf(data.list, data.log, day)
  const mark = (id, status, reason, onDay = day) => sp.post('/api/health/supplements/mark', { day: onDay, id, status, reason })
  const save = supplement => sp.post('/api/health/supplements/save', { supplement })
  const skip = it => useUI.getState().openSheet(close => <SkipSheet close={close} name={it.s.name} onSkip={reason => mark(it.s.id, 'skipped', reason)} />)
  const edit = s => useUI.getState().openSheet(close => <EditSheet close={close} s={s} onSave={save} />)
  const pending = pendingCount(items)

  return <div className="narrow">
    {head}
    {phase && <D3Card p={phase} onMark={(d, status) => mark(phase.s.id, status, undefined, d)}
      onMarkAll={async days => { for (const d of days) await mark(phase.s.id, 'taken', undefined, d) }} />}

    <div className="card">
      <CardHead icon="pill" tint="var(--purple)" eyebrow={t('Today')} title={pending ? t('{0} to take', pending) : t('All done today')}
        sub={t('{0} day', t(type === 'training' ? 'Training' : type === 'cardio' ? 'Cardio' : 'Rest'))} />
      {items.map(it => <div key={it.s.id} className="hl-supp">
        <div className="hl-supp-h">
          <div className="hl-m">
            <b>{it.s.name}</b>
            <span className="hl-dim">{it.dose}{it.s.timing ? ' · ' + it.s.timing : ''}</span>
          </div>
          {it.s.requiresFat && <button type="button" className="hl-badge" aria-expanded={fatOpen === it.s.id}
            onClick={() => setFatOpen(fatOpen === it.s.id ? null : it.s.id)}><Icon name="flame" />{t('Requires fat')}</button>}
        </div>
        {fatOpen === it.s.id && <div className="hl-fat">
          <div className="hl-fat-h">{t('About 5 to 10 g of fat in the same meal is enough. Veg options:')}</div>
          {FAT_SOURCES.veg.map(([what, g]) => <div key={what} className="hl-fat-r"><span>{t(what)}</span><b>{g}</b></div>)}
          <div className="hl-fat-h">{t('Non-veg:')}</div>
          {FAT_SOURCES.nonVeg.map(([what, g]) => <div key={what} className="hl-fat-r"><span>{t(what)}</span><b>{g}</b></div>)}
        </div>}
        {it.s.warning && <div className="hl-warn">{it.s.warning}</div>}
        {it.s.note && <div className="hl-dim">{it.s.note}</div>}
        {it.status === 'pending' ? <div className="hl-row2">
          <Button size="sm" onClick={() => skip(it)}>{t('Skip')}</Button>
          <Button size="sm" variant="tinted" icon="check" onClick={() => mark(it.s.id, 'taken')}>{t('Taken')}</Button>
        </div> : <div className="row between" style={{ marginTop: 6 }}>
          <span className={'hl-st ' + it.status}>{it.status === 'taken' ? t('Taken') : it.reason ? t('Skipped: {0}', it.reason) : t('Skipped')}</span>
          <Button size="sm" variant="ghost" icon="undo" onClick={() => mark(it.s.id, null)}>{t('Undo')}</Button>
        </div>}
      </div>)}
      {!items.length && <div className="hl-dim">{t('Nothing due today.')}</div>}
    </div>

    <Section title={t('Last {0} days', ADHERENCE_DAYS)} footer={t('Taken out of due. A skip counts as not taken; today counts once it is marked.')}>
      {data.list.filter(s => s.active !== false).map(s => { const a = adherence(s, data.log, day); return <Row key={s.id} title={s.name} subtitle={a ? t('{0} of {1} doses', a.taken, a.due) : t('Nothing due yet')} value={a ? a.pct + '%' : DASH} /> })}
    </Section>

    <Section title={t('Your supplements')}>
      {data.list.map(s => <Row key={s.id} icon="pill" iconTint={s.active === false ? 'var(--grey)' : 'var(--purple)'} title={s.name}
        subtitle={(s.active === false ? t('Off') + ' · ' : '') + scheduleText(s) + (s.remind ? ' · ' + s.remind : '')} accessory="chevron" onClick={() => edit(s)} />)}
      <Row icon="plus" iconTint="var(--green)" title={t('Add supplement')} onClick={() => edit(null)} />
    </Section>

    {MOBILE && <Button icon="bell" onClick={async () => {
      const ok = await syncSupplementReminders(data.list, data.log, day, true)
      useUI.getState().toast(ok ? t('Reminders set for the next 7 days') : t('Notifications are off for myGym'))
    }}>{t('Set phone reminders')}</Button>}
    <div style={{ height: 16 }} />
  </div>
}
