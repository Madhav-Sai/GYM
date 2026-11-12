// Medical (this fork): the hub with the goals, Labs (blood tests) and InBody. The record is the
// server's (api/medical/, components/MedicalHome.jsx useMedical); body weight and waist are the
// profile's own weigh-ins and body measurements, read here rather than copied.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { isOn } from '../lib/modules.js'
import {
  DASH, fmtVal, markerFlag, markerSeries, labOverview, markerTemplate, FLAG_INK, FLAG_LABEL,
  weightPoints, waistPoints, inbodySeries, waistVsWeight,
} from '../lib/medical.js'
import Icon from '../components/Icon.jsx'
import CardHead from '../components/CardHead.jsx'
import DateField from '../components/DateField.jsx'
import { Button, NumberField, Row, Section, TextField } from '../components/ui.jsx'
import { RefBar, TrendChart, WaistWeightChart, GoalBar } from '../components/MedicalCharts.jsx'
import { useMedical, medicalCall, goalRows, NextTests } from '../components/MedicalHome.jsx'
import { confirmSheet } from '../sheets.jsx'
import { api, apiBlob, appBase } from '../lib/api.js'
import { MOBILE, shareExportBlob } from '../lib/mobile.js'
import { saveFile } from '../lib/save-file.js'
import { uploadLabFile, labFileProblem, fileSizeLabel, LAB_FILE_ACCEPT } from '../lib/lab-file.js'

const toast = m => useUI.getState().toast(m)
const sheet = render => useUI.getState().openSheet(render)
const errText = e => (e && e.message && !/^HTTP \d/.test(e.message) ? e.message : t('Something went wrong'))

function Header({ title, sub, back = '/medical', backLabel, action }) {
  const nav = useNavigate()
  return <div className="hdr">
    <button className="iconbtn" data-back={back} onClick={() => nav(back)} aria-label={backLabel || t('Back')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {action}
  </div>
}

function Gate({ m, children }) {
  if (!m.enabled) return <Section><Row icon="info" title={t('Sign in to your server to keep medical records.')} /></Section>
  if (m.error && !m.data) return <div className="card"><div className="dim small" role="alert">{t('Could not reach your server')}</div></div>
  if (!m.data) return <div className="card"><div className="dim small">{t('Loading…')}</div></div>
  return children
}

/* ------------------------------------------------------------------ hub */

export default function MedicalHub() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const m = useMedical()
  const d = m.data
  const rows = d ? goalRows(d, S) : []
  const lastLab = d?.labs?.at(-1), lastScan = d?.inbody?.at(-1)
  const off = lastLab ? lastLab.markers.filter(x => { const f = markerFlag(x); return f && f !== 'normal' }).length : 0
  return <div className="narrow">
    <Header title={t('Medical')} sub={d?.profile ? `${d.profile.name} · ${d.profile.age} · ${d.profile.heightCm} cm` : t('Blood work, InBody and goals')} back="/home" backLabel={t('Home')} />
    <Gate m={m}>
      {d && <>
        {d.tests?.length > 0 && <div className="card">
          <CardHead icon="calendar" tint="var(--red)" title={t('Next tests')} />
          <NextTests tests={d.tests} onTick={async x => {
            try { await medicalCall('/api/medical/tests/done', { id: x.id, done: x.status !== 'done' }) } catch (e) { toast(errText(e)) }
          }} />
        </div>}
        <Section>
          <Row icon="note" iconTint="var(--red)" title={t('Labs')} accessory="chevron" onClick={() => nav('/medical/labs')}
            subtitle={lastLab ? `${fmtDate(lastLab.date, false, true)} · ${lastLab.lab || DASH}` : t('No blood tests yet')}
            value={lastLab && off ? t('{0} flagged', off) : null} />
          <Row icon="gauge" iconTint="var(--teal)" title={t('InBody')} accessory="chevron" onClick={() => nav('/medical/inbody')}
            subtitle={lastScan ? fmtDate(lastScan.date, false, true) : t('No scans yet')}
            value={lastScan?.score != null ? t('Score {0}', lastScan.score) : null} />
        </Section>
        <div className="card">
          <CardHead icon="target" tint="var(--gold, var(--orange))" title={t('Goals')} action={<Button size="sm" icon="plus" onClick={() => goalSheet(null, d)}>{t('Add')}</Button>} />
          {rows.length ? rows.map(r => <div key={r.goal.id} className="tap" role="button" tabIndex={0} onClick={() => goalSheet(r.goal, d)} onKeyDown={e => { if (e.key === 'Enter') goalSheet(r.goal, d) }}>
            <GoalBar goal={r.goal} prog={r.prog} />
            {r.cur && <div className="small dim" style={{ marginTop: -4, marginBottom: 4 }}>{t('Latest {0}', fmtDate(r.cur.date, false, true))}{r.goal.note ? ' · ' + r.goal.note : ''}</div>}
          </div>) : <div className="dim small">{t('No goals yet.')}</div>}
        </div>
      </>}
    </Gate>
  </div>
}

