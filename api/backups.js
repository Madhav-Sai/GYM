/* Automatic server backups (our addition). The server keeps everything as files under DATA_DIR,
 * and a hosted volume (Railway's, for one) is not backed up by anyone. So once a day, and at boot
 * when the newest backup is older than a day, every data file is packed into one gzipped JSON file:
 *
 *   DATA_DIR/backups/backup-YYYY-MM-DD.json.gz   (UTC date, mode 0600)
 *
 * It is a full restore, so it carries the secret material too: db.json with the passkeys,
 * `secret`, `vapid.json` and the sealed tokens in integrations/. That is deliberate; the file sits
 * on the owner's own disk, and a backup without the session secret cannot decrypt the integration
 * tokens or the Coach keys it holds. The lab report files (medical/files/, PDFs and photos of up
 * to 10 MB each) go in too, as base64: they exist nowhere else. What it leaves out: the backups
 * folder itself, uploads/ (the photos and videos, large and re-uploaded by the devices), temporary
 * files and unfinished uploads (`.partial`), symlinks, anything that is not a regular file.
 *
 * The newest BACKUP_KEEP (14) are kept. BACKUP_DISABLE=1 turns the schedule off.
 *
 * Restore (docs/SELF_HOSTING.md, section 6), with the api stopped:
 *   node backups.js restore /data/backups/backup-2026-11-10.json.gz /data
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const gzip = promisify(zlib.gzip);

export const BACKUP_DIR = 'backups';
export const BACKUP_NAME = /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/;
export const FORMAT = 'mygym-backup';
export const DAY_MS = 24 * 3600 * 1000;
// Top-level folders a backup never carries.
const SKIP_TOP = new Set([BACKUP_DIR, 'uploads', 'node_modules', 'lost+found']);
// A file being written (durable.js writes `<name>.tmp` and renames it).
const SKIP_NAME = /(\.tmp|\.tmp-.*|\.partial)$/i;
// One file larger than this is left out and named in `skipped` (a runaway log, say).
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

const posix = p => p.split(path.sep).join('/');

/** The backup file name for a moment: backup-YYYY-MM-DD.json.gz, in UTC. */
export const backupName = (now = Date.now()) => `backup-${new Date(now).toISOString().slice(0, 10)}.json.gz`;

/** Whether a DATA_DIR-relative path (posix) is one a backup leaves out. */
export function isSkipped(rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  if (!parts.length) return true;
  if (parts.some(p => p === '..' || p === '.')) return true;
  if (SKIP_TOP.has(parts[0])) return true;
  return SKIP_NAME.test(parts[parts.length - 1]);
}

/** Every regular file under `dir` a backup carries: [{ path, full, size, mode }], sorted by path. */
export function collectFiles(dir) {
  const root = fs.realpathSync(dir);
  const out = [];
  const skipped = [];
  const walk = (abs, depth) => {
    if (depth > 12) return;
    let names;
    try { names = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      const full = path.join(abs, d.name);
      const rel = posix(path.relative(root, full));
      if (isSkipped(rel) || d.isSymbolicLink()) continue;
      if (d.isDirectory()) { walk(full, depth + 1); continue; }
      if (!d.isFile()) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) { skipped.push({ path: rel, why: 'over 256 MB' }); continue; }
      out.push({ path: rel, full, size: st.size, mode: st.mode & 0o777 });
    }
  };
  walk(root, 0);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: out, skipped };
}

// Text that survives a round trip through a JS string unchanged is kept readable; anything else
// (a binary file, invalid UTF-8) goes as base64.
function encode(buf) {
  if (!buf.includes(0)) {
    const s = buf.toString('utf8');
    if (Buffer.byteLength(s, 'utf8') === buf.length && Buffer.from(s, 'utf8').equals(buf)) return { encoding: 'utf8', data: s };
  }
  return { encoding: 'base64', data: buf.toString('base64') };
}

/** The backup document for `dir` (not yet gzipped): { format, version, created, files, skipped }. */
export function buildDocument(dir, { now = Date.now() } = {}) {
  const { files, skipped } = collectFiles(dir);
  const entries = [];
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(f.full); } catch { skipped.push({ path: f.path, why: 'unreadable' }); continue; }
    entries.push({ path: f.path, mode: f.mode, size: buf.length, ...encode(buf) });
  }
  return { format: FORMAT, version: 1, created: new Date(now).toISOString(), files: entries, skipped };
}

/** A parsed backup from its gzipped bytes. Throws on anything that is not one of ours. */
export function readBackup(gz) {
  const doc = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  if (!doc || doc.format !== FORMAT || !Array.isArray(doc.files)) throw new Error('not a myGym backup');
  return doc;
}

/** A backup entry's path, checked: relative, no `..`, nothing a backup never carries. */
function safeRel(p) {
  const rel = String(p || '').replace(/\\/g, '/');
  if (!rel || rel.includes('\0') || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) return null;
  if (rel.split('/').some(s => s === '..' || s === '.' || s === '')) return null;
  return isSkipped(rel) ? null : rel;
}

