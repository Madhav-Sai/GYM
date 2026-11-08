import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { fmtAgo } from '../lib/format.js'
import { isOn } from '../lib/modules.js'
import { DASH, numOrDash, fmtSleep, fmtSteps, zoneLine, syncMessage, BAND_INK } from '../lib/whoop.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import { Section, Row, Button } from '../components/ui.jsx'
import './whoop.css'

/* Whoop (our addition): the sign-in, the manage sheet and the Home card. The numbers come from our
   own server (GET /api/whoop/summary), which pulls them from Whoop every 30 minutes; a value Whoop
   did not send is a dash, never 0 (lib/whoop.js). Nothing here talks to Whoop directly. */

const sheet = render => useUI.getState().openSheet(render)
const errText = (e, fallback) => (e && e.message && !/^HTTP \d/.test(e.message) ? e.message : fallback)

/** The server's Whoop summary, or null until it is known. `enabled` false: no request at all. */
export function useWhoopSummary(enabled) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null)
    return api('/api/whoop/summary').then(d => { setData(d); setError(false); return d }).catch(() => { setError(true); return null })
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
    // In the phone app the page must open in the phone's own browser (navigating the app's WebView away loses the
    // app), and the server finishes the sign-in there; on the website the same tab goes and comes back.
    if (r?.url) { if (MOBILE) window.open(r.url, '_blank', 'noopener'); else window.location.assign(r.url) }
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
        <div className="wh-l">{t('Steps')}</div>
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

    {s?.today && <Section>
      <div style={{ padding: '4px 16px 12px' }}><Stats s={s} /></div>
    </Section>}

    {s?.today && <Section title={t('Today')}>
      <Row icon="heart" iconTint="var(--red)" title={t('HRV')} value={rec?.hrv != null ? numOrDash(rec.hrv, 0) + ' ms' : DASH} />
      <Row icon="heart" iconTint="var(--red)" title={t('Resting heart rate')} value={rec?.rhr != null ? numOrDash(rec.rhr) + ' bpm' : DASH} />
      <Row icon="moon" iconTint="var(--indigo)" title={t('Sleep consistency')} value={slp?.consistency != null ? numOrDash(slp.consistency) + '%' : DASH} />
      <Row icon="gauge" iconTint="var(--purple)" title={t('Day strain')} value={numOrDash(cyc?.strain, 1)} />
      <Row icon="steps" iconTint="var(--green)" title={t('Steps')} subtitle={t('Counted by Whoop')} value={fmtSteps(s.steps?.value)} />
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

/** Home: recovery, sleep and steps from Whoop. Shows nothing unless the server offers Whoop and this profile connected it. */
export function WhoopHomeCard() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const offered = !!user && !DEMO && (config?.integrations?.providers || []).includes('whoop') && isOn(S, 'integrations')
  const w = useWhoopSummary(offered)
  if (!offered || !w.data?.connected) return null
  const s = w.data
  const conn = { id: s.connectionId, status: s.status, info: { name: s.profile?.firstName }, lastError: null }
  return <div className="card tap-host whoop-card">
    <CardHead icon="heart" tint="var(--red)" eyebrow="Whoop" title={s.today ? t('Recovery, sleep and steps') : t('Whoop is syncing')}
      open={{ onClick: () => whoopSheet({ conn, server: { load: w.load }, toast }) }}
      action={<Icon name="chevronRight" className="chev" />} />
    {s.today ? <Stats s={s} /> : <p className="wh-dim">{t('Your first sync is running. Your numbers appear here in a minute.')}</p>}
    {s.status === 'attention' && <div className="wh-flag">{t('Whoop needs to be connected again.')}</div>}
  </div>
}
