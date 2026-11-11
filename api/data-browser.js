/* The admin data browser and export (our addition): a read-only look at the JSON files under
 * DATA_DIR, the equivalent of a read-only SQL console for an app that keeps its data in files.
 *
 * What never leaves the server, by path:
 *   secret (the session HMAC key), vapid.json (the push private key), integrations/ (sealed
 *   tokens), coach-auth-* (provider logins), anything whose name says token, secret, key or pem,
 *   the db.json copies (.bak, .unreadable-*) that would carry the passkeys, dot files and symlinks.
 * And by field, in every JSON file served: the passkeys (db.creds), device links, password hashes
 * and reset codes, two-factor secrets, push subscription keys, and any field whose name says
 * password, secret, token, auth, apiKey or privateKey. A path is read only when it resolves inside
 * DATA_DIR after following every link. */
import fs from 'node:fs';
import path from 'node:path';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
export const REDACTED = '[redacted]';

// backups/ (backups.js) holds full copies of everything, secrets included: never listed, never read.
const EXCLUDED_DIRS = new Set(['integrations', 'node_modules', 'backups']);
const EXCLUDED_NAME = [
  /^secret$/i, /secret/i, /token/i, /^vapid\.json$/i, /^coach-auth/i, /\.(key|pem|p12|pfx)$/i,
  /^db\.json\..+/i, /\.tmp$/i,
];
// Field names dropped from every JSON file (case-insensitive, whole name).
const SECRET_FIELD = /^(pw|pwhash|pwreset|password.*|passwordhash|totp.*|twofa.*|2fa.*|mfa.*|secret.*|.*secret|.*token.*|auth|authkey|apikey|api_key|privatekey|private_key|keys|sealed.*|recovery.*|credential.*|creds)$/i;
// Whole top-level arrays of db.json that are credentials and nothing else.
const DB_DROP = ['creds', 'deviceLinks'];

const posix = p => p.split(path.sep).join('/');

/** Whether a DATA_DIR-relative path (posix slashes) is one the browser may show at all. */
export function isExcluded(rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  if (!parts.length) return true;
  if (parts.some(p => p === '..' || p === '.' || p.startsWith('.'))) return true;
  if (EXCLUDED_DIRS.has(parts[0])) return true;
  return parts.some(p => EXCLUDED_NAME.some(re => re.test(p)));
}

/** A deep copy of a parsed JSON value with every secret field replaced by "[redacted]". */
export function redact(value, depth = 0) {
  if (depth > 64) return REDACTED;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELD.test(k) ? REDACTED : redact(v, depth + 1);
  return out;
}

/** db.json without the passkeys and device links, then redacted like any other file. */
export function sanitiseDb(db) {
  const copy = { ...(db || {}) };
  for (const k of DB_DROP) if (k in copy) copy[k] = REDACTED;
  return redact(copy);
}

/** The parsed, redacted content of a JSON file at `rel` (db.json gets sanitiseDb). */
export function sanitiseJson(rel, parsed) {
  return rel === 'db.json' ? sanitiseDb(parsed) : redact(parsed);
}

export function createDataBrowser({ dir }) {
  const rootReal = () => fs.realpathSync(dir);

  /**
   * The real path of `rel` inside DATA_DIR, or a thrown 400/403/404. Refuses absolute paths, NUL,
   * any `..`, an excluded path, a symlink anywhere on the way, and anything that resolves outside.
   */
  function resolve(rel) {
    const fail = (status, message) => Object.assign(new Error(message), { status });
    if (typeof rel !== 'string' || !rel || rel.length > 512 || rel.includes('\0')) throw fail(400, 'path missing');
    const norm = rel.replace(/\\/g, '/');
    if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) throw fail(400, 'path must be relative to the data folder');
    if (norm.split('/').some(p => p === '..')) throw fail(400, 'path must stay inside the data folder');
    const clean = norm.split('/').filter(p => p && p !== '.').join('/');
    if (isExcluded(clean)) throw fail(403, 'this file is not shown');
    const root = rootReal();
    const full = path.resolve(root, clean);
    if (full !== root && !full.startsWith(root + path.sep)) throw fail(400, 'path must stay inside the data folder');
    let st;
    try { st = fs.lstatSync(full); } catch { throw fail(404, 'no such file'); }
    if (st.isSymbolicLink()) throw fail(403, 'this file is not shown');
    let real;
    try { real = fs.realpathSync(full); } catch { throw fail(404, 'no such file'); }
    if (!real.startsWith(root + path.sep)) throw fail(403, 'this file is not shown');
    if (!st.isFile()) throw fail(404, 'not a file');
    return { full: real, rel: clean, size: st.size, mtime: st.mtimeMs };
  }

  /** Every file the browser may show: { path, size, mtime }, sorted by path. */
  function list() {
    const root = rootReal();
    const out = [];
    const walk = (abs, depth) => {
      if (depth > 6) return;
      let names;
      try { names = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
      for (const d of names) {
        const full = path.join(abs, d.name);
        const rel = posix(path.relative(root, full));
        if (isExcluded(rel) || d.isSymbolicLink()) continue;
        if (d.isDirectory()) walk(full, depth + 1);
        else if (d.isFile()) {
          try { const st = fs.statSync(full); out.push({ path: rel, size: st.size, mtime: st.mtimeMs }); } catch { /* gone */ }
        }
        if (out.length >= 5000) return;
      }
    };
    walk(root, 0);
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  const isText = buf => !buf.includes(0);

  /** One file, read-only: { path, size, mtime, kind: 'json' | 'text', json | text }. Throws 4xx. */
  function read(rel) {
    const f = resolve(rel);
    if (f.size > MAX_FILE_BYTES) throw Object.assign(new Error('file is over 2 MB'), { status: 413 });
    const buf = fs.readFileSync(f.full);
    const meta = { path: f.rel, size: f.size, mtime: f.mtime };
    if (/\.json$/i.test(f.rel)) {
      try { return { ...meta, kind: 'json', json: sanitiseJson(f.rel, JSON.parse(buf.toString('utf8'))) }; }
      catch { throw Object.assign(new Error('file is not valid JSON'), { status: 422 }); }
    }
    if (!isText(buf)) throw Object.assign(new Error('not a text file'), { status: 415 });
    return { ...meta, kind: 'text', text: buf.toString('utf8') };
  }

  /** Every file the browser shows, in one object: JSON parsed and redacted, text as text. */
  function exportAll({ now = Date.now() } = {}) {
    const files = {};
    const skipped = [];
    let total = 0;
    for (const f of list()) {
      if (total + f.size > MAX_EXPORT_BYTES) { skipped.push({ path: f.path, why: 'export size cap' }); continue; }
      try {
        const buf = fs.readFileSync(path.join(rootReal(), f.path));
        if (/\.json$/i.test(f.path)) {
          try { files[f.path] = sanitiseJson(f.path, JSON.parse(buf.toString('utf8'))); }
          catch { skipped.push({ path: f.path, why: 'not valid JSON' }); continue; }
        } else if (isText(buf)) files[f.path] = buf.toString('utf8');
        else { skipped.push({ path: f.path, why: 'binary' }); continue; }
        total += f.size;
      } catch { skipped.push({ path: f.path, why: 'unreadable' }); }
    }
    return { exported: new Date(now).toISOString(), files, skipped };
  }

  return { list, read, resolve, exportAll };
}