/**
 * Writes every file of a backup back under `dir`, each with its own mode. Files that are in
 * `dir` and not in the backup are left alone. Returns { written, refused }.
 */
export function restoreBackup(gz, dir) {
  const doc = readBackup(gz);
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const written = [], refused = [];
  for (const f of doc.files) {
    const rel = safeRel(f.path);
    const full = rel && path.resolve(root, rel);
    if (!rel || !full.startsWith(root + path.sep) || (f.encoding !== 'utf8' && f.encoding !== 'base64')) { refused.push(String(f.path)); continue; }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const mode = Number.isInteger(f.mode) ? f.mode & 0o777 : 0o600;
    fs.writeFileSync(full, Buffer.from(String(f.data), f.encoding), { mode });
    try { fs.chmodSync(full, mode); } catch { /* a host filesystem that refuses chmod */ }
    written.push(rel);
  }
  return { written, refused };
}

/**
 * The backups of one DATA_DIR. `keep` is how many to keep; `now` a clock (tests).
 *   list()        [{ name, size, date, mtime }], newest first
 *   resolve(name) the absolute path of one backup; throws { status: 400 | 404 }
 *   run()         make today's backup now (replaces an earlier one from the same day), then rotate
 *   due()         whether the newest backup is older than a day (or there is none)
 *   start()       the schedule: a check at boot, then every hour; returns a stop function
 */
export function createBackups({ dir, keep = 14, now = () => Date.now(), log = console } = {}) {
  const bdir = path.join(dir, BACKUP_DIR);
  const keepN = Math.max(1, Math.floor(Number(keep)) || 14);
  let running = null;

  function list() {
    let names;
    try { names = fs.readdirSync(bdir, { withFileTypes: true }); } catch { return []; }
    const out = [];
    for (const d of names) {
      if (!d.isFile() || !BACKUP_NAME.test(d.name)) continue;
      try {
        const st = fs.statSync(path.join(bdir, d.name));
        out.push({ name: d.name, size: st.size, date: d.name.slice(7, 17), mtime: st.mtimeMs });
      } catch { /* removed meanwhile */ }
    }
    // The date in the name first, the write time for two of the same day (cannot happen, but).
    return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.mtime - a.mtime));
  }

  function resolve(name) {
    const fail = (status, message) => Object.assign(new Error(message), { status });
    if (typeof name !== 'string' || !BACKUP_NAME.test(name)) throw fail(400, 'not a backup name');
    const full = path.join(bdir, name);
    let st;
    try { st = fs.lstatSync(full); } catch { throw fail(404, 'no such backup'); }
    if (!st.isFile()) throw fail(404, 'no such backup');
    return { full, name, size: st.size };
  }

  function rotate() {
    const removed = [];
    for (const b of list().slice(keepN)) {
      try { fs.unlinkSync(path.join(bdir, b.name)); removed.push(b.name); } catch { /* gone */ }
    }
    return removed;
  }

  async function make() {
    const t = now();
    const doc = buildDocument(dir, { now: t });
    const gz = await gzip(Buffer.from(JSON.stringify(doc), 'utf8'));
    fs.mkdirSync(bdir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(bdir, 0o700); } catch { /* refused */ }
    const name = backupName(t);
    const file = path.join(bdir, name);
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, gz); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try { fs.chmodSync(tmp, 0o600); } catch { /* refused */ }
    fs.renameSync(tmp, file);
    const removed = rotate();
    return { name, size: gz.length, date: name.slice(7, 17), files: doc.files.length, skipped: doc.skipped, removed };
  }

  /** One at a time: a second call while one is being written gets the same answer. */
  function run() {
    if (!running) running = make().finally(() => { running = null; });
    return running;
  }

  function due() {
    const newest = list()[0];
    return !newest || now() - newest.mtime >= DAY_MS;
  }

  function start({ everyMs = 3600000, firstMs = 30000 } = {}) {
    const check = () => {
      if (!due()) return;
      run().then(r => log.log?.(`backups: wrote ${r.name} (${r.files} files, ${(r.size / 1024).toFixed(0)} KB)`))
        .catch(e => log.error?.('backups: failed', e?.message || e));
    };
    const first = setTimeout(check, firstMs);
    const iv = setInterval(check, everyMs);
    first.unref?.(); iv.unref?.();
    return () => { clearTimeout(first); clearInterval(iv); };
  }

  return { dir: bdir, keep: keepN, list, resolve, rotate, run, due, start };
}

/* `node backups.js restore <backup.json.gz> <data dir>`, with the api stopped. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, file, target] = process.argv.slice(2);
  if (cmd !== 'restore' || !file || !target) {
    console.error('usage: node backups.js restore <backup-YYYY-MM-DD.json.gz> <data dir>');
    process.exit(2);
  }
  const r = restoreBackup(fs.readFileSync(file), target);
  console.log(`restored ${r.written.length} files into ${path.resolve(target)}`);
  if (r.refused.length) console.log(`refused ${r.refused.length}: ${r.refused.join(', ')}`);
}
