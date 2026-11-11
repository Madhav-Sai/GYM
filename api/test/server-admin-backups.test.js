/* The backup routes (our addition), against the real server.js in a child: signed out is 401, a
   plain user is 403, an admin can make, list and download one, and the download takes a backup
   name and nothing else. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const ADMIN = 'u_adm_1', USER = 'u_usr_1';

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const headersOf = uid => ({ ...(uid ? { Cookie: `gymsid=${mintSession(uid)}` } : {}), 'Content-Type': 'application/json', Origin: ORIGIN });

async function startServer(t, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-admbak-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(root, 'outside.json'), JSON.stringify({ leaked: true }));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ADMIN, name: 'Adminna', created: new Date().toISOString(), admin: true },
      { id: USER, name: 'Plain', created: new Date().toISOString() }
    ],
    creds: [{ userId: ADMIN, id: 'cred-id', publicKey: 'PUBKEY', counter: 3 }], subs: [], invites: []
  }));
  fs.writeFileSync(path.join(dataDir, `state-${USER}.json`), JSON.stringify({ unit: 'kg' }));
  fs.mkdirSync(path.join(dataDir, 'uploads'));
  fs.writeFileSync(path.join(dataDir, 'uploads', 'x.jpg'), 'not really');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', ...env }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  h.req = (method, p, uid = ADMIN) => fetch(`${h.api}${p}`, { method, headers: headersOf(uid), ...(method === 'POST' ? { body: '{}' } : {}) });
  return h;
}

test('every backup route is 401 signed out and 403 for a plain user', async t => {
  const h = await startServer(t);
  for (const [m, p] of [['GET', '/api/admin/backups'], ['GET', '/api/admin/backups/file?name=backup-2026-11-11.json.gz'], ['POST', '/api/admin/backups/run']]) {
    assert.equal((await h.req(m, p, null)).status, 401, p);
    assert.equal((await h.req(m, p, USER)).status, 403, p);
  }
  assert.ok(!fs.existsSync(path.join(h.dataDir, 'backups')) || !fs.readdirSync(path.join(h.dataDir, 'backups')).length);
});

test('an admin makes a backup, sees it listed and downloads the full restore', async t => {
  const h = await startServer(t);
  const run = await h.req('POST', '/api/admin/backups/run');
  assert.equal(run.status, 200);
  const made = await run.json();
  assert.match(made.backup.name, /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/);

  const list = await (await h.req('GET', '/api/admin/backups')).json();
  assert.equal(list.enabled, true);
  assert.equal(list.keep, 14);
  assert.deepEqual(list.backups.map(b => b.name), [made.backup.name]);

  const dl = await h.req('GET', `/api/admin/backups/file?name=${made.backup.name}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/gzip');
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const doc = JSON.parse(zlib.gunzipSync(Buffer.from(await dl.arrayBuffer())).toString('utf8'));
  const byPath = Object.fromEntries(doc.files.map(f => [f.path, f]));
  assert.equal(byPath.secret.data, SECRET);
  assert.match(byPath['db.json'].data, /PUBKEY/);
  assert.ok(!Object.keys(byPath).some(p => p.startsWith('uploads/') || p.startsWith('backups/')));

  // Not in the data browser.
  const files = await (await h.req('GET', '/api/admin/data/files')).json();
  assert.ok(!files.files.some(f => f.path.startsWith('backups')));
  assert.equal((await h.req('GET', `/api/admin/data/file?path=backups/${made.backup.name}`)).status, 403);
});

test('the download takes a backup name, never a path', async t => {
  const h = await startServer(t);
  await h.req('POST', '/api/admin/backups/run');
  for (const name of ['../secret', '..%2Fsecret', '../../outside.json', '%2Fetc%2Fpasswd', 'db.json', 'backup-2026-11-11.json.gz%2F..%2F..%2Fsecret', '']) {
    const r = await h.req('GET', `/api/admin/backups/file?name=${name}`);
    assert.equal(r.status, 400, name);
  }
  assert.equal((await h.req('GET', '/api/admin/backups/file')).status, 400);
  assert.equal((await h.req('GET', '/api/admin/backups/file?name=backup-1999-01-01.json.gz')).status, 404);
});

test('BACKUP_DISABLE=1 turns "Back up now" off', async t => {
  const h = await startServer(t, { BACKUP_DISABLE: '1' });
  assert.equal((await h.req('POST', '/api/admin/backups/run')).status, 409);
  const list = await (await h.req('GET', '/api/admin/backups')).json();
  assert.equal(list.enabled, false);
  assert.deepEqual(list.backups, []);
});
