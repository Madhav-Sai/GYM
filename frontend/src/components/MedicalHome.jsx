// Medical (this fork): the record from our own server and the Home card. The record lives on the
// server only (api/medical/), never in the synced state, so without a signed-in session there is
// nothing to show and the card stays away.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { DEMO } from '../lib/demo.js'
import { t } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { goalCurrent, goalProgress, retestReminder } from '../lib/medical.js'
import CardHead from './CardHead.jsx'
import Icon from './Icon.jsx'
import { GoalBar } from './MedicalCharts.jsx'
import './medical.css'

// One copy for every screen open at once: Home, the hub and a sheet all redraw from the same answer.
let cached = null
const listeners = new Set()
const publish = d => { cached = d; for (const l of listeners) l(d) }

export async function medicalCall(path, body) {
  const d = await api(path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
  publish(d)
  return d
}

/** The record, or null until it is known. `error` once the server could not be reached. */
export function useMedical() {
  const user = useStore(s => s.user)
  const enabled = !!user && !DEMO
  const [data, setData] = useState(cached)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null)
    return medicalCall('/api/medical').then(d => { setError(false); return d }).catch(() => { setError(true); return null })
  }, [enabled])
  useEffect(() => {
    listeners.add(setData)
    return () => { listeners.delete(setData) }
  }, [])
  useEffect(() => { load() }, [load])
  return { data: enabled ? data : null, error, load, enabled }
}

/** Each goal with where it stands today. */
export function goalRows(doc, S, today = todayISO()) {
  const ctx = { labs: doc?.labs || [], inbody: doc?.inbody || [], bodyweight: S?.bodyweight || [], unit: S?.unit || 'kg' }
  return (doc?.goals || []).map(g => {
    const cur = goalCurrent(g, ctx)
    return { goal: g, cur, prog: goalProgress(g, cur?.value ?? null, today) }
  })
}

export function RetestFlag({ labs, today = todayISO() }) {
  const r = retestReminder(labs, today)
  if (!r || !(r.due || r.soon)) return null
  return <div className={'med-retest' + (r.due ? ' due' : '')} role="status">
    <Icon name="warning" />
    <span><b>{t(r.text)}</b><span className="dim small"> · {r.due ? t('Due since {0}', fmtDate(r.dueDate, false, true)) : t('Due {0}', fmtDate(r.dueDate, false, true))}</span></span>
  </div>
}

export function MedicalHomeCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const { data } = useMedical()
  if (!data) return null
  const rows = goalRows(data, S)
  return <div className="card tap-host med-home">
    <CardHead icon="heart" tint="var(--pink)" eyebrow={t('Medical')} title={t('Goals')}
      open={{ onClick: () => nav('/medical') }} action={<Icon name="chevronRight" className="chev" />} />
    <RetestFlag labs={data.labs} />
    {rows.length ? rows.map(r => <GoalBar key={r.goal.id} goal={r.goal} prog={r.prog} compact />)
      : <div className="dim small">{t('No goals yet.')}</div>}
  </div>
}
