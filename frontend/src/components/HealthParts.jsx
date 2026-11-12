import { t, dateLocale } from '../lib/i18n.js'
import { TARGETS } from '../lib/diet-plan.js'
import { dietFlags } from '../lib/diet-flags.js'
import { healthMinutes } from '../lib/ist.js'
import { challengeOf, challengeLine, stayVegBody, trackBody } from '../lib/diet-track.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import CardHead from './CardHead.jsx'
import '../views/health.css'

/* Pieces the Diet and Supplements screens share with their Home cards (our addition), kept apart
   from the screens so Home does not pull them into the first bundle. A missing value is a dash. */

export const DASH = '–'
export const n0 = v => (v == null ? DASH : String(Math.round(v)))
export const n1 = v => (v == null ? DASH : String(Math.round(v * 10) / 10))
export const litres = ml => (Math.round((ml || 0) / 100) / 10).toFixed(1)

/** One macro against its target: label small and dim, the number big, a bar under it. */
export function MacroBar({ label, value, target, unit = 'g', max = false, under = false, digits = 0 }) {
  const f = value == null || !target ? 0 : Math.min(1, value / target)
  const cls = max ? (value > target ? ' over' : ' ok') : value >= target ? ' ok' : ''
  return <div>
    <div className="hl-bar-h">
      <span className="hl-l">{label}</span>
      <span className="hl-v">{digits ? n1(value) : n0(value)}<small> / {under ? t('under {0} {1}', target, unit) : `${max ? '≤ ' : ''}${target} ${unit}`}</small></span>
    </div>
    <div className="hl-track"><div className={'hl-fill' + cls} style={{ width: (f * 100).toFixed(1) + '%' }} /></div>
  </div>
}

/** The day's bars against `targets` (lib/diet-targets.js dietTargets; the plan's TARGETS without). */
export function Totals({ totals, compact = false, targets = TARGETS }) {
  const tt = totals || {}
  const T = targets || TARGETS
  return <div className="hl-bars">
    <MacroBar label={t('Protein')} value={tt.protein} target={T.protein} />
    <MacroBar label={t('Calories')} value={tt.kcal} target={T.kcal} unit="kcal" />
    <MacroBar label={t('Fibre')} value={tt.fiber} target={T.fiber} digits={1} />
    {/* Carbs are a ceiling (the triglyceride lever), so they show on the Home card too. */}
    <MacroBar label={t('Carbs')} value={tt.carbs} target={T.carbs} max under />
    {!compact && <>
      <MacroBar label={t('Fat (mostly unsaturated)')} value={tt.fat} target={T.fat} />
      <MacroBar label={tt.unknown?.satFat ? t('Saturated fat (partial)') : t('Saturated fat')} value={tt.satFat} target={T.satFatMax} max digits={1} />
    </>}
  </div>
}

/** "Pure veg: day N of 40", and once the days are done the question with both answers. */
export function ChallengeLine({ prefs, day, onPrefs }) {
  const ch = challengeOf(prefs, day)
  const line = challengeLine(ch)
  if (!line) return null
  return <div style={{ marginTop: 8 }}>
    <div className="hl-l"><Icon name="leaf" /> {t(...line)}</div>
    {ch.done && onPrefs && <div className="hl-row2">
      <Button size="sm" variant="tinted" onClick={() => onPrefs(stayVegBody())}>{t('Stay veg')}</Button>
      <Button size="sm" onClick={() => onPrefs(trackBody('nonveg'))}>{t('Switch back to non-veg')}</Button>
    </div>}
  </div>
}

export function Flags({ totals, targets }) {
  const flags = dietFlags(totals, healthMinutes(), targets)
  return flags.map(f => <div key={f.id} className="hl-flag" role="status"><Icon name="warning" /><span>{t(f.text, f.need)}</span></div>)
}

export const shortDay = day => new Date(day + 'T12:00:00Z').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })

/** The D3 phase card: which of the weekly doses are done, then the monthly rhythm. */
/** The dose days (weekly and monthly) that read missed: the ones a one-tap catch-up marks taken. */
export const missedDays = p => [...(p.weekly || []), ...(p.monthly || [])].filter(d => d.status === 'missed').map(d => d.day)

export function D3Card({ p, onMark, onMarkAll, compact = false }) {
  const label = { taken: t('Taken'), skipped: t('Skipped'), missed: t('Missed'), due: t('Today'), upcoming: t('Upcoming') }
  return <div className={'card' + (p.dueToday ? ' hl-d3' : '')}>
    <CardHead icon="sun" tint="var(--orange)" eyebrow={p.s.name}
      title={p.dueToday ? (p.firstSunday ? t('D3 tonight, with dinner') : t('D3 tonight, after dinner')) : t('Next dose {0}', shortDay(p.next))}
      sub={p.phase === 'weekly' ? t('Weekly phase: {0} of {1} taken', p.taken, p.weekly.length)
        : p.firstSunday ? t('Monthly now: the first Sunday of each month, with dinner. No more weekly doses.')
        : t('Monthly now: every {0} days, on Sunday', p.everyDays)} />
    {!compact && <div className="hl-dots" aria-label={t('Weekly doses')}>
      {p.weekly.map(w => <button key={w.day} type="button" className={'hl-dot ' + w.status} disabled={w.status === 'upcoming'}
        aria-label={`${w.n}: ${shortDay(w.day)}, ${label[w.status]}`} title={`${shortDay(w.day)}: ${label[w.status]}`}
        onClick={() => onMark?.(w.day, w.status === 'taken' ? null : 'taken')}>{w.n}</button>)}
    </div>}
    {!compact && p.monthly.length > 0 && <div className="hl-dim">{t('Monthly doses: {0}', p.monthly.map(m => `${shortDay(m.day)} ${label[m.status].toLowerCase()}`).join(', '))}</div>}
    {p.dueToday && <div className="hl-row2"><span className="hl-badge"><Icon name="flame" />{t('Requires fat')}</span></div>}
    {!compact && onMarkAll && missedDays(p).length > 0 && <button type="button" className="hl-markall" onClick={() => onMarkAll(missedDays(p))}>
      <Icon name="check" />{t('I took the past doses: mark {0} as taken', missedDays(p).length)}</button>}
    {p.missedLast && <div className="hl-flag"><Icon name="warning" /><span>{t('The {0} dose was missed. Do not double up: take the next one on schedule.', shortDay(p.missedLast))}</span></div>}
    {p.s.warning && <div className="hl-warn" style={{ marginTop: 6 }}>{p.s.warning}</div>}
  </div>
}