const GOAL_METRICS = [
  { key: 'weight', label: 'Weight', unit: 'kg' },
  { key: 'inbody:bodyFatPct', label: 'Body fat', unit: '%' },
  { key: 'inbody:skeletalMuscle', label: 'Skeletal muscle', unit: 'kg' },
  { key: 'inbody:whr', label: 'Waist-hip ratio', unit: '' },
  { key: 'inbody:visceralFat', label: 'Visceral fat level', unit: '' },
]

function GoalForm({ close, goal, doc }) {
  const metrics = [...GOAL_METRICS, ...markerTemplate(doc.labs).map(x => ({ key: 'lab:' + x.key, label: x.name, unit: x.unit }))]
  const [g, setG] = useState(() => goal || { key: 'weight', label: 'Weight', unit: 'kg', start: null, lo: null, hi: null, by: todayISO(), from: todayISO() })
  const set = patch => setG(x => ({ ...x, ...patch }))
  const save = async () => {
    try { await medicalCall('/api/medical/goals/save', g); close(); toast(t('Goal saved')) } catch (e) { toast(errText(e)) }
  }
  const del = () => confirmSheet({
    title: t('Delete goal?'), confirmText: t('Delete'), danger: true,
    onConfirm: async () => { try { await medicalCall('/api/medical/goals/delete', { id: goal.id }); close() } catch (e) { toast(errText(e)) } },
  })
  return <>
    <h3>{goal ? t('Edit goal') : t('New goal')}</h3>
    {!goal && <div className="med-chips" style={{ marginBottom: 10 }}>
      {metrics.slice(0, 16).map(x => <button key={x.key} type="button" className={'chip' + (g.key === x.key ? ' on' : '')} onClick={() => set({ key: x.key, label: x.label, unit: x.unit })}>{x.label}</button>)}
    </div>}
    <div className="measure-form">
      <label className="measure-field"><span>{t('Name')}</span><TextField value={g.label} onChange={e => set({ label: e.target.value })} /></label>
      <label className="measure-field"><span>{t('Start')}</span><span className="measure-input"><NumberField nullable value={g.start} onChange={v => set({ start: v })} /><i>{g.unit}</i></span></label>
      <label className="measure-field"><span>{t('At least')}</span><span className="measure-input"><NumberField nullable value={g.lo} onChange={v => set({ lo: v })} /><i>{g.unit}</i></span></label>
      <label className="measure-field"><span>{t('At most')}</span><span className="measure-input"><NumberField nullable value={g.hi} onChange={v => set({ hi: v })} /><i>{g.unit}</i></span></label>
    </div>
    <label className="measure-date"><span>{t('By')}</span><DateField value={g.by} onChange={v => set({ by: v })} label={t('By')} /></label>
    <label className="measure-field"><span>{t('Note')}</span><TextField value={g.note || ''} maxLength={200} onChange={e => set({ note: e.target.value })} /></label>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save} disabled={g.lo == null && g.hi == null}>{t('Save')}</Button>
    {goal && <><div style={{ height: 8 }} /><Button icon="trash" className="danger" onClick={del}>{t('Delete')}</Button></>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const goalSheet = (goal, doc) => sheet(close => <GoalForm close={close} goal={goal} doc={doc} />)

/* ------------------------------------------------------------------ labs */

function MarkerCard({ m, labs }) {
  const f = markerFlag(m)
  const ink = FLAG_INK[f] || 'var(--sep)'
  const pts = markerSeries(labs, m.key)
  return <div className="med-card" style={{ '--flag': ink }}>
    <div className="med-card-h"><span className="med-lbl">{m.name}</span>{f && <span className="med-flag">{t(FLAG_LABEL[f])}</span>}</div>
    <div className="med-num">{m.value != null ? fmtVal(m.value) : (m.text || DASH)}<small>{m.unit !== 'ratio' ? m.unit : ''}</small></div>
    <RefBar m={m} ink={ink} />
    <div className="med-ref">{t('Ref {0}', m.ref?.text || DASH)}</div>
    {m.note && <div className="med-note">{m.note}</div>}
    {pts.length > 1 && <TrendChart points={pts} band={m.ref} color={ink} h={56} unit={m.unit} label={m.name} />}
  </div>
}

function Panel({ p }) {
  const [open, setOpen] = useState(false)
  return <div className="med-panel">
    <button type="button" className="med-panel-h" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span><b>{p.panel}</b> <span className="dim small">{p.markers.length}</span></span>
      <span className="row" style={{ gap: 8 }}>
        <span className="small" style={{ color: p.off ? 'var(--orange)' : 'var(--green)' }}>{p.off ? t('{0} flagged', p.off) : t('All normal')}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="chev" />
      </span>
    </button>
    {open && <div className="med-panel-b">{p.markers.map(m => {
      const f = markerFlag(m)
      return <div className="med-mrow" key={m.key}>
        <span>{m.name}<div className="med-ref">{t('Ref {0}', m.ref?.text || DASH)}{m.ref?.std ? ' · ' + t('standard range') : ''}</div>{m.note && <div className="med-note">{m.note}</div>}</span>
        <span className="med-mrow-v" style={f && f !== 'normal' ? { color: FLAG_INK[f] } : undefined}>{m.value != null ? fmtVal(m.value) : (m.text || DASH)}<small>{m.unit !== 'ratio' ? m.unit : ''}</small></span>
      </div>
    })}</div>}
  </div>
}

/* A lab result's report (lib/lab-file.js, api/medical/files.js): open, replace, remove. On the phone
   the file goes to the system (the share sheet opens it in the PDF viewer or Photos); on the web it
   opens in a new tab, which carries the session cookie. */
const REPORT_PROBLEM = {
  type: 'A report must be a PDF, JPEG or PNG',
  size: 'A report file is at most 10 MB',
  empty: 'That file is empty',
}
export async function openReport(file) {
  const path = '/api/medical/labs/file?id=' + encodeURIComponent(file.id)
  if (MOBILE) {
    const blob = await apiBlob(path, { expectSize: file.size })
    await shareExportBlob(new Blob([blob], { type: file.type }), file.name)
    return
  }
  // A PDF downloads: the site's Content-Security-Policy (object-src 'none') stops Chrome's built-in
  // PDF viewer in a new tab. A photo opens in a tab as before.
  if (file.type === 'application/pdf') {
    const blob = await apiBlob(path, { expectSize: file.size })
    const r = await saveFile(new Blob([blob], { type: file.type }), file.name, { type: file.type })
    if (r === 'failed') toast(t('Could not save the file.'))
    return
  }
  const w = window.open(appBase().replace(/\/$/, '') + path, '_blank', 'noopener')
  if (w === null && !document.hidden) toast(t('Allow pop-ups for myGym to open the report'))
}

function LabReport({ lab }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(null)
  const f = lab.file
  const pick = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = labFileProblem(file)
    if (problem) { toast(t(REPORT_PROBLEM[problem])); return }
    setBusy(0)
    try {
      await uploadLabFile(lab.id, file, body => api('/api/medical/labs/file', { method: 'POST', body: JSON.stringify(body), timeout: 120000 }), { onProgress: setBusy })
      await medicalCall('/api/medical')
      toast(t('Report saved'))
    } catch (err) { toast(errText(err)) }
    finally { setBusy(null) }
  }
  const remove = () => confirmSheet({
    title: t('Remove the report?'), message: t('Deletes {0} from your server. The results stay.', f.name), confirmText: t('Remove'), danger: true,
    onConfirm: async () => { try { await medicalCall('/api/medical/labs/file/delete', { labId: lab.id }); toast(t('Report removed')) } catch (e) { toast(errText(e)) } },
  })
  const open = async () => { try { await openReport(f) } catch (e) { toast(errText(e)) } }
  return <div className="med-report small">
    <input ref={input} type="file" accept={LAB_FILE_ACCEPT} hidden onChange={pick} aria-label={t('Report file')} />
    {busy != null ? <span className="dim">{t('Uploading… {0}%', Math.round(busy * 100))}</span>
    : f ? <span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="dim">{t('Report')}:</span>
      <button type="button" className="linkbtn" onClick={open} aria-label={t('Open report {0}', f.name)}>{t('open')}</button>
      <button type="button" className="linkbtn" onClick={() => input.current?.click()}>{t('replace')}</button>
      <button type="button" className="linkbtn" onClick={remove}>{t('remove')}</button>
      <span className="dim">{fileSizeLabel(f.size)}</span>
    </span>
    : <button type="button" className="linkbtn" onClick={() => input.current?.click()}>{t('Attach report (PDF or photo)')}</button>}
  </div>
}

