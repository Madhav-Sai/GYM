// The Diet and Supplements screens' data (our addition): GET and POST /api/health/*, through api()
// so a paired phone's bearer token works the same as the website's cookie. Every write answers with
// the new view, which replaces what is on screen.
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { DEMO } from '../lib/demo.js'
import { t } from '../lib/i18n.js'

/** Signed in to a server (not a guest, not the demo): the only place the log lives. */
export function useHealthOn() {
  const user = useStore(s => s.user)
  return !!user && !DEMO
}

const errText = e => (e && e.message && !/^HTTP \d/.test(e.message) ? e.message : t('Could not reach your server'))

function useResource(path, enabled) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve(null)
    return api(path).then(d => { setData(d); setError(false); return d }).catch(() => { setError(true); return null })
  }, [path, enabled])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!enabled) return undefined
    const again = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [enabled, load])
  // A write: POST the body, show what the server answers. A refusal is a toast, never a blank screen.
  const post = useCallback(async (to, body) => {
    try {
      const d = await api(to, { method: 'POST', body: JSON.stringify(body) })
      setData(prev => ({ ...prev, ...d }))
      return d
    } catch (e) { useUI.getState().toast(errText(e)); return null }
  }, [])
  return { data, error, load, post }
}

export const useDietDay = (day, enabled = true) => useResource('/api/health/diet?day=' + encodeURIComponent(day), enabled)
export const useSupplements = (enabled = true) => useResource('/api/health/supplements', enabled)
