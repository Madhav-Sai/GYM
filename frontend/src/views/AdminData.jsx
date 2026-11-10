import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtBytes, filterJson, countLeaves } from '../lib/admin-data.js'
import Icon from '../components/Icon.jsx'
import { Button, SearchField } from '../components/ui.jsx'
import '../admin.css'

/* Admin → Data (our addition): a read-only look at the files under DATA_DIR, the equivalent of a
   read-only SQL console for an app that keeps its data in JSON files. The server leaves out the
   secrets (api/data-browser.js); nothing here can change a file. English-only, like Admin. */

const errText = e => (e && e.message) || 'Could not reach the server'
const when = ms => (ms ? new Date(ms).toLocaleString() : '–')

/** One JSON value as a tree of <details>, folded below the first two levels. */
function JsonNode({ k, v, depth }) {
  const label = k != null && <span style={{ color: 'var(--acc-ink)' }}>{JSON.stringify(k).slice(1, -1)}: </span>
  if (v && typeof v === 'object') {
    const arr = Array.isArray(v)
    const entries = arr ? v.map((x, i) => [i, x]) : Object.entries(v)
    return <details open={depth < 2} style={{ marginInlineStart: depth ? 12 : 0 }}>
      <summary style={{ cursor: 'pointer' }}>{label}<span className="dim">{arr ? `[${v.length}]` : `{${entries.length}}`} · {countLeaves(v)} values</span></summary>
      {entries.slice(0, 500).map(([ck, cv]) => <JsonNode key={ck} k={ck} v={cv} depth={depth + 1} />)}
      {entries.length > 500 && <div className="dim" style={{ marginInlineStart: 12 }}>{entries.length - 500} more not shown. Use the filter.</div>}
    </details>
  }
  const color = typeof v === 'string' ? 'var(--green)' : v == null ? 'var(--label-3)' : 'var(--orange)'
  return <div style={{ marginInlineStart: depth ? 12 : 0, wordBreak: 'break-all' }}>{label}<span style={{ color }}>{JSON.stringify(v)}</span></div>
}

function FileView({ file, close }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    api('/api/admin/data/file?path=' + encodeURIComponent(file.path)).then(setData).catch(e => setErr(errText(e)))
  }, [file.path])
  const shown = useMemo(() => {
    if (!data) return null
    if (data.kind === 'json') return filterJson(data.json, q)
    const needle = q.trim().toLowerCase()
    return needle ? data.text.split('\n').filter(l => l.toLowerCase().includes(needle)).join('\n') : data.text
  }, [data, q])
  return <>
    <h3 style={{ wordBreak: 'break-all' }}>{file.path}</h3>
    <div className="adm-lead">{fmtBytes(file.size)} · changed {when(file.mtime)} · read-only{data?.kind === 'json' ? '. Passwords, passkeys, two-factor secrets and tokens show as [redacted].' : ''}</div>
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Filter keys and values" />
    <div style={{ height: 10 }} />
    {err && <div className="adm-empty" role="alert">{err}</div>}
    {!data && !err && <div className="adm-empty">Loading…</div>}
    {data && <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.5, maxHeight: '60vh', overflow: 'auto' }}>
      {data.kind === 'json'
        ? (shown === undefined ? <div className="adm-empty">Nothing matches.</div> : <JsonNode v={shown} depth={0} />)
        : <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{shown || 'Nothing matches.'}</pre>}
    </div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={close}>Done</Button>
  </>
}

/** Download the export (GET /api/admin/export) as one JSON file. */
export async function downloadExport(toast) {
  try {
    const d = await api('/api/admin/export', { timeout: 120000 })
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mygym-export-${(d.exported || new Date().toISOString()).slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    toast?.(`Exported ${Object.keys(d.files || {}).length} files`)
  } catch (e) { toast?.(errText(e)) }
}

export default function AdminData() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const toast = useUI(s => s.toast)
  const [files, setFiles] = useState(null)
  const [err, setErr] = useState(null)
  const [q, setQ] = useState('')
  const load = () => api('/api/admin/data/files').then(d => { setFiles(d.files || []); setErr(null) }).catch(e => setErr(errText(e)))
  useEffect(() => { if (user?.admin) load() }, [user?.admin])
  if (!user?.admin) return null
  const needle = q.trim().toLowerCase()
  const list = (files || []).filter(f => !needle || f.path.toLowerCase().includes(needle))
  const total = (files || []).reduce((n, f) => n + f.size, 0)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/admin" onClick={() => nav('/admin')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>Data</h1>
        <div className="sub">{files ? `${files.length} files · ${fmtBytes(total)}` : err ? 'Could not load' : 'Loading…'}</div></div>
      <button className="iconbtn" onClick={load} aria-label="refresh">↻</button>
    </div>
    <div className="adm-intro">The files this server keeps its data in, read-only. The session secret, the push key, integration tokens and passkeys are never shown. Files over 2 MB do not open here; the export has them.</div>
    <Button icon="download" onClick={() => downloadExport(toast)}>Export everything</Button>
    <div style={{ height: 10 }} />
    <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Filter files" />
    {err && <div className="card" role="alert" style={{ borderColor: 'var(--red)', marginTop: 12 }}>{err}</div>}
    <div className="card" style={{ marginTop: 12 }}>
      <div className="list">
        {list.map(f => <div key={f.path} className="item" onClick={() => openSheet(close => <FileView file={f} close={close} />)}>
          <div className="grow"><div className="tt" style={{ wordBreak: 'break-all' }}>{f.path}</div>
            <div className="ss">{fmtBytes(f.size)} · {when(f.mtime)}</div></div>
          <Icon name="chevronRight" className="chev" />
        </div>)}
        {files && !list.length && <div className="adm-empty">No file matches.</div>}
      </div>
    </div>
  </div>
}
