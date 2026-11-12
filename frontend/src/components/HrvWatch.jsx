// HRV watch for the split sleep (our addition): the card on the Whoop page and the flag on Home.
// The rules live in lib/hrv-watch.js; this file only draws them.
import { useMemo } from 'react'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { DASH } from '../lib/whoop.js'
import { hrvWatch, HRV_FLOOR } from '../lib/hrv-watch.js'
import Icon from './Icon.jsx'

// Written out so check-source-strings sees it; lib/hrv-watch.js HRV_ALERT_TEXT holds the same English.
const alertText = () => t('HRV under 45 for two weeks: the split sleep may be costing more than the 6 am slot. Consider moving the gym back to a single sleep block.')

const rhrLine = r => !r ? t('Resting heart rate: not enough days yet to compare.')
  : r.dir === 'flat' ? t('Resting heart rate {0} bpm, steady against the previous 2 weeks.', fmtNum(r.recent))
    : r.dir === 'up' ? t('Resting heart rate {0} bpm, up {1} on the previous 2 weeks.', fmtNum(r.recent), fmtNum(Math.abs(r.delta)))
      : t('Resting heart rate {0} bpm, down {1} on the previous 2 weeks.', fmtNum(r.recent), fmtNum(Math.abs(r.delta)))

/** The Whoop page: 7-day HRV average against the 45 ms floor, the two-week alert and the RHR trend. */
export function HrvWatchCard({ days }) {
  const w = useMemo(() => hrvWatch(days), [days])
  if (!w) return null
  return <div className="whd" style={{ marginTop: 10 }}>
    <div className="whd-h">{t('HRV watch')}</div>
    <div className="whd-card" data-testid="hrv-watch">
      <div className="whd-kvs">
        <div className="whd-kv"><span>{t('HRV, 7-day average')}</span><b style={w.below7 ? { color: 'var(--whd-r, var(--red))' } : undefined}>{w.avg7 != null ? fmtNum(Math.round(w.avg7)) + ' ms' : DASH}</b></div>
        <div className="whd-kv"><span>{t('Floor')}</span><b>{HRV_FLOOR} ms</b></div>
      </div>
      <div className="whd-note">{rhrLine(w.rhr)}</div>
      {w.alert && <div className="whd-note" role="alert" style={{ color: 'var(--whd-r, var(--red))', fontWeight: 600 }}>
        <Icon name="warning" /> {alertText()}
      </div>}
      {!w.alert && <div className="whd-note">{t('Two weeks with HRV under 45 on most days raises a flag here and on Home.')}</div>}
    </div>
  </div>
}

/** Home's Whoop card: the flag, only while the two-week alert is on. */
export function HrvHomeFlag({ days }) {
  const w = useMemo(() => hrvWatch(days), [days])
  if (!w?.alert) return null
  return <div className="wh-flag" role="alert" data-testid="hrv-flag"><Icon name="warning" /> {alertText()}</div>
}
