import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { fmtAgo, todayISO } from '../lib/format.js'
import { needsStepsFallback, withStepsFallback, stepsSourceOf, STEPS_APPLE } from '../lib/steps-source.js'
import { readTodaySteps } from '../lib/health-sync.js'
import { isOn } from '../lib/modules.js'
import { DASH, numOrDash, fmtSleep, fmtSteps, zoneLine, syncMessage, BAND_INK } from '../lib/whoop.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import { Section, Row, Button, Switch } from '../components/ui.jsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { WhoopHomeDash, WhoopDashboard, WhoopSkeleton, WhoopFirstSync } from './WhoopDashboard.jsx'
import { dayParam } from '../lib/whoop-view.js'
import { planWhoopImport, applyWhoopImport, whoopImportOn } from '../lib/whoop-import.js'
import './whoop.css'

/* Whoop (our addition): the sign-in, the manage sheet and the Home card. The numbers come from our
   own server (GET /api/whoop/summary), which pulls them from Whoop every 5 minutes; a value Whoop
   did not send is a dash, never 0 (lib/whoop.js). Nothing here talks to Whoop directly. */

const sheet = render => useUI.getState().openSheet(render)
const errText = (e, fallback) => (e && e.message && !/^HTTP \d/.test(e.message) ? e.message : fallback)

// Whoop workouts in History (lib/whoop-import.js): every summary that arrives, wherever it was
// asked for, adds the workouts not yet in History, once per summary (its sync time and workouts).
// Only signed in, with the Settings switch on; nothing is written when there is nothing to add.
let lastImportKey = null
export function runWhoopImport(d, { force = false } = {}) {
  if (!d?.connected || !Array.isArray(d.workouts) || !d.workouts.length) return 0
  const st = useStore.getState()
  if (!st.user || DEMO || !whoopImportOn(st.S)) return 0
  const key = (d.syncedAt || '') + '|' + d.workouts.map(w => w.id + ':' + (w.end || '') + ':' + (w.state || '')).join(',')
  if (!force && key === lastImportKey) return 0
  lastImportKey = key
  const p = planWhoopImport(st.S, d.workouts)
  if (!p.add.length && !p.link.length) return 0
  let added = 0
  st.update(s => { added = applyWhoopImport(s, planWhoopImport(s, d.workouts)) })
  if (added) useUI.getState().toast?.(added === 1 ? t('Added 1 Whoop workout to History') : t('Added {0} Whoop workouts to History', added))
  return added
}
export const resetWhoopImportMemo = () => { lastImportKey = null }

/** Mounted once in App: loads the summary when Whoop can be on, so the import runs without opening a Whoop screen. */
export function WhoopAutoImport() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  useWhoopSummary(!!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations') && whoopImportOn(S))
  return null
}

/** The server's Whoop summary, or null until it is known. `enabled` false: no request at all. */
export function useWhoopSummary(enabled) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null)
    return api('/api/whoop/summary').then(d => {
      setData(d); setError(false); runWhoopImport(d)
      // No step count from Whoop today: Apple Health's, on the iPhone with it on (lib/steps-source.js).
      // A dash stays a dash when there is none, or the build cannot read it.
      if (MOBILE && needsStepsFallback(d)) {
        readTodaySteps({ S: useStore.getState().S }).then(v => {
          const next = withStepsFallback(d, v, todayISO())
          if (next !== d) setData(cur => (cur === d ? next : cur))
        }).catch(() => {})
      }
      return d
    }).catch(() => { setError(true); return null })
  }, [enabled])
  useEffect(() => { load() }, [load])
  // Back from Whoop's page (or from the background): the numbers may be new, and a sign-in may have just finished.
  useEffect(() => {
    if (!enabled) return undefined
    const again = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [enabled, load])
  return { data, error, load }
}

/** Ask our server for Whoop's sign-in URL and go there. Whoop sends the browser back to the app. */
export async function connectWhoop(toast) {
  try {
    const r = await api('/api/integrations/whoop/authorize')
    // On the website the same tab goes and comes back. In the phone app, Capacitor hands a link to another host to
    // Safari (window.open after an await is blocked by iOS), and the server finishes the sign-in there.
    if (r?.url) window.location.assign(r.url)
  } catch (e) { toast?.(errText(e, t('Could not connect Whoop. Try again.'))) }
}