export function MedicalLabs() {
  const m = useMedical()
  const d = m.data
  const o = d ? labOverview(d.labs, d.tracked) : null
  return <div className="narrow">
    <Header title={t('Labs')} sub={o?.newest ? `${fmtDate(o.newest.date, false, true)} · ${o.newest.lab || DASH}` : t('Blood work')}
      action={d && <button className="iconbtn" onClick={() => labSheet(null, d)} aria-label={t('Add lab result')}><Icon name="plus" /></button>} />
    <Gate m={m}>
      {d && <>
        <NextTests tests={d.tests} compact />
        {o.newest?.note && <div className="med-note">{o.newest.note}</div>}
        {o.cards.length > 0 && <><h4 className="sec">{t('Tracked')}</h4><div className="med-cards">{o.cards.map(c => <MarkerCard key={c.key} m={c} labs={d.labs} />)}</div></>}
        {o.panels.length > 0 && <><h4 className="sec">{t('Everything else')}</h4><div className="card">{o.panels.map(p => <Panel key={p.panel} p={p} />)}</div></>}
        <h4 className="sec">{t('Tests')}</h4>
        <div className="card">
          {d.labs.length ? [...d.labs].reverse().map(l => <div className="med-hist" key={l.id}>
            <div><b>{fmtDate(l.date, false, true)}</b><div className="small dim">{l.lab || DASH} · {t('{0} markers', l.markers.length)}{l.note ? ' · ' + l.note : ''}</div><LabReport lab={l} /></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="iconbtn" onClick={() => labSheet(l, d)} aria-label={t('Edit')}><Icon name="pencil" /></button>
              <button className="iconbtn" onClick={() => confirmSheet({
                title: t('Delete this lab result?'), message: t('Deletes the test of {0}.', fmtDate(l.date, false, true)), confirmText: t('Delete'), danger: true,
                onConfirm: async () => { try { await medicalCall('/api/medical/labs/delete', { id: l.id }); toast(t('Lab result deleted')) } catch (e) { toast(errText(e)) } },
              })} aria-label={t('Delete')}><Icon name="trash" /></button>
            </div>
          </div>) : <div className="dim small">{t('No blood tests yet')}</div>}
          <div style={{ height: 8 }} />
          <Button icon="plus" onClick={() => labSheet(null, d)}>{t('Add lab result')}</Button>
        </div>
      </>}
    </Gate>
  </div>
}

