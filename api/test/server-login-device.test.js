/* POST /api/login/device (this fork): a phone signs in with a name and password and gets a bearer token,
   never a cookie. Same password check and lockout as /api/login/password. Real server.js in a child. */
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
const GOOD = 'a-long-admin-password-for-device-1';

async function start(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-dev-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: GOOD, ...env },
  });
  const h = { log: '' };
  child.stdout.on('data', d => (h.log += d)); child.stderr.on('data', d => (h.log += d));
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  // What a phone sends: no Sec-Fetch-Site, and an Origin that is not the server's own.
  h.post = async (p, body, headers = {}) => {
    const r = await fetch(h.api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'capacitor://localhost', 'X-Forwarded-For': '198.51.100.7', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})), setCookie: r.headers.getSetCookie() };
  };
  h.get = async (p, headers) => { const r = await fetch(h.api + p, { headers }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  return h;
}

test('right password: a token and the user, no cookie, and the token works as a Bearer', async t => {
  const h = await start(t);
  const r = await h.post('/api/login/device', { name: 'Madhav', password: GOOD });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.admin, true);
  assert.ok(typeof r.body.token === 'string' && r.body.token.length > 20);
  assert.deepEqual(r.setCookie, [], 'no cookie is ever set on this route');
  const me = await h.get('/api/me', { Authorization: 'Bearer ' + r.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user?.name ?? me.body.name, 'Madhav');
});

test('wrong password and unknown name are one answer, and neither gets a token', async t => {
  const h = await start(t);
  const a = await h.post('/api/login/device', { name: 'Madhav', password: 'wrong-wrong-wrong-1' });
  const b = await h.post('/api/login/device', { name: 'Nobody', password: 'wrong-wrong-wrong-1' }, { 'X-Forwarded-For': '198.51.100.8' });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
  assert.ok(!a.body.token && !b.body.token);
});

test('it shares the password lockout: five wrong are free, the sixth pauses the account for the browser route too', async t => {
  const h = await start(t);
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await h.post('/api/login/device', { name: 'Madhav', password: 'wrong-wrong-wrong-' + i }, { 'X-Forwarded-For': '198.51.100.' + (20 + i) })).status);
  assert.equal(codes.slice(0, 5).every(c => c === 401), true, String(codes));
  assert.ok(codes.slice(5).some(c => c === 429), 'the lockout reached the phone route: ' + codes);
  // the browser route is held by the same pause
  const web = await h.post('/api/login/password', { name: 'Madhav', password: GOOD }, { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:8080', 'X-Forwarded-For': '198.51.100.99' });
  assert.notEqual(web.status, 200);
});

test('with PASSWORD_LOGIN off the route does not exist', async t => {
  const h = await start(t, { PASSWORD_LOGIN: '' , ADMIN_NAME: '', ADMIN_PASSWORD: '' });
  const r = await h.post('/api/login/device', { name: 'Madhav', password: GOOD });
  assert.equal(r.status, 404);
});