function SheetHead({ title, status }) {
  return <div className="intg-head">
    <h3 className="intg-h"><Icon name="heart" /><span>{title}</span></h3>
    {status && <span className={'intg-pill ' + status}>{status === 'attention' ? t('Needs attention') : t('Connected')}</span>}
  </div>
}

function Stats({ s }) {
  const rec = s?.today?.recovery
  const slp = s?.today?.sleep
  const band = s?.today?.guidance
  return <>
    <div className="wh-stats">
      <div className="wh-stat">
        <div className="wh-n" style={band ? { color: BAND_INK[band.band] } : undefined}>{numOrDash(rec?.score)}{rec?.score != null && <small>%</small>}</div>
        <div className="wh-l">{t('Recovery')}</div>
      </div>
      <div className="wh-stat">
        <div className="wh-n">{fmtSleep(slp?.asleepMin)}</div>
        <div className="wh-l">{t('Sleep')}</div>
      </div>
      <div className="wh-stat">
        <div className="wh-n">{fmtSteps(s?.steps?.value)}</div>
        <div className="wh-l">{stepsSourceOf(s) === STEPS_APPLE ? t('Steps (Apple Health)') : t('Steps')}</div>
      </div>
    </div>
    {band && <div className="wh-guide" style={{ color: BAND_INK[band.band] }}>{t(band.text)}</div>}
    {(s?.hrFlags || []).slice(0, 2).map((f, i) => <div key={i} className="wh-flag">
      <Icon name="warning" /> {t('{0}: {1} bpm, above the {2} bpm ceiling', f.day, f.maxHr, f.ceiling)}
    </div>)}
  </>
}

export function whoopSheet(ctx) { sheet(close => <WhoopDetail close={close} {...ctx} />) }

function WhoopDetail({ close, conn, server, toast }) {
  const w = useWhoopSummary(true)
  const [busy, setBusy] = useState(false)
  const s = w.data
  const trouble = conn.status === 'attention'

  const sync = async () => {
    setBusy(true)
    try { toast?.(t(syncMessage(await api('/api/integrations/whoop/sync', { method: 'POST', body: '{}' })))) }
    catch (e) { toast?.(errText(e, t('Sync failed'))) }
    await w.load(); server?.load?.(); setBusy(false)
  }
  const disconnect = () => confirmSheet({
    title: t('Disconnect Whoop?'),
    message: t('Your server tells Whoop to end the connection and forgets everything it pulled. Whoop itself is not changed.'),
    confirmText: t('Disconnect'), danger: true,
    onConfirm: async () => {
      try { await api('/api/integrations/disconnect', { method: 'POST', body: JSON.stringify({ id: conn.id }) }); server?.load?.(); close(); toast?.(t('Whoop disconnected')) }
      catch (e) { toast?.(errText(e, t('Something went wrong'))) }
    },
  })
  const z = zoneLine(s?.zone45)
  const slp = s?.today?.sleep, cyc = s?.today?.cycle, rec = s?.today?.recovery

  return <>
    <SheetHead title="Whoop" status={trouble ? 'attention' : 'connected'} />
    {conn.info?.name && <p className="intg-lead">{t('Connected as {0}.', conn.info.name)}</p>}
    {trouble && conn.lastError && <p className="intg-lead" role="alert">{conn.lastError.msg}</p>}

    {!s?.today && !w.error && <p className="intg-lead">{s?.connected === false ? t('Not connected.') : t('The first sync is running. Pull down in a minute.')}</p>}
    {w.error && <p className="intg-lead" role="alert">{t('Could not reach your server')}</p>}

    {!s && !w.error && <WhoopSkeleton />}
    {s?.today && <WhoopDashboard s={s} onRefresh={sync} />}

    {s?.today && <Section title={t('Today')}>
      <Row icon="heart" iconTint="var(--red)" title={t('HRV')} value={rec?.hrv != null ? numOrDash(rec.hrv, 0) + ' ms' : DASH} />
      <Row icon="heart" iconTint="var(--red)" title={t('Resting heart rate')} value={rec?.rhr != null ? numOrDash(rec.rhr) + ' bpm' : DASH} />
      <Row icon="moon" iconTint="var(--indigo)" title={t('Sleep consistency')} value={slp?.consistency != null ? numOrDash(slp.consistency) + '%' : DASH} />
      <Row icon="gauge" iconTint="var(--purple)" title={t('Day strain')} value={numOrDash(cyc?.strain, 1)} />
      <Row icon="steps" iconTint="var(--green)" title={t('Steps')} subtitle={stepsSourceOf(s) === STEPS_APPLE ? t('Counted by Apple Health') : t('Counted by Whoop')} value={fmtSteps(s.steps?.value)} />
    </Section>}

    {z && <Section><Row icon="bolt" iconTint={z.ink} title={t(z.key, ...z.args)} value={`${z.m} / ${s.zone45.target[0]}-${s.zone45.target[1]} min`} /></Section>}

    <Section>
      <Row icon="clock" iconTint="var(--blue)" title={t('Last sync')} value={s?.syncedAt ? fmtAgo(s.syncedAt) : t('Not yet')} />
    </Section>
    <Button variant="primary" icon="repeat" disabled={busy} onClick={sync}>{busy ? t('Syncing…') : t('Sync now')}</Button>
    {trouble && <><div style={{ height: 8 }} /><Button icon="plug" onClick={() => { close(); connectWhoop(toast) }}>{t('Connect again')}</Button></>}
    <div className="sect-b intg-end">
      <button type="button" className="lrow tap danger" onClick={disconnect} disabled={busy}>
        <Icon name="trash" className="intg-act-i" /><span className="lrow-m"><span className="lrow-t">{t('Disconnect')}</span></span>
      </button>
    </div>
  </>
}