function LabForm({ close, lab, doc }) {
  const [date, setDate] = useState(lab?.date || todayISO())
  const [name, setName] = useState(lab?.lab ?? (doc.labs.at(-1)?.lab || ''))
  const [note, setNote] = useState(lab?.note || '')
  // A new test starts from every marker used before, empty; an edit from its own markers.
  const [rows, setRows] = useState(() => lab ? lab.markers.map(x => ({ ...x }))
    : markerTemplate(doc.labs).map(x => ({ ...x, value: null, flag: null })))
  const [extra, setExtra] = useState({ name: '', panel: '', unit: '', lo: null, hi: null })
  const tracked = new Set(doc.tracked)
  const setVal = (key, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, value, flag: value === r.value ? r.flag : null } : r))
  const addExtra = () => {
    if (!extra.name.trim()) return
    const key = extra.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
    setRows(rs => [...rs.filter(r => r.key !== key), { key, name: extra.name.trim(), panel: extra.panel.trim() || 'Other', unit: extra.unit.trim(), value: null, flag: null, ref: { lo: extra.lo, hi: extra.hi, text: extra.lo != null && extra.hi != null ? `${extra.lo}-${extra.hi}` : extra.lo != null ? `>${extra.lo}` : extra.hi != null ? `<${extra.hi}` : '' } }])
    setExtra({ name: '', panel: '', unit: '', lo: null, hi: null })
  }
  const filled = rows.filter(r => r.value != null || r.text)
  const save = async () => {
    try {
      await medicalCall('/api/medical/labs/save', { id: lab?.id, date, lab: name, note, markers: filled })
      close(); toast(t('Lab result saved'))
    } catch (e) { toast(errText(e)) }
  }
  // Tracked first, then by panel, so the markers worth the effort are at the top.
  const ordered = [...rows].sort((a, b) => (tracked.has(b.key) - tracked.has(a.key)))
  let lastPanel = null
  return <>
    <h3>{lab ? t('Edit lab result') : t('Add lab result')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Fill only what was tested. Empty markers stay out of the result.')}</div>
    <label className="measure-date"><span>{t('Date')}</span><DateField value={date} max={todayISO()} onChange={setDate} label={t('Date')} /></label>
    <label className="measure-field"><span>{t('Lab')}</span><TextField value={name} onChange={e => setName(e.target.value)} placeholder="Orange Health Labs" /></label>
    <label className="measure-field"><span>{t('Note')}</span><TextField value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder={t('For example: fasted 12 hours')} /></label>
    {ordered.map(r => {
      const head = tracked.has(r.key) ? t('Tracked') : r.panel
      const show = head !== lastPanel; lastPanel = head
      return <div key={r.key}>
        {show && <div className="med-form-sec">{head}</div>}
        <div className="med-form-row">
          <span className="small">{r.name}<div className="med-ref">{r.ref?.text || ''}</div></span>
          {r.text != null && r.value == null && !r.unit
            ? <TextField value={r.text || ''} onChange={e => setRows(rs => rs.map(x => x.key === r.key ? { ...x, text: e.target.value } : x))} />
            : <NumberField nullable value={r.value} onChange={v => setVal(r.key, v)} aria-label={r.name} />}
          <span className="dim small">{r.unit !== 'ratio' ? r.unit : ''}</span>
        </div>
      </div>
    })}
    <div className="med-form-sec">{t('Add a marker')}</div>
    <div className="med-form-new">
      <TextField placeholder={t('Name')} value={extra.name} onChange={e => setExtra(x => ({ ...x, name: e.target.value }))} />
      <TextField placeholder={t('Panel')} value={extra.panel} onChange={e => setExtra(x => ({ ...x, panel: e.target.value }))} />
      <TextField placeholder={t('Unit')} value={extra.unit} onChange={e => setExtra(x => ({ ...x, unit: e.target.value }))} />
      <span />
      <NumberField nullable placeholder={t('Ref low')} value={extra.lo} onChange={v => setExtra(x => ({ ...x, lo: v }))} />
      <NumberField nullable placeholder={t('Ref high')} value={extra.hi} onChange={v => setExtra(x => ({ ...x, hi: v }))} />
    </div>
    <div style={{ height: 6 }} />
    <Button size="sm" icon="plus" onClick={addExtra} disabled={!extra.name.trim()}>{t('Add marker')}</Button>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save} disabled={!filled.length}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const labSheet = (lab, doc) => sheet(close => <LabForm close={close} lab={lab} doc={doc} />)

