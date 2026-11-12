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
import { goalCurrent, goalProgress, nextTests, homeTests } from '../lib/medical.js'
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

/** When a next test is due, as words. */
export function testWhen(x) {
  const d = iso => fmtDate(iso, false, true)
  if (x.status === 'done') return t('Done {0}', d(x.done))
  if (x.status === 'anytime') return t('Any time')
  if (x.status === 'overdue') return t('Overdue since {0}', d(x.to))
  if (x.to && x.to !== x.from) return t('Due {0} to {1}', d(x.from), d(x.to))
  return t('Due from {0}', d(x.from))
}

/* The next tests to book (lib/medical.js nextTests): the whole list with a tick on the Medical hub,
   the few that matter most on Home. A prominent one stands out until it is ticked. */
export function NextTests({ tests, today = todayISO(), compact = false, onTick }) {
  const list = compact ? homeTests(tests, today) : nextTests(tests, today)
  if (!list.length) return null
  return <div className={'med-tests' + (compact ? ' compact' : '')}>
    {list.map(x => {
      const loud = x.prominent && x.status !== 'done'
      return <div key={x.id} className={'med-test ' + x.status + (loud ? ' prominent' : '')} role={loud ? 'status' : undefined}>
        <Icon name={x.status === 'done' ? 'checkCircle' : loud || x.status === 'overdue' ? 'warning' : 'calendar'} />
        <span className="med-test-t">
          <b>{x.title}</b>
          <span className="small med-test-s">{testWhen(x)}{x.reason ? ' · ' + x.reason : ''}</span>
          {!compact && x.expect && <span className="small med-test-s">{t('Expected: {0}', x.expect)}</span>}
        </span>
        {onTick && <button type="button" className="linkbtn" onClick={e => { e.stopPropagation(); onTick(x) }}
          aria-label={(x.status === 'done' ? t('Undo') : t('Mark done')) + ': ' + x.title}>{x.status === 'done' ? t('Undo') : t('Mark done')}</button>}
      </div>
    })}
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
    <NextTests tests={data.tests} compact />
    {rows.length ? rows.map(r => <GoalBar key={r.goal.id} goal={r.goal} prog={r.prog} compact />)
      : <div className="dim small">{t('No goals yet.')}</div>}
  </div>
}
