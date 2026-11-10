import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { FOODS, foodById, entryFor, amountLabel, macrosFor } from '../lib/diet-foods.js'
import { SLOTS, TARGETS, planFor, dayTypeOf, nonNegotiables } from '../lib/diet-plan.js'
import { altsFor, proteinSwap, signed } from '../lib/diet-swap.js'
import { healthDay } from '../lib/ist.js'
import { useDietDay, useHealthOn } from './health-data.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import { Section, Row, Button, Switch, Segmented, NumberField, TextField, SearchField } from '../components/ui.jsx'
import { DASH, n0, n1, litres, Totals, Flags } from '../components/HealthParts.jsx'
import './health.css'

/* Diet (our addition): today's plan by meal, tap an item when it is eaten, log anything else by
   grams, water in 250 ml taps, and the day's totals against the targets. India time throughout
   (lib/ist.js); the log lives on the server (GET /api/health/diet). */

const DAY_TYPE_LABEL = { training: 'Training', cardio: 'Cardio', rest: 'Rest' }


function Water({ ml, onAdd }) {
  const f = Math.min(1, (ml || 0) / TARGETS.waterMax)
  return <div className="card">
    <div className="hl-bar-h">
      <span className="hl-l"><Icon name="drop" /> {t('Water')}</span>
      <span className="hl-dim">{t('Target {0} to {1} L', TARGETS.waterMin / 1000, TARGETS.waterMax / 1000)}</span>
    </div>
    <div className="hl-big">{litres(ml)}<small>L</small></div>
    <div className="hl-track"><div className={'hl-fill' + ((ml || 0) >= TARGETS.waterMin ? ' ok' : '')} style={{ width: (f * 100).toFixed(1) + '%' }} /></div>
    <div className="hl-row2">
      <Button size="sm" icon="minus" disabled={!ml} onClick={() => onAdd(-250)}>250 ml</Button>
      <Button size="sm" variant="tinted" icon="plus" onClick={() => onAdd(250)}>250 ml</Button>
    </div>
  </div>
}

function PlanItem({ item, logged, onToggle }) {
  const food = foodById(logged?.foodId || item.foodId)
  const qty = logged ? logged.qty : item.qty
  const m = logged || macrosFor(food, qty)
  const from = item.swappedFrom && foodById(item.swappedFrom.foodId)
  return <button type="button" className={'hl-item' + (logged ? ' on' : '')} onClick={onToggle} aria-pressed={!!logged}>
    <span className="hl-ck"><Icon name="check" /></span>
    <span className="hl-m">
      <span className="hl-nm">{logged?.name || food.name}</span>
      <span className="hl-sub">{amountLabel(food, qty)}</span>
      {from && !logged && <span className="hl-swap">{t('Instead of {0}: {1} kcal, {2} g protein', `${amountLabel(from, item.swappedFrom.qty)} ${from.name.toLowerCase()}`, signed(item.delta.kcal), signed(item.delta.protein))}</span>}
    </span>
    <span className="hl-r"><b>{n0(m.kcal)}</b>{n1(m.protein)} g P</span>
  </button>
}

function Meal({ slot, items, entries, veg, onVeg, onToggle, onRemove, onAdd }) {
  const planKeys = new Set(items.map(i => i.key))
  const extra = entries.filter(e => e.slot === slot.id && !planKeys.has(e.planKey))
  const hasNonVeg = items.some(i => i.swappedFrom || !foodById(i.foodId)?.veg)
  return <div className="card">
    <div className="hl-meal-h">
      <span className="hl-time">{slot.time}</span>
      <span className="hl-meal-t"><b>{t(slot.title)}</b>{slot.note && <span className="hl-dim">{t(slot.note)}</span>}</span>
      {hasNonVeg && <label className="hl-veg"><Icon name="leaf" />{t('Veg')}<Switch checked={veg} onChange={onVeg} aria-label={t('Veg for this meal')} /></label>}
    </div>
    {items.map(i => <PlanItem key={i.key} item={i} logged={entries.find(e => e.planKey === i.key)} onToggle={() => onToggle(i)} />)}
    {extra.map(e => <button key={e.id} type="button" className="hl-item on" onClick={() => onRemove(e)} aria-label={t('Remove {0}', e.name)}>
      <span className="hl-ck"><Icon name="check" /></span>
      <span className="hl-m"><span className="hl-nm">{e.name}</span><span className="hl-sub">{e.qty} {e.unit} · {t('tap to remove')}</span></span>
      <span className="hl-r"><b>{n0(e.kcal)}</b>{n1(e.protein)} g P</span>
    </button>)}
    <Button size="sm" variant="ghost" icon="plus" onClick={onAdd}>{t('Add food')}</Button>
  </div>
}