/* ------------------------------------------------------------------ InBody */

const IB_FIELDS = [
  ['weight', 'Weight', 'kg'], ['bodyFatPct', 'Body fat', '%'], ['bodyFatMass', 'Body fat mass', 'kg'],
  ['skeletalMuscle', 'Skeletal muscle', 'kg'], ['leanMass', 'Lean body mass', 'kg'], ['visceralFat', 'Visceral fat level', ''],
  ['whr', 'Waist-hip ratio', ''], ['bmr', 'BMR', 'kcal'], ['bmi', 'BMI', ''], ['score', 'InBody score', ''],
  ['tbw', 'Total body water', 'L'], ['protein', 'Protein', 'kg'], ['mineral', 'Mineral', 'kg'],
  ['smi', 'Skeletal muscle index', ''], ['intake', 'Recommended intake', 'kcal'],
]
const SEGS = [['la', 'Left arm'], ['ra', 'Right arm'], ['trunk', 'Trunk'], ['ll', 'Left leg'], ['rl', 'Right leg']]
const SEG_SHORT = { la: 'LA', ra: 'RA', trunk: 'Trunk', ll: 'LL', rl: 'RL' }
const SEG_FLAG = { normal: 'Normal', under: 'Under', over: 'Over' }
const signed = v => (v == null ? DASH : (v > 0 ? '+' : '') + fmtVal(v))

