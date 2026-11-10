/* The admin data browser, the export and the food database routes (our addition), against the real
   server.js in a child: signed-out is 401, a plain user is 403, and an admin never gets a secret,
   a passkey, a password hash or a file outside DATA_DIR, however the path is spelled. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';

function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const ADMIN = 'u_adm_1', USER = 'u_usr_1';
const headersOf = uid => (uid ? { Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: ORIGIN } : { 'Content-Type': 'application/json', Origin: ORIGIN });

async function startServer(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-admdata-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  // A file beside DATA_DIR that a traversal would reach.
  fs.writeFileSync(path.join(root, 'outside.json'), JSON.stringify({ leaked: true }));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ADMIN, name: 'Adminna', created: new Date().toISOString(), admin: true, pw: 'scrypt$salt$hash', totp: 'sealed-totp', email: 'a@example.test' },
      { id: USER, name: 'Plain', created: new Date().toISOString(), pwReset: { hash: 'h', exp: 1 } }
    ],
    creds: [{ userId: ADMIN, id: 'cred-id', publicKey: 'PUBKEY', counter: 3 }],
    subs: [{ userId: ADMIN, endpoint: 'https://push.example.test/x', keys: { p256dh: 'P', auth: 'A' } }],
    invites: [], deviceLinks: [{ hash: 'linkhash' }]
  }));
  fs.writeFileSync(path.join(dataDir, 'db.json.bak'), JSON.stringify({ creds: [{ publicKey: 'BAK' }] }));
  fs.writeFileSync(path.join(dataDir, `state-${USER}.json`), JSON.stringify({ unit: 'kg', bodyweight: [{ d: '2026-11-01', w: 72.9 }] }));
  fs.mkdirSync(path.join(dataDir, 'integrations'));
  fs.writeFileSync(path.join(dataDir, 'integrations', `u-${ADMIN}.json`), JSON.stringify({ connections: [{ sealed: 'TOKEN' }] }));
  fs.writeFileSync(path.join(dataDir, 'push-token.json'), JSON.stringify({ t: 'T' }));
  fs.writeFileSync(path.join(dataDir, 'big.json'), JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024 + 10) }));
  try { fs.symlinkSync(path.join(root, 'outside.json'), path.join(dataDir, 'link.json')); } catch { /* no symlinks here */ }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost' }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  // The server made its own push keys at boot: the private one must never come back.
  h.vapidPrivate = JSON.parse(fs.readFileSync(path.join(dataDir, 'vapid.json'), 'utf8')).privateKey;
  assert.ok(h.vapidPrivate);
  h.get = async (p, uid = ADMIN) => { const r = await fetch(`${h.api}${p}`, { headers: headersOf(uid) }); return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }; };
  h.post = async (p, body, uid = ADMIN) => { const r = await fetch(`${h.api}${p}`, { method: 'POST', headers: headersOf(uid), body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  return h;
}

const ADMIN_GETS = ['/api/admin/data/files', '/api/admin/data/file?path=db.json', '/api/admin/export'];

test('signed out is 401 and a plain user is 403 on every admin data route', async t => {
  const h = await startServer(t);
  for (const p of ADMIN_GETS) {
    assert.equal((await h.get(p, null)).status, 401, p);
    assert.equal((await h.get(p, USER)).status, 403, p);
  }
  for (const p of ['/api/admin/foods/save', '/api/admin/foods/delete']) {
    assert.equal((await h.post(p, { food: { name: 'X' }, id: 'x' }, null)).status, 401, p);
    assert.equal((await h.post(p, { food: { name: 'X' }, id: 'x' }, USER)).status, 403, p);
  }
  assert.equal((await h.get('/api/health/foods', null)).status, 401);
});

test('the file list leaves out every secret file', async t => {
  const h = await startServer(t);
  const r = await h.get('/api/admin/data/files');
  assert.equal(r.status, 200);
  const paths = r.body.files.map(f => f.path);
  assert.ok(paths.includes('db.json'));
  assert.ok(paths.includes(`state-${USER}.json`));
  for (const p of ['secret', 'vapid.json', 'db.json.bak', 'push-token.json', 'link.json']) assert.ok(!paths.includes(p), p);
  assert.ok(!paths.some(p => p.startsWith('integrations/')), 'integrations/ is never listed');
  const f = r.body.files.find(x => x.path === 'db.json');
  assert.ok(f.size > 0 && f.mtime > 0);
});

test('db.json comes back without passkeys, passwords, two-factor or push keys', async t => {
  const h = await startServer(t);
  const r = await h.get('/api/admin/data/file?path=db.json');
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'json');
  const text = JSON.stringify(r.body.json);
  for (const s of ['PUBKEY', 'cred-id', 'scrypt$salt$hash', 'sealed-totp', 'linkhash', '"P"', '"A"']) assert.ok(!text.includes(s), s);
  assert.equal(r.body.json.users[0].name, 'Adminna');
  assert.equal(r.body.json.users[0].email, 'a@example.test');
  assert.equal(r.body.json.creds, '[redacted]');
  const s = await h.get(`/api/admin/data/file?path=state-${USER}.json`);
  assert.equal(s.body.json.bodyweight[0].w, 72.9);
});

test('traversal, absolute paths, links and excluded files are refused', async t => {
  const h = await startServer(t);
  const bad = ['../outside.json', 'state/../../outside.json', '/etc/passwd', '..%2Foutside.json', encodeURIComponent('../outside.json'),
    'secret', 'vapid.json', 'db.json.bak', 'integrations/u-' + ADMIN + '.json', 'push-token.json', 'link.json', '.', '', 'nope.json'];
  for (const p of bad) {
    const r = await h.get('/api/admin/data/file?path=' + p);
    assert.ok([400, 403, 404].includes(r.status), `${p} answered ${r.status}`);
    assert.ok(!JSON.stringify(r.body).includes('leaked'), p);
    assert.ok(!JSON.stringify(r.body).includes(SECRET), p);
    assert.ok(!JSON.stringify(r.body).includes(h.vapidPrivate), p);
  }
  assert.equal((await h.get('/api/admin/data/file?path=big.json')).status, 413);
});

test('the export is one download of every non-secret file', async t => {
  const h = await startServer(t);
  const r = await h.get('/api/admin/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition') || '', /attachment; filename="mygym-export-/);
  const keys = Object.keys(r.body.files);
  assert.ok(keys.includes('db.json') && keys.includes(`state-${USER}.json`));
  const text = JSON.stringify(r.body);
  for (const s of [SECRET, h.vapidPrivate, 'PUBKEY', 'TOKEN', 'scrypt$salt$hash', 'leaked', 'BAK']) assert.ok(!text.includes(s), s);
  assert.ok(r.body.skipped.some(s => s.path === 'big.json') || keys.includes('big.json'));
});

test('foods: an admin adds, edits and hides; everyone signed in reads the changes', async t => {
  const h = await startServer(t);
  let r = await h.get('/api/health/foods', USER);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.added, []);
  r = await h.post('/api/admin/foods/save', { food: { name: 'Sattu', unit: 'g', per: 100, kcal: 400, protein: 22, carbs: 60, fat: 6, fiber: 10, satFat: null, omega3: null, veg: true, cat: 'dal' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.food.id, 'x-sattu');
  r = await h.post('/api/admin/foods/save', { builtin: true, food: { id: 'chicken', protein: 30, vegAlt: 'paneer' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.edited.chicken, { protein: 30, vegAlt: 'paneer' });
  r = await h.post('/api/admin/foods/delete', { id: 'rohu' });
  assert.deepEqual(r.body.hidden, ['rohu']);
  r = await h.get('/api/health/foods', USER);
  assert.equal(r.body.added[0].name, 'Sattu');
  assert.deepEqual(r.body.hidden, ['rohu']);
  r = await h.post('/api/admin/foods/delete', { id: 'rohu', restore: true });
  assert.deepEqual(r.body.hidden, []);
  r = await h.post('/api/admin/foods/save', { food: { name: 'Bad', unit: 'kg' } });
  assert.equal(r.status, 400);
  // foods.json is shown in the data browser like any other data file
  const list = await h.get('/api/admin/data/files');
  assert.ok(list.body.files.some(f => f.path === 'health/foods.json'));
});
