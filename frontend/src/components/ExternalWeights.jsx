import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DEMO } from '../lib/demo.js'
import { addWeighIn } from '../lib/weigh-ins.js'
import { externalWeights } from '../lib/external-weights.js'
import { useMedical } from './MedicalHome.jsx'
import { useWhoopSummary } from '../views/WhoopSheets.jsx'
import { Button } from './ui.jsx'
import '../views/health.css'

/* Body weight card (our addition): the InBody and Whoop weights the app already has, added as
   weigh-ins on one tap so the chart is not empty (lib/external-weights.js). */
export default function ExternalWeights() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const toast = useUI(s => s.toast)
  const on = !!user && !DEMO
  const medical = useMedical()
  const whoopOn = on && (config?.integrations?.providers || []).includes('whoop')
  const w = useWhoopSummary(whoopOn)
  if (!on) return null
  const whoopDay = w.data?.syncedAt ? new Date(w.data.syncedAt).toISOString().slice(0, 10) : null
  const list = externalWeights(S, { inbody: medical.data?.inbody || [], whoopBody: w.data?.body || null, whoopDay })
  if (!list.length) return null
  const add = () => {
    useStore.getState().update(s => { for (const r of list) addWeighIn(s, { d: r.d, at: '08:00', w: r.w, id: r.id, src: r.src }) })
    toast(t('Added {0} weigh-ins', list.length))
  }
  const names = [...new Set(list.map(r => r.label))].join(' + ')
  return <div className="ext-w">
    <span className="hl-dim">{t('{0} already has your weight: {1}', names, list.map(r => `${r.w} ${S.unit || 'kg'} (${r.d.slice(5)})`).join(', '))}</span>
    <Button size="sm" variant="tinted" icon="plus" onClick={add}>{t('Add to chart')}</Button>
  </div>
}
