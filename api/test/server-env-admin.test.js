/* ADMIN_NAME + ADMIN_PASSWORD (this fork's addition): the server makes sure that admin exists, signs in
   with exactly that password, and the environment stays the source of truth across restarts.
   Real server.js in a child, the same harness as server-first-user-admin.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { hashPassword } from '../password.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const P1 = 'first-long-admin-password-1';
const P2 = 'second-long-admin-password-2';

const newDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-envadmin-'));
  fs.writeFileSync(path.join(d, 'secret'), SECRET, { mode: 0o600 });
  return d;
};

async function start(t, dataDir, env = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '', ADMIN_UIDS: '', ADMIN_NAME: '', ADMIN_PASSWORD: '', ...env },
  });
  const h = { log: '', dataDir, stop: () => new Promise(r => { child.once('exit', r); child.kill('SIGKILL'); }) };
  child.stdout.on('data', d => (h.log += d));
  child.stderr.on('data', d => (h.log += d));
  t.after(() => child.kill('SIGKILL'));
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, cookie, ip = '198.51.100.1' } = {}) => {
    const r = await fetch(`${h.api}${p}`, {
      method, headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.getSetCookie().find(c => c.startsWith('gymsid=') && !c.startsWith('gymsid=;'));
    return { status: r.status, body: await r.json().catch(() => ({})), cookie: sc ? sc.split(';')[0] : null };
  };
  h.login = (name, password, ip) => h.req('POST', '/api/login/password', { body: { name, password }, ip });
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}
const cleanup = (t, d) => t.after(() => fs.rmSync(d, { recursive: true, force: true }));

test('the admin is created from the environment, signs in with that password, and can use the admin routes', async t => {
  const dir = newDir(); cleanup(t, dir);
  const h = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1 });
  assert.match(h.log, /admin "Madhav" created from the environment/);
  const ok = await h.login('Madhav', P1);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.admin, true);
  assert.equal((await h.req('GET', '/api/admin/users', { cookie: ok.cookie })).status, 200);
  assert.equal((await h.login('Madhav', 'not-the-password-1234', '198.51.100.2')).status, 401);
  const u = h.db().users;
  assert.equal(u.length, 1); assert.equal(u[0].owner, true);
  assert.ok(!JSON.stringify(h.db()).includes(P1), 'the password is stored hashed, never in clear');
});

test('a restart with the same values changes nothing (same profile, same password)', async t => {
  const dir = newDir(); cleanup(t, dir);
  const a = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1 });
  const id = a.db().users[0].id;
  await a.stop();
  const b = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1 });
  assert.doesNotMatch(b.log, /created from the environment|updated from the environment/);
  assert.equal(b.db().users.length, 1); assert.equal(b.db().users[0].id, id);
  assert.equal((await b.login('Madhav', P1)).status, 200);
});

test('changing ADMIN_PASSWORD and restarting rotates it: the new one works, the old one does not', async t => {
  const dir = newDir(); cleanup(t, dir);
  const a = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1 });
  const old = await a.login('Madhav', P1);
  await a.stop();
  const b = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P2 });
  assert.match(b.log, /updated from the environment/);
  assert.equal((await b.login('Madhav', P1, '198.51.100.3')).status, 401);
  assert.equal((await b.login('Madhav', P2)).status, 200);
  // the old session is dead too (a password change signs the account out everywhere)
  assert.equal((await b.req('GET', '/api/admin/users', { cookie: old.cookie })).status, 401);
  assert.equal(b.db().users.length, 1);
});

test('an existing PASSWORD profile of that name is adopted: same profile, made admin, password replaced', async t => {
  const dir = newDir(); cleanup(t, dir);
  const old = await hashPassword('the-previous-password-123');
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'old1', name: 'Madhav', created: '2026-01-01T00:00:00.000Z', pw: { h: old, set: '2026-01-01T00:00:00.000Z' } }], creds: [], subs: [], invites: [] }));
  const h = await start(t, dir, { ADMIN_NAME: 'madhav', ADMIN_PASSWORD: P1 }); // the case differs on purpose
  assert.match(h.log, /updated from the environment/);
  assert.equal(h.db().users.length, 1);
  assert.equal(h.db().users[0].id, 'old1'); assert.equal(h.db().users[0].admin, true);
  assert.equal((await h.login('Madhav', P1)).status, 200);
  assert.equal((await h.login('Madhav', 'the-previous-password-123', '198.51.100.4')).status, 401);
});

test('a passkey-only profile that shares the name is left alone; the admin is created beside it', async t => {
  const dir = newDir(); cleanup(t, dir);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'pk1', name: 'Madhav', created: '2026-01-01T00:00:00.000Z' }], creds: [{ id: 'c1', userId: 'pk1', publicKey: 'x', counter: 0 }], subs: [], invites: [] }));
  const h = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1 });
  const users = h.db().users;
  const pk = users.find(u => u.id === 'pk1');
  assert.ok(!pk.admin && !pk.pw, 'the passkey profile gained nothing');
  assert.equal(users.filter(u => u.admin).length, 1);
  assert.ok(h.db().creds.some(c => c.id === 'c1'), "nobody's passkeys are touched");
});

for (const [why, env, expect] of [
  ['only one of the two is set', { ADMIN_NAME: 'Madhav' }, /must both be set/],
  ['PASSWORD_LOGIN is off', { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1, PASSWORD_LOGIN: '' }, /need PASSWORD_LOGIN=1/],
  ['the password is too short', { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: 'short' }, /ADMIN_PASSWORD was refused/],
  ['the password is just the name plus digits', { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: 'Madhav.2026.2026' }, /ADMIN_PASSWORD was refused/],
]) {
  test(`skipped safely (the server still starts, no profile appears) when ${why}`, async t => {
    const dir = newDir(); cleanup(t, dir);
    const h = await start(t, dir, env);
    assert.match(h.log, expect);
    assert.equal((await h.req('GET', '/api/health')).status, 200);
    assert.equal(fs.existsSync(path.join(dir, 'db.json')) ? h.db().users.length : 0, 0);
  });
}

test('it does not open registration: with INVITE_ONLY a stranger still needs an invite code', async t => {
  const dir = newDir(); cleanup(t, dir);
  const h = await start(t, dir, { ADMIN_NAME: 'Madhav', ADMIN_PASSWORD: P1, INVITE_ONLY: '1' });
  const r = await h.req('POST', '/api/register/password', { body: { name: 'Stranger', password: 'a-long-stranger-password-1' }, ip: '198.51.100.9' });
  assert.equal(r.status, 403);
  assert.equal(h.db().users.length, 1);
});
