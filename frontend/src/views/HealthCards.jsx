import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { healthDay } from '../lib/ist.js'
import { TARGETS, dayTypeOf } from '../lib/diet-plan.js'
import { checklist, pendingCount, phaseOf } from '../lib/supplements.js'
import { syncSupplementReminders } from '../lib/supp-reminders.js'
import { useDietDay, useSupplements, useHealthOn, useDietTargets } from './health-data.js'
import { Totals, Flags, litres, D3Card, ChallengeLine } from '../components/HealthParts.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import './health.css'

/* Home (our addition): today's macros and water, and the supplements still to take, with the D3
   Sunday card on top on a dose day. Nothing shows unless signed in to a server. */

function DietHomeCard({ day }) {
  const nav = useNavigate()
  const d = useDietDay(day)
  // Protein from body weight, the same helper as the Diet screen (lib/diet-targets.js).
  const targets = useDietTargets(d.data?.prefs, dayTypeOf(day, d.data?.dayType))
  if (!d.data) return null
  const s = d.data
  return <div className="card tap-host">
    <CardHead icon="leaf" tint="var(--green)" eyebrow={t('Diet')} title={t('Today’s macros')} open={{ onClick: () => nav('/diet') }}
      action={<Icon name="chevronRight" className="chev" />} />
    {/* The 40-day pure veg run (lib/diet-track.js): day N of 40, then stay veg or switch back. */}
    <ChallengeLine prefs={s.prefs} day={day} onPrefs={body => d.post('/api/health/diet/prefs', body)} />
    <Totals totals={s.totals} targets={targets} compact />
    <div className="hl-bar-h" style={{ marginTop: 10 }}>
      <span className="hl-l"><Icon name="drop" /> {t('Water')}</span>
      <span className="hl-v">{litres(s.water)}<small> / {TARGETS.waterMin / 1000} to {TARGETS.waterMax / 1000} L</small></span>
    </div>
    <div className="hl-track"><div className={'hl-fill' + (s.water >= TARGETS.waterMin ? ' ok' : '')} style={{ width: Math.min(100, (s.water / TARGETS.waterMax) * 100).toFixed(1) + '%' }} /></div>
    <Flags totals={s.totals} targets={targets} />
  </div>
}

function SuppHomeCard({ day }) {
  const nav = useNavigate()
  const sp = useSupplements()
  const data = sp.data
  useEffect(() => { if (data) syncSupplementReminders(data.list, data.log, day).catch(() => {}) }, [data, day])
  if (!data) return null
  const items = checklist(data.list, data.log, day, dayTypeOf(day))
  const pending = items.filter(i => i.status === 'pending')
  const phase = phaseOf(data.list, data.log, day)
  const d3Pending = phase?.dueToday && pending.some(i => i.s.id === phase.s.id)
  return <>
    {/* Sunday D3: the one that must not be missed or doubled, on top while it is still to take. */}
    {d3Pending && <div {...tappable(() => nav('/supplements'))}><D3Card p={phase} compact /></div>}
    <div className="card tap-host">
      <CardHead icon="pill" tint="var(--purple)" eyebrow={t('Supplements')}
        title={pendingCount(items) ? t('{0} to take', pendingCount(items)) : t('All done today')}
        sub={pending.length ? pending.map(i => i.s.name).join(', ') : undefined}
        open={{ onClick: () => nav('/supplements') }} action={<Icon name="chevronRight" className="chev" />} />
      {phase?.missedLast && <div className="hl-flag"><Icon name="warning" /><span>{t('D3 was missed. Do not double up.')}</span></div>}
    </div>
  </>
}

export function HealthHomeCards() {
  const on = useHealthOn()
  const [day, setDay] = useState(() => healthDay())
  useEffect(() => { const id = setInterval(() => setDay(healthDay()), 60000); return () => clearInterval(id) }, [])
  if (!on) return null
  return <><SuppHomeCard day={day} /><DietHomeCard day={day} /></>
}
