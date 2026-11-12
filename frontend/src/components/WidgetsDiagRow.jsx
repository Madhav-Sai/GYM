import { useCallback, useEffect, useState } from 'react'
import { t } from '../lib/i18n.js'
import { fmtAgo } from '../lib/format.js'
import { refreshWidgetsNow, widgetPluginStatus, widgetSyncDiag } from '../lib/widgets.js'
import { widgetStatusView } from '../lib/widget-status.js'
import { Section, Row, Button } from './ui.jsx'

/* myGym: Settings → Look & Home → Widgets (iPhone app only). Where the Home Screen widgets' data
   stands: the keychain group the app and the widgets share, how the last write and a read-back went
   (WidgetBridge.status), which blocks the last snapshot carried, and a button that pulls the
   server's numbers and writes the snapshot at once. A screenshot of it says where it breaks. */

const verdictText = v => {
  switch (v) {
    case 'no-plugin': return t('No widget bridge in this build')
    case 'no-group': return t('No shared keychain group: the widgets cannot read anything')
    case 'write-failed': return t('Writing the widget data failed')
    case 'never': return t('Nothing written for the widgets yet')
    case 'read-failed': return t('The widget data could not be read back')
    default: return t('The widgets have their data')
  }
}

export default function WidgetsDiagRow() {
  const [view, setView] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const status = await widgetPluginStatus()
    setView(widgetStatusView(status, widgetSyncDiag()))
  }, [])
  useEffect(() => {
    let live = true
    widgetPluginStatus().then(status => { if (live) setView(widgetStatusView(status, widgetSyncDiag())) })
    return () => { live = false }
  }, [])
  if (!view) return null
  const refresh = async () => {
    setBusy(true)
    try { await refreshWidgetsNow() } catch { /* shown in the status below */ }
    await load()
    setBusy(false)
  }
  const ok = view.verdict === 'ok'
  return <Section title={t('Widgets')} footer={view.error ? view.error : undefined}>
    <Row icon={ok ? 'check' : 'warning'} iconTint={ok ? 'var(--green)' : 'var(--orange)'} title={verdictText(view.verdict)}
      subtitle={view.group ? `${view.group}${view.groupSource ? ' · ' + view.groupSource : ''}` : undefined} />
    <Row icon="lock" iconTint="var(--blue)" title={t('Keychain write')} value={view.write} />
    <Row icon="lock" iconTint="var(--blue)" title={t('Keychain read-back')} value={view.read} />
    <Row icon="grid" iconTint="var(--indigo)" title={t('App Group')} value={view.appGroup ? t('On') : t('Off')} />
    <Row icon="clock" iconTint="var(--blue)" title={t('Last widget update')} value={view.at ? fmtAgo(view.at) : t('Not yet')} subtitle={view.size !== '–' ? view.size : undefined} />
    <Row icon="grid" iconTint="var(--teal)" title={t('In the last snapshot')}
      subtitle={view.missing.length ? t('Missing: {0}', view.missing.join(', ')) : undefined}
      value={view.have.length ? view.have.join(', ') : '–'} />
    <div className="lrow">
      <Button variant="primary" icon="repeat" disabled={busy} onClick={refresh}>{t('Refresh widgets now')}</Button>
    </div>
  </Section>
}
