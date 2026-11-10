/* Two-factor sign-in (TOTP) for the password login: setup, enable, status, disable, and both
   sign-in routes (/api/login/password for a browser, /api/login/device for the phone). Real
   server.js in a child, like server-login-device.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { totp, stepAt } from '../totp.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const GOOD = 'a-long-admin-password-for-2fa-1';
const WEB = { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:8080' };

async function start(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-2fa-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: GOOD, ...env },
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => (h.log += d)); child.stderr.on('data', d => (h.log += d));
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  let ip = 10;
  h.post = async (p, body, headers = {}) => {
    const r = await fetch(h.api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'capacitor://localhost', 'X-Forwarded-For': '198.51.100.' + (ip++), ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})), setCookie: r.headers.getSetCookie() };
  };
  h.get = async (p, headers) => { const r = await fetch(h.api + p, { headers }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  // A phone session (bearer), the way the app holds one.
  h.signIn = async () => {
    const r = await h.post('/api/login/device', { name: 'Madhav', password: GOOD });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { Authorization: 'Bearer ' + r.body.token };
  };
  return h;
}

// Sets two-factor up and turns it on; answers the secret and the recovery codes.
async function enable(h, auth) {
  const s = await h.post('/api/2fa/setup', { password: GOOD }, auth);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const code = totp(s.body.secret);
  const e = await h.post('/api/2fa/enable', { code }, auth);
  assert.equal(e.status, 200, JSON.stringify(e.body));
  return { secret: s.body.secret, uri: s.body.uri, codes: e.body.recoveryCodes, used: code };
}
// A code for the next step, which the window accepts and the one just used has not spent.
const nextCode = secret => totp(secret, (stepAt() + 1) * 30000);

test('status, setup and enable: a secret and an otpauth URI, then ten recovery codes once', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  assert.deepEqual((await h.get('/api/2fa/status', auth)).body, { enabled: false, since: null, recoveryLeft: 0, pending: false, password: true });
  assert.equal((await h.get('/api/2fa/status')).status, 401, 'a session is required');

  // Setup asks the current password first.
  assert.equal((await h.post('/api/2fa/setup', {}, auth)).body.code, 'current-required');
  assert.equal((await h.post('/api/2fa/setup', { password: 'wrong-wrong-wrong' }, auth)).body.code, 'current-wrong');
  const s = await h.post('/api/2fa/setup', { password: GOOD }, auth);
  assert.equal(s.status, 200);
  assert.match(s.body.secret, /^[A-Z2-7]{32}$/);
  assert.match(s.body.uri, /^otpauth:\/\/totp\/myGym:Madhav\?secret=[A-Z2-7]{32}&issuer=myGym&algorithm=SHA1&digits=6&period=30$/);
  assert.equal((await h.get('/api/2fa/status', auth)).body.pending, true);
  // Not in force yet: the password alone still signs in.
  assert.equal((await h.post('/api/login/device', { name: 'Madhav', password: GOOD })).status, 200);

  // At rest the secret is sealed, never in the clear.
  const raw = fs.readFileSync(path.join(h.dataDir, 'db.json'), 'utf8');
  assert.ok(!raw.includes(s.body.secret), 'the secret is not stored in the clear');

  assert.equal((await h.post('/api/2fa/enable', { code: '000000' === totp(s.body.secret) ? '111111' : '000000' }, auth)).body.code, 'bad-2fa-code');
  const e = await h.post('/api/2fa/enable', { code: totp(s.body.secret) }, auth);
  assert.equal(e.status, 200);
  assert.equal(e.body.recoveryCodes.length, 10);
  assert.equal(e.body.enabled, true);
  const st = (await h.get('/api/2fa/status', auth)).body;
  assert.equal(st.enabled, true); assert.equal(st.recoveryLeft, 10); assert.ok(st.since);
  // The recovery codes are stored hashed.
  const after = fs.readFileSync(path.join(h.dataDir, 'db.json'), 'utf8');
  for (const c of e.body.recoveryCodes) assert.ok(!after.includes(c) && !after.includes(c.replace('-', '')));
  // Turning it on again is refused.
  assert.equal((await h.post('/api/2fa/setup', { password: GOOD }, auth)).body.code, '2fa-on');
});

test('sign-in with two-factor on: the password alone gets 2fa-required and no session, a code gets in (phone and browser)', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  const { secret, used } = await enable(h, auth);

  const bare = await h.post('/api/login/device', { name: 'Madhav', password: GOOD });
  assert.equal(bare.status, 401);
  assert.equal(bare.body.code, '2fa-required');
  assert.ok(!bare.body.token && !bare.body.user);
  assert.deepEqual(bare.setCookie, []);

  const web = await h.post('/api/login/password', { name: 'Madhav', password: GOOD }, WEB);
  assert.equal(web.status, 401);
  assert.equal(web.body.code, '2fa-required');
  assert.deepEqual(web.setCookie, [], 'no session cookie without the code');

  // A wrong password with or without a code is still the plain wrong-password answer.
  const wrongPw = await h.post('/api/login/device', { name: 'Madhav', password: 'wrong-wrong-wrong-1', code: totp(secret) });
  assert.equal(wrongPw.body.code, 'bad-credentials');

  // The code that turned it on is spent.
  const replay = await h.post('/api/login/device', { name: 'Madhav', password: GOOD, code: used });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, 'bad-2fa-code');

  const code = nextCode(secret);
  const ok = await h.post('/api/login/device', { name: 'Madhav', password: GOOD, code });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token);
  // Single use: the same code again, on the browser route, is refused.
  const again = await h.post('/api/login/password', { name: 'Madhav', password: GOOD, code }, WEB);
  assert.equal(again.status, 401);
  assert.equal(again.body.code, 'bad-2fa-code');
});

test('browser sign-in with a recovery code sets the cookie, and each recovery code works once', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  const { codes } = await enable(h, auth);
  const r = await h.post('/api/login/password', { name: 'Madhav', password: GOOD, code: codes[2].toLowerCase() }, WEB);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.setCookie.some(c => c.includes('=') && /HttpOnly/.test(c)));
  assert.equal((await h.get('/api/2fa/status', auth)).body.recoveryLeft, 9);
  const twice = await h.post('/api/login/password', { name: 'Madhav', password: GOOD, code: codes[2] }, WEB);
  assert.equal(twice.status, 401);
  assert.equal(twice.body.code, 'bad-2fa-code');
});

test('wrong codes are throttled like wrong passwords: five free, then the account is paused', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  const { secret } = await enable(h, auth);
  const good = nextCode(secret);
  const bad = good === '123456' ? '654321' : '123456';
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await h.post('/api/login/device', { name: 'Madhav', password: GOOD, code: bad })).status);
  assert.ok(statuses.slice(0, 5).every(s => s === 401), String(statuses));
  assert.ok(statuses.slice(5).some(s => s === 429), 'the pause reached the code: ' + statuses);
  // Paused: even the right code is not checked now.
  assert.equal((await h.post('/api/login/device', { name: 'Madhav', password: GOOD, code: good })).status, 429);
  // Leaving the code out does not count against anyone (asked before any guessing).
});

test('a missing code is not counted as a failure', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  const { secret } = await enable(h, auth);
  for (let i = 0; i < 8; i++) assert.equal((await h.post('/api/login/device', { name: 'Madhav', password: GOOD })).body.code, '2fa-required');
  assert.equal((await h.post('/api/login/device', { name: 'Madhav', password: GOOD, code: nextCode(secret) })).status, 200);
});

test('disable needs the password and a code; afterwards the password alone signs in again', async t => {
  const h = await start(t);
  const auth = await h.signIn();
  const { secret, codes } = await enable(h, auth);
  assert.equal((await h.post('/api/2fa/disable', { code: nextCode(secret) }, auth)).body.code, 'current-required');
  assert.equal((await h.post('/api/2fa/disable', { password: 'wrong-wrong-wrong', code: nextCode(secret) }, auth)).body.code, 'current-wrong');
  assert.equal((await h.post('/api/2fa/disable', { password: GOOD, code: 'AAAAA-AAAAA' }, auth)).body.code, 'bad-2fa-code');
  assert.equal((await h.post('/api/2fa/disable', { password: GOOD }, auth)).body.code, 'bad-2fa-code');
  const off = await h.post('/api/2fa/disable', { password: GOOD, code: codes[0] }, auth);
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(off.body.enabled, false);
  assert.equal((await h.get('/api/2fa/status', auth)).body.enabled, false);
  assert.ok(!h.db().users.find(u => u.name === 'Madhav').totp, 'nothing of it is kept');
  assert.equal((await h.post('/api/login/device', { name: 'Madhav', password: GOOD })).status, 200);
});

test('the browser routes keep the CSRF rule: a cross-site setup is refused', async t => {
  const h = await start(t);
  const r = await h.post('/api/login/password', { name: 'Madhav', password: GOOD }, WEB);
  const cookie = r.setCookie.map(c => c.split(';')[0]).join('; ');
  const cross = await h.post('/api/2fa/setup', { password: GOOD }, { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.code, 'origin-mismatch');
  const same = await h.post('/api/2fa/setup', { password: GOOD }, { Cookie: cookie, ...WEB });
  assert.equal(same.status, 200);
});

test('with PASSWORD_LOGIN off the routes do not exist', async t => {
  const h = await start(t, { PASSWORD_LOGIN: '', ADMIN_NAME: '', ADMIN_PASSWORD: '' });
  assert.equal((await h.get('/api/2fa/status')).status, 404);
  assert.equal((await h.post('/api/2fa/setup', {})).status, 404);
});
