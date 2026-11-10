import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { ZONE_INK } from '../lib/whoop-view.js'
import { whoopSessionView, isWhoopWorkout, CULT_CLASSES, cultName, renameWorkout, NAME_MAX } from '../lib/whoop-import.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

/* Whoop workouts in History (our addition, lib/whoop-import.js): the badge on the History row, what
   Whoop measured in the session detail, and "Rename as Cult class". */

/** The small "Whoop" badge on a History row, for a workout that came from Whoop. */
export function WhoopBadge({ w }) {
  if (!isWhoopWorkout(w)) return null
  return <span className="pr" data-testid="whoop-badge" style={{ background: 'var(--surface-3)', color: 'var(--red)' }}><Icon name="heart" />Whoop</span>
}

const n = (v, dp = 0) => (v == null ? '–' : fmtNum(dp ? Math.round(v * 10 ** dp) / 10 ** dp : Math.round(v)))

/** The session detail of an imported workout: strain, heart rate, kcal, distance and the zone bar. */
export function WhoopSessionSection({ w }) {
  const v = whoopSessionView(w)
  if (!v) return null
  return <div data-testid="whoop-session" style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 12, background: 'var(--surface-2)' }}>
    <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
      <span className="row" style={{ gap: 6, fontWeight: 600 }}><Icon name="heart" style={{ color: 'var(--red)' }} />Whoop</span>
      <span className="small"><span className="dim">{t('Strain')}</span> <b>{n(v.strain, 1)}</b></span>
      <span className="small"><span className="dim">{t('Average HR')}</span> <b>{n(v.avgHr)}</b></span>
      <span className="small" data-testid="whoop-max" style={v.over ? { color: 'var(--red)' } : undefined}><span className={v.over ? undefined : 'dim'}>{t('Max HR')}</span> <b>{n(v.maxHr)}</b>{v.over && ' ⚠'}</span>
      <span className="small"><span className="dim">{t('Calories')}</span> <b>{n(v.kcal)}</b> {t('kcal')}</span>
      {v.km != null && <span className="small"><span className="dim">{t('Distance')}</span> <b>{fmtNum(v.km)}</b> km</span>}
    </div>
    {v.zones && <div data-testid="whoop-zones" role="img" aria-label={t('Heart rate zones')} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
      {v.zones.map((z, i) => z.share > 0 && <span key={i} title={t('Zone {0}: {1} min', i, Math.round(z.m))} style={{ width: (z.share * 100).toFixed(1) + '%', background: ZONE_INK[i] }} />)}
    </div>}
  </div>
}

function CultRename({ w, close }) {
  const update = useStore(s => s.update)
  const [text, setText] = useState('')
  const save = cls => {
    const name = cultName(cls)
    if (!name) return
    let changed = false
    update(s => { changed = renameWorkout(s, w.id, name) })
    close()
    if (changed) useUI.getState().toast(t('Renamed to {0}', name))
  }
  return <>
    <h3 style={{ marginBottom: 2 }}>{t('Rename as Cult class')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Cult classes reach myGym through Whoop. Pick the class this was.')}</div>
    <div className="list menu-list">
      {CULT_CLASSES.map(c => <div key={c} className="item menu-item" {...tappable(() => save(c))}>
        <div className="grow"><div className="tt">{c}</div></div>
      </div>)}
    </div>
    <div style={{ height: 12 }} />
    <input className="input" value={text} maxLength={NAME_MAX} placeholder={t('Another class')} aria-label={t('Another class')}
      onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(text) }} />
    <div style={{ height: 10 }} />
    <Button variant="primary" disabled={!text.trim()} onClick={() => save(text)}>{t('Save')}</Button>
  </>
}

export const cultRenameSheet = w => useUI.getState().openSheet(close => <CultRename w={w} close={close} />)