export function MedicalInbody() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const m = useMedical()
  const d = m.data
  const scans = d?.inbody || []
  const last = scans.at(-1)
  const weight = weightPoints(S.bodyweight, S.unit, scans)
  const waist = isOn(S, 'body') ? waistPoints(S.measurements) : []
  const cmp = waistVsWeight(waist, weight)
  return <div className="narrow">
    <Header title={t('InBody')} sub={last ? [fmtDate(last.date, false, true), last.time, last.device].filter(Boolean).join(' · ') : t('Body composition')}
      action={d && <button className="iconbtn" onClick={() => inbodySheet(null)} aria-label={t('Add InBody scan')}><Icon name="plus" /></button>} />
    <Gate m={m}>
      {d && <>
        {last ? <div className="card">
          <div className="med-grid">
            {IB_FIELDS.map(([k, label, unit]) => <div key={k}><div className="med-lbl">{t(label)}</div><div className="med-num">{fmtVal(last[k])}<small>{unit}</small></div></div>)}
          </div>
          {[['segmental', 'Segmental lean mass'], ['segmentalFat', 'Segmental fat mass']].filter(([f]) => f === 'segmental' || SEGS.some(([k]) => last[f]?.[k]?.kg != null)).map(([f, title]) => <div key={f}>
            <div className="med-form-sec">{t(title)}</div>
            <div className="med-seg">
              {SEGS.map(([k]) => { const s = last[f]?.[k] || {}; return <div key={k}>
                <div className="med-lbl">{SEG_SHORT[k]}</div><div className="med-num">{s.approx && s.kg != null ? '≈' : ''}{fmtVal(s.kg)}</div>
                {s.flag && <span className={'med-tag ' + s.flag}>{t(SEG_FLAG[s.flag])}</span>}
              </div> })}
            </div>
          </div>)}
          {last.note && <div className="med-note">{last.note}</div>}
          {last.targets && <><div className="med-form-sec">{t('Targets')}</div>
            <div className="med-grid">
              <div><div className="med-lbl">{t('Target weight')}</div><div className="med-num">{fmtVal(last.targets.weight)}<small>kg</small></div></div>
              {last.targets.weightControl != null && <div><div className="med-lbl">{t('Weight control')}</div><div className="med-num">{signed(last.targets.weightControl)}<small>kg</small></div></div>}
              <div><div className="med-lbl">{t('Fat control')}</div><div className="med-num">{signed(last.targets.fatControl)}<small>kg</small></div></div>
              <div><div className="med-lbl">{t('Muscle control')}</div><div className="med-num">{signed(last.targets.muscleControl)}<small>kg</small></div></div>
            </div></>}
        </div> : <div className="card"><div className="dim small">{t('No scans yet')}</div></div>}

        <h4 className="sec">{t('Waist vs weight')}</h4>
        <div className="card">
          <WaistWeightChart waist={waist} weight={weight} />
          {cmp?.recomp && <div className="med-callout">{t(cmp.text)}</div>}
          {cmp && !cmp.recomp && <div className="small dim" style={{ marginTop: 8 }}>{t('Since {0}: waist {1} cm, weight {2} kg', fmtDate(cmp.from, false, true), signed(cmp.waistDelta), signed(cmp.weightDelta))}</div>}
          {isOn(S, 'body') && <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/measurements')}>{t('Body measurements')}</Button>}
        </div>

        <h4 className="sec">{t('Trends')}</h4>
        <div className="card"><div className="med-lbl">{t('Weight')} (kg)</div><TrendChart points={weight} color="var(--blue)" unit="kg" label={t('Weight')} /></div>
        <div className="card"><div className="med-lbl">{t('Body fat')} (%)</div><TrendChart points={inbodySeries(scans, 'bodyFatPct')} band={{ lo: 10, hi: 20 }} color="var(--orange)" unit="%" label={t('Body fat')} /></div>
        <div className="card"><div className="med-lbl">{t('Skeletal muscle')} (kg)</div><TrendChart points={inbodySeries(scans, 'skeletalMuscle')} color="var(--green)" unit="kg" label={t('Skeletal muscle')} /></div>
        <div className="card"><div className="med-lbl">{t('Visceral fat level')}</div><TrendChart points={inbodySeries(scans, 'visceralFat')} band={{ lo: 1, hi: 9 }} color="var(--red)" label={t('Visceral fat level')} /></div>
        <div className="card"><div className="med-lbl">{t('Waist')} (cm)</div><TrendChart points={waist} color="var(--teal)" unit="cm" label={t('Waist')} /></div>

        <h4 className="sec">{t('History')}</h4>
        <div className="card">
          {scans.length ? [...scans].reverse().map(s => <div className="med-hist" key={s.id}>
            <div><b>{fmtDate(s.date, false, true)}</b><div className="small dim">{fmtVal(s.weight)} kg · {fmtVal(s.bodyFatPct)} % · {t('Score {0}', fmtVal(s.score))}</div></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="iconbtn" onClick={() => inbodySheet(s)} aria-label={t('Edit')}><Icon name="pencil" /></button>
              <button className="iconbtn" onClick={() => confirmSheet({
                title: t('Delete this InBody scan?'), message: t('Deletes the scan of {0}.', fmtDate(s.date, false, true)), confirmText: t('Delete'), danger: true,
                onConfirm: async () => { try { await medicalCall('/api/medical/inbody/delete', { id: s.id }); toast(t('InBody scan deleted')) } catch (e) { toast(errText(e)) } },
              })} aria-label={t('Delete')}><Icon name="trash" /></button>
            </div>
          </div>) : <div className="dim small">{t('No scans yet')}</div>}
          <div style={{ height: 8 }} />
          <Button icon="plus" onClick={() => inbodySheet(null)}>{t('Add InBody scan')}</Button>
        </div>
      </>}
    </Gate>
  </div>
}