/** Home: the Whoop dashboard card. Shows nothing unless the server offers Whoop; a connect card until it is connected. */
export function WhoopHomeCard() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const nav = useNavigate()
  const offered = !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations')
  const w = useWhoopSummary(offered)
  if (offered && !w.data && !w.error) return <div className="card whoop-card"><WhoopSkeleton compact /></div>
  if (!offered || !w.data) return null
  const s = w.data
  if (!s.connected) return <div className="card whoop-card">
    <CardHead icon="heart" tint="var(--red)" eyebrow="Whoop" title={t('Connect your Whoop')} />
    <p className="wh-dim">{t('Recovery, strain, sleep, HRV and steps, right here.')}</p>
    <div style={{ height: 10 }} />
    <Button variant="primary" icon="plug" onClick={() => connectWhoop(toast)}>{t('Connect Whoop')}</Button>
  </div>
  return <div className="card tap-host whoop-card">
    <CardHead icon="heart" tint="var(--red)" eyebrow="Whoop" title={s.today ? t('Today') : t('Whoop is syncing')}
      open={{ onClick: () => nav('/settings/whoop') }}
      action={<span className="wh-dim">{s.syncedAt ? fmtAgo(s.syncedAt) : ''} <Icon name="chevronRight" className="chev" /></span>} />
    {s.today ? <WhoopHomeDash s={s} onOpen={() => nav('/settings/whoop')} onDay={d => nav('/settings/whoop?day=' + d)} /> : <p className="wh-dim">{t('Your first sync is running. Your numbers appear here in a minute.')}</p>}
    {s.status === 'attention' && <div className="wh-flag">{t('Whoop needs to be connected again.')}</div>}
  </div>
}