/* ---------- log a food: from the database by grams, or a custom one ---------- */
function LogFoodSheet({ close, slot: slot0, onLog }) {
  const [mode, setMode] = useState('db')
  const [q, setQ] = useState('')
  const [food, setFood] = useState(null)
  const [qty, setQty] = useState(100)
  const [slot, setSlot] = useState(slot0 || 'other')
  const [c, setC] = useState({ name: '', qty: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, satFat: null })
  const list = useMemo(() => FOODS.filter(f => f.name.toLowerCase().includes(q.trim().toLowerCase())), [q])
  const pick = f => { setFood(f); setQty(f.unit === 'g' || f.unit === 'ml' ? 100 : 1) }
  const m = food ? macrosFor(food, qty) : null
  const slots = [...SLOTS.map(s => ({ value: s.id, label: s.time })), { value: 'other', label: t('Other') }]
  const log = async () => {
    const entry = mode === 'db' ? entryFor(food, qty, slot) : { ...c, unit: 'g', slot, omega3: null }
    if (mode === 'custom' && (!c.name.trim() || !c.qty)) { useUI.getState().toast(t('Give it a name and an amount')); return }
    if (await onLog(entry)) close()
  }
  return <>
    <h3>{t('Log food')}</h3>
    <Segmented options={[{ value: 'db', label: t('From the list') }, { value: 'custom', label: t('Custom') }]} value={mode} onChange={setMode} />
    <div className="hl-field"><span>{t('Meal')}</span>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {slots.map(s => <button key={s.value} type="button" className={'chip' + (slot === s.value ? ' on' : '')} aria-pressed={slot === s.value} onClick={() => setSlot(s.value)}>{s.label}</button>)}
      </div>
    </div>
    {mode === 'db' ? <>
      {!food ? <>
        <div style={{ height: 10 }} />
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search foods')} />
        <div className="hl-foods">
          {list.map(f => <Row key={f.id} title={f.name} subtitle={`${f.kcal} kcal · ${f.protein} g P · ${t('per {0}', f.per === 1 ? f.unit : f.per + ' ' + f.unit)}`} onClick={() => pick(f)} accessory="chevron">
            {!f.veg && <span className="hl-badge">{t('Non-veg')}</span>}
          </Row>)}
        </div>
      </> : <>
        <Section><Row title={food.name} subtitle={t('per {0}', food.per === 1 ? food.unit : food.per + ' ' + food.unit)} value={t('Change')} onClick={() => setFood(null)} /></Section>
        <div className="hl-field"><span>{t('Amount ({0})', food.unit)}</span><NumberField value={qty} onChange={setQty} /></div>
        <div className="hl-grid3" style={{ marginTop: 12 }}>
          <div><div className="hl-l">kcal</div><div className="hl-n">{n0(m.kcal)}</div></div>
          <div><div className="hl-l">{t('Protein')}</div><div className="hl-n">{n1(m.protein)}<small>g</small></div></div>
          <div><div className="hl-l">{t('Fibre')}</div><div className="hl-n">{n1(m.fiber)}<small>g</small></div></div>
        </div>
        {altsFor(food.id).map(a => { const s = proteinSwap(food.id, qty, a); return s && <div key={a} className="hl-swap" style={{ marginTop: 6 }}>
          {t('Veg swap: {0} {1}, {2} kcal, {3} g protein', amountLabel(s.to.food, s.to.qty), s.to.food.name.toLowerCase(), signed(s.delta.kcal), signed(s.delta.protein))}
        </div> })}
        {food.approx && <div className="hl-dim" style={{ marginTop: 6 }}>{t('Approximate values. Check your tub’s label.')}</div>}
      </>}
    </> : <>
      <div className="hl-field"><span>{t('Name')}</span><TextField value={c.name} maxLength={80} onChange={e => setC({ ...c, name: e.target.value })} /></div>
      <div className="hl-grid2">
        <div className="hl-field"><span>{t('Grams')}</span><NumberField value={c.qty} onChange={v => setC({ ...c, qty: v })} /></div>
        <div className="hl-field"><span>kcal</span><NumberField value={c.kcal} onChange={v => setC({ ...c, kcal: v })} /></div>
        <div className="hl-field"><span>{t('Protein (g)')}</span><NumberField value={c.protein} onChange={v => setC({ ...c, protein: v })} /></div>
        <div className="hl-field"><span>{t('Carbs (g)')}</span><NumberField value={c.carbs} onChange={v => setC({ ...c, carbs: v })} /></div>
        <div className="hl-field"><span>{t('Fat (g)')}</span><NumberField value={c.fat} onChange={v => setC({ ...c, fat: v })} /></div>
        <div className="hl-field"><span>{t('Fibre (g)')}</span><NumberField value={c.fiber} onChange={v => setC({ ...c, fiber: v })} /></div>
        <div className="hl-field"><span>{t('Saturated fat (g)')}</span><NumberField nullable value={c.satFat} onChange={v => setC({ ...c, satFat: v })} placeholder={DASH} /></div>
      </div>
      <div className="hl-dim" style={{ marginTop: 6 }}>{t('Numbers for the whole amount. Leave saturated fat empty if you do not know it.')}</div>
    </>}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="check" disabled={mode === 'db' && (!food || !qty)} onClick={log}>{t('Log it')}</Button>
  </>
}

