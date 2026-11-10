// Settings → Account → Two-factor sign-in (api/totp.js, the /api/2fa/* routes). An authenticator
// app's six-digit code asked after the password, on the web and on the phone. Setting it up: the
// current password first (a copied session must not choose the codes), then the app scans a QR of
// the otpauth:// URI (or the secret is typed in), then the first code confirms it and the ten
// recovery codes are shown once. Turning it off asks the password and a code. Passkey sign-in is
// not affected, and the server's rules decide everything; this only words them.
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import { api } from '../lib/api.js'
import { copyText } from '../lib/clipboard.js'
import { Row, Button } from './ui.jsx'
import QrCanvas from './QrCanvas.jsx'
import { passwordError, codeProblem, SecondFactorField, notReached, useAgainOnceReached } from './PasswordAuth.jsx'

const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const errStyle = { color: 'var(--red)', marginTop: 10 }
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
// The secret in groups of four, the way authenticator apps show a key to type in.
export const groupSecret = s => String(s || '').replace(/(.{4})/g, '$1 ').trim()

export function TwoFactorRow() {
  const [st, setSt] = useState(null)   // GET /api/2fa/status
  const [unreached, setUnreached] = useState(false)
  const load = () => api('/api/2fa/status').then(r => { setSt(r); setUnreached(false) }).catch(e => setUnreached(notReached(e)))
  useEffect(() => { load() }, [])
  useAgainOnceReached(unreached, load)
  // A server without password sign-in has no such route (404): nothing to show.
  if (!st) return null
  let since = ''
  try { since = st.since ? new Date(st.since).toLocaleDateString(dateLocale()) : '' } catch { since = '' }
  const subtitle = st.enabled
    ? t('On since {0} · {1} recovery codes left', since, st.recoveryLeft)
    : st.password ? t('Off. Asks for a code from an authenticator app after your password.')
    : t('Set a password first. Two-factor sign-in protects your password.')
  return <Row icon="shield" iconTint="var(--green)" title={t('Two-factor sign-in')} subtitle={subtitle}
    value={st.enabled ? t('On') : null} accessory={st.enabled || st.password ? 'chevron' : 'none'}
    onClick={st.enabled ? () => ui().openSheet(close => <TwoFactorOffSheet close={close} done={load} />)
      : st.password ? () => ui().openSheet(close => <TwoFactorSetupSheet close={close} done={load} />) : undefined} />
}

/* Three steps: the password, then the QR and the first code, then the recovery codes. */
export function TwoFactorSetupSheet({ close, done }) {
  const [step, setStep] = useState('proof')   // 'proof' | 'scan' | 'codes'
  const [pw, setPw] = useState('')
  const [setup, setSetup] = useState(null)     // { secret, uri }
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const run = async fn => {
    if (busy) return
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(passwordError(e)) } finally { setBusy(false) }
  }
  const start = ev => {
    ev.preventDefault()
    if (!pw) { setErr(t('Enter your password.')); return }
    run(async () => { setSetup(await post('/api/2fa/setup', { password: pw })); setStep('scan') })
  }
  const confirm = ev => {
    ev.preventDefault()
    const bad = codeProblem(code, false)
    if (bad) { setErr(bad); return }
    run(async () => {
      const r = await post('/api/2fa/enable', { code: code.replace(/\s/g, '') })
      setCodes(r.recoveryCodes || [])
      setStep('codes')
      done()
    })
  }
  const copyAll = async () => { if (await copyText(codes.join('\n'))) toast(t('Copied')) }

  if (step === 'codes') return <>
    <h3>{t('Save your recovery codes')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('If you lose your phone, each of these signs you in once instead of a code. They are shown only now, so keep them somewhere safe.')}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontFamily: 'ui-monospace, monospace', fontWeight: 600, letterSpacing: '.06em', textAlign: 'center' }}
      aria-label={t('Recovery codes')}>
      {codes.map(c => <div key={c} className="card" style={{ padding: '8px 4px' }}>{c}</div>)}
    </div>
    <div style={{ height: 12 }} />
    <Button type="button" icon="copy" onClick={copyAll}>{t('Copy the codes')}</Button>
    <div style={{ height: 8 }} />
    <Button type="button" variant="primary" onClick={() => { close(); toast(t('Two-factor sign-in is on')) }}>{t('I saved them')}</Button>
  </>

  if (step === 'scan') return <>
    <h3>{t('Scan with your authenticator app')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('Add an account in an app like Google Authenticator, Microsoft Authenticator or 1Password, and scan this code. Or type in the key below.')}
    </div>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><QrCanvas value={setup.uri} size={200} /></div>
    <div className="dim small" style={{ textAlign: 'center' }}>{t('Key')}</div>
    <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, textAlign: 'center', overflowWrap: 'anywhere', marginBottom: 8, userSelect: 'all' }} data-testid="totp-secret">
      {groupSecret(setup.secret)}
    </div>
    <Button type="button" variant="ghost" className="dim" icon="copy" onClick={async () => { if (await copyText(setup.secret)) toast(t('Copied')) }}>{t('Copy the key')}</Button>
    <div style={{ height: 12 }} />
    <form onSubmit={confirm} noValidate>
      <div className="muted small" style={{ marginBottom: 10 }}>{t('Then enter the 6-digit code the app shows.')}</div>
      <input className="input" name="one-time-code" autoComplete="one-time-code" inputMode="numeric" maxLength={7} placeholder="123456" aria-label={t('6-digit code')}
        value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{t('Turn on')}</Button>
    </form>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>

  return <>
    <h3>{t('Two-factor sign-in')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>
      {t('After your password, myGym also asks for a code from an authenticator app on your phone. Someone who learns your password still cannot sign in. Passkeys work as before.')}
    </div>
    <form onSubmit={start} noValidate>
      <input className="input" type="password" name="current-password" autoComplete="current-password" placeholder={t('Current password')}
        value={pw} onChange={e => setPw(e.target.value)} />
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{t('Continue')}</Button>
    </form>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

/* Off again: the password and a code (or a recovery code). */
export function TwoFactorOffSheet({ close, done }) {
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const bad = !pw ? t('Enter your password.') : codeProblem(code, recovery)
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try {
      await post('/api/2fa/disable', { password: pw, code: code.replace(/\s/g, '') })
      close(); done()
      toast(t('Two-factor sign-in is off'))
    } catch (e) { setErr(passwordError(e)) } finally { setBusy(false) }
  }
  return <>
    <h3>{t('Turn off two-factor sign-in?')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Afterwards your password alone signs you in again.')}</div>
    <form onSubmit={submit} noValidate>
      <input className="input" type="password" name="current-password" autoComplete="current-password" placeholder={t('Current password')}
        value={pw} onChange={e => setPw(e.target.value)} />
      <div style={{ height: 12 }} />
      <SecondFactorField code={code} setCode={setCode} recovery={recovery} setRecovery={setRecovery} autoFocus={false} />
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <button type="submit" className="btn danger" disabled={busy}>{t('Turn off')}</button>
    </form>
    <div style={{ height: 8 }} />
    <Button type="button" variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