function InbodyForm({ close, scan }) {
  const [v, setV] = useState(() => scan ? structuredClone(scan) : {
    date: todayISO(), segmental: Object.fromEntries(SEGS.map(([k]) => [k, { kg: null, flag: null }])),
    segmentalFat: Object.fromEntries(SEGS.map(([k]) => [k, { kg: null, flag: null }])), targets: { weight: null, weightControl: null, fatControl: null, muscleControl: null },
  })
  const set = patch => setV(x => ({ ...x, ...patch }))
  const setSeg = (k, patch, f = 'segmental') => setV(x => ({ ...x, [f]: { ...x[f], [k]: { ...x[f]?.[k], ...patch } } }))
  const setTg = (k, val) => setV(x => ({ ...x, targets: { ...x.targets, [k]: val } }))
  const save = async () => {
    try { await medicalCall('/api/medical/inbody/save', v); close(); toast(t('InBody scan saved')) } catch (e) { toast(errText(e)) }
  }
  const cycle = f => (f === 'normal' ? 'under' : f === 'under' ? 'over' : f === 'over' ? null : 'normal')
  // Control targets may be negative (fat control -12.5): the sign is a toggle, the number a field.
  const SignedField = ({ k }) => {
    const val = v.targets?.[k]
    return <span className="measure-input">
      <button type="button" className="chip" onClick={() => setTg(k, val == null ? null : -val)} aria-label={t('Change sign')}>{val != null && val < 0 ? '−' : '+'}</button>
      <NumberField nullable value={val == null ? null : Math.abs(val)} onChange={n => setTg(k, n == null ? null : (val != null && val < 0 ? -n : n))} /><i>kg</i>
    </span>
  }
  return <>
    <h3>{scan ? t('Edit InBody scan') : t('Add InBody scan')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('As printed on the sheet. Empty fields stay empty.')}</div>
    <label className="measure-date"><span>{t('Date')}</span><DateField value={v.date} max={todayISO()} onChange={date => set({ date })} label={t('Date')} /></label>
    <div className="measure-form">
      {IB_FIELDS.map(([k, label, unit]) => <label className="measure-field" key={k}><span>{t(label)}</span>
        <span className="measure-input"><NumberField nullable value={v[k] ?? null} onChange={n => set({ [k]: n })} /><i>{unit}</i></span></label>)}
    </div>
    {[['segmental', 'Segmental lean mass'], ['segmentalFat', 'Segmental fat mass']].map(([f, title]) => <div key={f}>
      <div className="med-form-sec">{t(title)}</div>
      {SEGS.map(([k, label]) => { const s = v[f]?.[k] || {}; return <div className="med-form-row" key={k}>
        <span className="small">{t(label)}</span>
        <NumberField nullable value={s.kg ?? null} onChange={n => setSeg(k, { kg: n }, f)} aria-label={t(title) + ': ' + t(label)} />
        <button type="button" className={'chip' + (s.flag ? ' on' : '')} onClick={() => setSeg(k, { flag: cycle(s.flag) }, f)}>{s.flag ? t(SEG_FLAG[s.flag]) : DASH}</button>
      </div> })}
    </div>)}
    <label className="measure-field"><span>{t('Note')}</span><TextField value={v.note || ''} maxLength={200} onChange={e => set({ note: e.target.value })} /></label>
    <div className="med-form-sec">{t('Targets')}</div>
    <div className="measure-form">
      <label className="measure-field"><span>{t('Target weight')}</span><span className="measure-input"><NumberField nullable value={v.targets?.weight ?? null} onChange={n => setTg('weight', n)} /><i>kg</i></span></label>
      <div className="measure-field"><span>{t('Weight control')}</span>{SignedField({ k: 'weightControl' })}</div>
      <div className="measure-field"><span>{t('Fat control')}</span>{SignedField({ k: 'fatControl' })}</div>
      <div className="measure-field"><span>{t('Muscle control')}</span>{SignedField({ k: 'muscleControl' })}</div>
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}
const inbodySheet = scan => sheet(close => <InbodyForm close={close} scan={scan} />)