function Shell({ nav, children, sub }) {
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Diet')}</h1><div className="sub">{sub || t('Today')}</div></div>
      <button className="iconbtn" onClick={() => nav('/supplements')} aria-label={t('Supplements')}><Icon name="pill" /></button>
    </div>
    {children}
  </div>
}

export default function Diet() {
  const nav = useNavigate()
  const on = useHealthOn()
  const [day, setDay] = useState(() => healthDay())
  // Past 04:00 India time a screen left open moves on to the new day.
  useEffect(() => { const id = setInterval(() => setDay(healthDay()), 60000); return () => clearInterval(id) }, [])
  const d = useDietDay(day, on)
  const data = d.data
  const type = dayTypeOf(day, data?.dayType)
  const veg = !!data?.prefs?.veg
  const plan = useMemo(() => planFor(type, { veg, vegMeals: data?.vegMeals || {} }), [type, veg, data?.vegMeals])
  const entries = data?.entries || []

  if (!on) return <Shell nav={nav}><div className="empty">{t('Sign in to your server to keep a diet log.')}</div></Shell>
  if (!data) return <Shell nav={nav}>{d.error ? <div className="empty" role="alert">{t('Could not reach your server')}</div> : <div className="empty">{t('Loading…')}</div>}</Shell>

  const post = (path, body) => d.post('/api/health/diet/' + path, { day, ...body })
  const toggle = (slot, item) => {
    const logged = entries.find(e => e.planKey === item.key)
    if (logged) return post('unlog', { id: item.key })
    return post('log', { entry: entryFor(foodById(item.foodId), item.qty, slot, item.key) })
  }
  const openLog = slot => useUI.getState().openSheet(close => <LogFoodSheet close={close} slot={slot} onLog={entry => post('log', { entry })} />)
  const auto = dayTypeOf(day)
  const checks = nonNegotiables(entries, data.water)

  return <Shell nav={nav} sub={`${t(DAY_TYPE_LABEL[type])} · ${new Date(day + 'T12:00:00Z').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short' })}`}>
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="hl-l">{t('Protein')}</div>
          <div className="hl-big">{n0(data.totals.protein)}<small>/ {TARGETS.protein} g</small></div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div className="hl-l">{t('Calories')}</div>
          <div className="hl-n">{n0(data.totals.kcal)}<small>/ {TARGETS.kcal}</small></div>
        </div>
      </div>
      <Totals totals={data.totals} />
      <Flags totals={data.totals} />
    </div>

    <Water ml={data.water} onAdd={ml => post('water', { ml })} />

    <Section title={t('Day')}>
      <div style={{ padding: '10px 12px' }}>
        <Segmented options={['training', 'cardio', 'rest'].map(v => ({ value: v, label: t(DAY_TYPE_LABEL[v]) }))} value={type}
          onChange={v => post('day', { dayType: v === auto ? null : v })} />
        <div className="hl-dim" style={{ marginTop: 6 }}>{t('By weekday this is a {0} day.', t(DAY_TYPE_LABEL[auto]).toLowerCase())}</div>
      </div>
      <Row icon="leaf" iconTint="var(--green)" title={t('Vegetarian today')} subtitle={t('Swaps each non-veg item for the same protein')}>
        <Switch checked={veg} onChange={v => d.post('/api/health/diet/prefs', { veg: v })} aria-label={t('Vegetarian today')} />
      </Row>
    </Section>

    <div className="card">
      <CardHead icon="checkCircle" tint="var(--green)" title={t('Non-negotiables')} sub={t('{0} of {1} done', checks.filter(c => c.done).length, checks.length)} />
      <div className="hl-checks">
        {checks.map(c => <div key={c.id} className={'hl-check' + (c.done ? ' done' : '')}><Icon name={c.done ? 'checkCircle' : 'dot'} /><span>{t(c.label)}</span></div>)}
      </div>
    </div>

    {SLOTS.map(s => <Meal key={s.id} slot={s} items={plan[s.id]} entries={entries}
      veg={data.vegMeals?.[s.id] ?? veg}
      onVeg={v => post('day', { vegMeals: { [s.id]: v === veg ? null : v } })}
      onToggle={item => toggle(s.id, item)}
      onRemove={e => post('unlog', { id: e.id })}
      onAdd={() => openLog(s.id)} />)}

    {entries.some(e => e.slot === 'other') && <Section title={t('Other')}>
      {entries.filter(e => e.slot === 'other').map(e => <Row key={e.id} title={e.name} subtitle={`${e.qty} ${e.unit} · ${n0(e.kcal)} kcal · ${n1(e.protein)} g P`} onClick={() => post('unlog', { id: e.id })} value={t('Remove')} />)}
    </Section>}
    <Button variant="primary" icon="plus" onClick={() => openLog('other')}>{t('Log food')}</Button>
    <div style={{ height: 16 }} />
  </Shell>
}
