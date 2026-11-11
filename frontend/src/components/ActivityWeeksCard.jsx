// Stats → Overview → Weekly activity (our addition, lib/activity-weeks.js): minutes a week for
// the last 12 weeks, every workout counted, Whoop and Cult classes included, with Whoop's strain
// beside each week that has one, and this week in one line on top.
import { useMemo } from 'react'
import { t } from '../lib/i18n.js'
import { fmtNum, fmtDate, todayISO, weekStartOf } from '../lib/format.js'
import { activityWeeks } from '../lib/activity-weeks.js'
import { BarRow } from './StatBars.jsx'

export function thisWeekLine(row) {
  if (!row || !row.sessions) return t('This week: no sessions yet.')
  const parts = [
    row.sessions === 1 ? t('1 session') : t('{0} sessions', row.sessions),
    t('{0} min', fmtNum(row.minutes)),
  ]
  if (row.avgStrain != null) parts.push(t('avg strain {0}', fmtNum(row.avgStrain)))
  return t('This week: {0}', parts.join(', '))
}

export default function ActivityWeeksCard({ S, today = todayISO() }) {
  const weeks = useMemo(() => activityWeeks(S.workouts, { today, ws: weekStartOf(S) }), [S.workouts, S.weekStart, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...weeks.map(w => w.minutes))
  const anyStrain = weeks.some(w => w.strainN > 0)
  const now = weeks[weeks.length - 1]
  return <div className="card" data-activity-weeks>
    <h2>{t('Weekly activity')}</h2>
    <div className="small" data-activity-now style={{ marginBottom: 8 }}>{thisWeekLine(now)}</div>
    <div className="muted small" style={{ marginBottom: 8 }}>{t('Minutes a week, every workout counted, Whoop and Cult classes too.')}</div>
    {[...weeks].reverse().map((w, i) => {
      const value = t('{0} min', fmtNum(w.minutes)) + (anyStrain && w.strainN ? ' · ' + t('strain {0}', fmtNum(w.strain)) : '')
      return <BarRow key={w.week} label={i === 0 ? t('This week') : fmtDate(w.week)} value={value}
        fill={w.minutes / max} tone={i === 0 ? 'acc' : 'neutral'}
        ariaLabel={(i === 0 ? t('This week') : fmtDate(w.week)) + ': ' + value + ', ' + (w.sessions === 1 ? t('1 session') : t('{0} sessions', w.sessions))} />
    })}
  </div>
}