/** Settings → Whoop: connect, the full dashboard, sync and disconnect. */
export function WhoopSettingsPage() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const toast = useUI(s => s.toast)
  const offered = !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop')
  const w = useWhoopSummary(offered)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const initialDay = dayParam(params.get('day'))
  const s = w.data
  if (!user) return <Section><Row icon="info" title={t('Sign in first, then connect Whoop.')} /></Section>
  if (!offered) return <Section footer={t('Your server has no Whoop app keys yet (WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI).')}><Row icon="info" title={t('Whoop is not set up on the server')} /></Section>
  if (!s && !w.error) return <WhoopSkeleton />
  if (w.error) return <p className="intg-lead" role="alert">{t('Could not reach your server')}</p>
  if (!s.connected) return <>
    <div className="whd-card whd-hero">
      <Icon name="heart" style={{ width: 40, height: 40, color: 'var(--red)' }} />
      <h3 style={{ margin: '8px 0 4px' }}>{t('Connect your Whoop')}</h3>
      <p className="wh-dim">{t('myGym pulls recovery, strain, sleep stages, HRV, resting heart rate, SpO2, skin temperature, workouts with heart-rate zones and steps every 5 minutes.')}</p>
    </div>
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="plug" onClick={() => connectWhoop(toast)}>{t('Connect Whoop')}</Button>
  </>
  // The dashboard's refresh button: sync, then reload. A plain "Synced" needs no toast, the numbers move.
  const sync = async () => {
    setBusy(true)
    try { const m = syncMessage(await api('/api/integrations/whoop/sync', { method: 'POST', body: '{}' })); if (m !== 'Synced') toast?.(t(m)) }
    catch (e) { toast?.(errText(e, t('Sync failed'))) }
    await w.load(); setBusy(false)
  }
  const disconnect = () => confirmSheet({
    title: t('Disconnect Whoop?'),
    message: t('Your server tells Whoop to end the connection and forgets everything it pulled. Whoop itself is not changed.'),
    confirmText: t('Disconnect'), danger: true,
    onConfirm: async () => {
      try { await api('/api/integrations/disconnect', { method: 'POST', body: JSON.stringify({ id: s.connectionId }) }); await w.load(); toast?.(t('Whoop disconnected')) }
      catch (e) { toast?.(errText(e, t('Something went wrong'))) }
    },
  })
  return <>
    {s.status === 'attention' && <><div className="whd-card whd-alarm"><div className="whd-alarm-h"><Icon name="warning" /> {t('Whoop needs to be connected again.')}</div></div>
      <div style={{ height: 8 }} /><Button variant="primary" icon="plug" onClick={() => connectWhoop(toast)}>{t('Connect again')}</Button><div style={{ height: 12 }} /></>}
    {s.today ? <WhoopDashboard s={s} initialDay={initialDay} onRefresh={sync} /> : <WhoopFirstSync syncedAt={s.syncedAt} onRefresh={sync} />}
    <WhoopImportSwitch s={s} />
    <Section>
      {s.profile?.firstName && <Row icon="personCircle" iconTint="var(--blue)" title={t('Connected as {0}', s.profile.firstName)} />}
      <Row icon="clock" iconTint="var(--blue)" title={t('Last sync')} subtitle={t('Syncs every 5 minutes')} value={s.syncedAt ? fmtAgo(s.syncedAt) : t('Not yet')} />
    </Section>
    <div className="sect-b intg-end">
      <button type="button" className="lrow tap danger" onClick={disconnect} disabled={busy}>
        <Icon name="trash" className="intg-act-i" /><span className="lrow-m"><span className="lrow-t">{t('Disconnect Whoop')}</span></span>
      </button>
    </div>
  </>
}

/** Settings → Whoop: whether the workouts Whoop detects are added to History (a synced setting). */
function WhoopImportSwitch({ s }) {
  const on = useStore(st => whoopImportOn(st.S))
  const update = useStore(st => st.update)
  const set = v => {
    update(st => { st.whoopAutoImport = v })
    if (v) runWhoopImport(s, { force: true })
  }
  return <Section footer={t('Runs, walks and classes your Whoop detects, Cult classes included, appear in History. Cult has no app link, so they come through Whoop.')}>
    <Row icon="history" iconTint="var(--red)" title={t('Add Whoop workouts to History')}>
      <Switch checked={on} aria-label={t('Add Whoop workouts to History')} onChange={set} />
    </Row>
  </Section>
}
