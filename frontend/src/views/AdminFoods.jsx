import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { allFoods } from '../lib/diet-foods.js'
import { blankFood, foodProblem, foodSaveBody, FOOD_UNITS, FOOD_CATS } from '../lib/admin-data.js'
import { applyFoods, loadFoods, useFoods } from './health-data.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, TextField, SearchField, Switch, Segmented } from '../components/ui.jsx'
import '../admin.css'
import './health.css'

/* Admin → Foods (our addition): the Diet screen's food database for this instance. The built-in
   list ships with the app (lib/diet-foods.js); what is changed here is kept on the server
   (DATA_DIR/health/foods.json) and every profile's Diet screen uses it. English-only, like the
   rest of Admin. */

const errText = e => (e && e.message) || 'Could not reach the server'

function FoodSheet({ food, close, onSaved }) {
  const builtin = !!food?.builtin
  const [f, setF] = useState(() => ({ ...blankFood(), ...(food || {}), note: food?.note || '' }))
  const ids = useMemo(() => new Set(allFoods().map(x => x.id)), [])
  const vegOptions = useMemo(() => allFoods().filter(x => x.veg && x.id !== f.id), [f.id])
  const toast = useUI(s => s.toast)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const problem = foodProblem(f, ids)
  const save = async () => {
    if (problem) { toast(problem); return }
    const body = foodSaveBody(f, { builtin, original: food })
    if (builtin && Object.keys(body.food).length <= 1) { close(); return }
    try { const d = await api('/api/admin/foods/save', { method: 'POST', body: JSON.stringify(body) }); onSaved(d); toast('Saved'); close() }
    catch (e) { toast(errText(e)) }
  }
  const num = (k, label, nullable = false) => <div className="hl-field" key={k}><span>{label}</span>
    <NumberField nullable={nullable} value={f[k]} onChange={v => set(k, v)} placeholder={nullable ? '–' : undefined} aria-label={label} /></div>
  return <>
    <h3>{food ? (builtin ? 'Edit built-in food' : 'Edit food') : 'Add a food'}</h3>
    {builtin && <div className="adm-lead">Changes are kept on this server on top of the app’s own values. “Reset” in the list puts the built-in values back.</div>}
    <div className="hl-field"><span>Name</span><TextField value={f.name} maxLength={80} onChange={e => set('name', e.target.value)} aria-label="Name" /></div>
    <div className="hl-field"><span>Unit</span>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {FOOD_UNITS.map(u => <button key={u} type="button" className={'chip' + (f.unit === u ? ' on' : '')} aria-pressed={f.unit === u} onClick={() => set('unit', u)}>{u}</button>)}
      </div>
    </div>
    <div className="hl-grid2">
      {num('per', `Values are per (${f.unit})`)}
      {num('kcal', 'kcal')}
      {num('protein', 'Protein (g)')}
      {num('carbs', 'Carbs (g)')}
      {num('fat', 'Fat (g)')}
      {num('fiber', 'Fibre (g)')}
      {num('satFat', 'Saturated fat (g)', true)}
      {num('omega3', 'Omega-3 (mg)', true)}
    </div>
    <div className="adm-lead" style={{ marginTop: 6 }}>Leave saturated fat or omega-3 empty when the value is not known. It then shows as a dash, never as 0.</div>
    <div className="row between" style={{ margin: '8px 0' }}><span>Vegetarian</span><Switch checked={!!f.veg} onChange={v => set('veg', v)} aria-label="Vegetarian" /></div>
    {!f.veg && <div className="hl-field"><span>Veg alternative</span>
      <select className="num" value={f.vegAlt || ''} onChange={e => set('vegAlt', e.target.value || null)} aria-label="Veg alternative">
        <option value="">Default</option>
        {vegOptions.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select></div>}
    <div className="hl-field"><span>Group</span>
      <select className="num" value={f.cat || 'other'} onChange={e => set('cat', e.target.value)} aria-label="Group">
        {FOOD_CATS.map(c => <option key={c} value={c}>{c}</option>)}
      </select></div>
    <div className="hl-field"><span>Unit note</span><TextField value={f.note || ''} maxLength={80} placeholder="For example: 1 katori is about 150 g" onChange={e => set('note', e.target.value)} aria-label="Unit note" /></div>
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="check" onClick={save}>Save</Button>
  </>
}

export default function AdminFoods() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const toast = useUI(s => s.toast)
  const v = useFoods(false)
  const [q, setQ] = useState('')
  const [show, setShow] = useState('all')
  useEffect(() => { if (user?.admin) loadFoods({ force: true }) }, [user?.admin])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return allFoods().filter(f => (!needle || f.name.toLowerCase().includes(needle) || f.id.includes(needle))
      && (show === 'all' || (show === 'hidden' ? f.hidden : show === 'changed' ? (f.edited || !f.builtin) : true)))
  }, [q, show, v])
  if (!user?.admin) return null

  const post = async (path, body, done) => {
    try { const d = await api(path, { method: 'POST', body: JSON.stringify(body) }); applyFoods(d); if (done) toast(done) }
    catch (e) { toast(errText(e)) }
  }
  const edit = food => openSheet(close => <FoodSheet food={food} close={close} onSaved={applyFoods} />)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/admin" onClick={() => nav('/admin')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>Foods</h1>
        <div className="sub">{allFoods().length} foods · {allFoods().filter(f => f.hidden).length} hidden</div></div>
      <button className="iconbtn" onClick={() => edit(null)} aria-label="Add a food"><Icon name="plus" /></button>
    </div>
    <div className="adm-intro">The foods everyone on this server can log on the Diet screen. Values are per 100 g (or 100 ml) unless the unit says otherwise. Hiding a food only takes it out of the list: plans and old entries that use it still work.</div>
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search foods" />
    <div style={{ height: 10 }} />
    <Segmented options={[{ value: 'all', label: 'All' }, { value: 'changed', label: 'Changed' }, { value: 'hidden', label: 'Hidden' }]} value={show} onChange={setShow} />
    <div className="card" style={{ marginTop: 12 }}>
      <div className="list">
        {list.map(f => <div key={f.id} className="item" style={f.hidden ? { opacity: .55 } : null}>
          <div className="grow" onClick={() => edit(f)} style={{ cursor: 'pointer' }}>
            <div className="tt">{f.name}
              {!f.veg && <span className="adm-pill" style={{ marginInlineStart: 6 }}>non-veg</span>}
              {f.edited && <span className="adm-pill acc" style={{ marginInlineStart: 6 }}>edited</span>}
              {!f.builtin && <span className="adm-pill ok" style={{ marginInlineStart: 6 }}>added</span>}
              {f.hidden && <span className="adm-pill bad" style={{ marginInlineStart: 6 }}>hidden</span>}</div>
            <div className="ss">{f.kcal} kcal · {f.protein} g P · {f.carbs} g C · {f.fat} g F · {f.fiber} g fibre · per {f.per === 1 ? f.unit : f.per + ' ' + f.unit}{f.note ? ' · ' + f.note : ''}</div>
          </div>
          {f.edited && <Button size="sm" variant="ghost" onClick={() => post('/api/admin/foods/delete', { id: f.id, reset: true }, 'Built-in values back')}>Reset</Button>}
          <Button size="sm" variant="ghost" onClick={() => post('/api/admin/foods/delete', { id: f.id, restore: !!f.hidden }, f.hidden ? 'Offered again' : 'Hidden')}>{f.hidden ? 'Restore' : 'Hide'}</Button>
        </div>)}
        {!list.length && <div className="adm-empty">No food matches.</div>}
      </div>
    </div>
  </div>
}
