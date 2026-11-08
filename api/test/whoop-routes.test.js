/* GET /api/integrations/oauth/callback (this fork): the website (cookie) is sent back into the app; the phone app's
   own browser (no cookie, no token) is answered with a small page, and the one-time state says whose account it is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationRoutes } from '../integrations/routes.js';

const mkRes = () => { const r = { status: null, headers: null, body: '', writeHead(s, h) { r.status = s; r.headers = h; }, end(b) { r.body = b || ''; } }; return r; };
function setup({ session = null, owners = {}, callback = async () => ({}), whoop = true } = {}) {
  const calls = { callback: [], sync: [], audit: [] };
  const hub = whoop ? { whoop: {
    stateOwner: s => owners[s] ?? null,
    callback: async (uid, q) => { calls.callback.push([uid, q.state]); return callback(uid, q); },
    sync: async uid => { calls.sync.push(uid); },
  } } : { whoop: null };
  const routes = integrationRoutes({ json() {}, readBody() {}, readSession: () => session, hub, audit: (...a) => calls.audit.push(a), origin: 'https://gym.example.com' });
  const call = async qs => { const res = mkRes(); await routes['GET /api/integrations/oauth/callback']({ url: '/api/integrations/oauth/callback?' + qs, headers: {} }, res); return res; };
  return { call, calls };
}

test('the phone: no cookie, a valid state -> that state\'s account is connected, answered with a page and a way back', async () => {
  const { call, calls } = setup({ owners: { GOODSTATE: 'u1' } });
  const res = await call('code=abc&state=GOODSTATE');
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Type'], /text\/html/);
  assert.match(res.body, /Whoop connected/);
  assert.match(res.body, /href="opengym:\/\/home"/);
  assert.deepEqual(calls.callback, [['u1', 'GOODSTATE']]);
  assert.deepEqual(calls.sync, ['u1']);
  assert.ok(!('Set-Cookie' in res.headers), 'no cookie is ever set here');
  assert.equal(calls.audit[0][2].uid, 'u1');
});

test('the phone: an unknown, spent or expired state connects nothing', async () => {
  const { call, calls } = setup({ owners: {} });
  const res = await call('code=abc&state=FORGED');
  assert.equal(res.status, 200);
  assert.match(res.body, /link expired/);
  assert.deepEqual(calls.callback, []);
  assert.deepEqual(calls.sync, []);
});

test('the website: with a cookie it redirects into the app, as before', async () => {
  const { call, calls } = setup({ session: { id: 'u1', name: 'M' }, owners: { S: 'u1' } });
  const res = await call('code=abc&state=S');
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, 'https://gym.example.com/#/settings/integrations?whoop=ok');
  assert.deepEqual(calls.callback, [['u1', 'S']]);
});

test('safety: a signed-in browser can never finish somebody else\'s sign-in (the cookie decides, the service refuses)', async () => {
  const refuse = async () => { throw Object.assign(new Error('x'), { status: 400, code: 'state' }); };
  const { call } = setup({ session: { id: 'attacker' }, owners: { VICTIMSTATE: 'victim' }, callback: refuse });
  const res = await call('code=abc&state=VICTIMSTATE');
  assert.equal(res.status, 302);
  assert.match(res.headers.Location, /whoop=expired$/);
});

test('a cancelled sign-in and a failing exchange say so in words', async () => {
  const denied = setup({ owners: { S: 'u1' }, callback: async () => { throw Object.assign(new Error('x'), { status: 400, code: 'denied' }); } });
  assert.match((await denied.call('error=access_denied&state=S')).body, /cancelled/);
  const failing = setup({ owners: { S: 'u1' }, callback: async () => { throw new Error('network'); } });
  const res = await failing.call('code=abc&state=S');
  assert.match(res.body, /Could not connect Whoop/);
  assert.deepEqual(failing.calls.sync, [], 'nothing syncs after a failure');
});

test('Whoop switched off on the server: a clear page, never a crash', async () => {
  const { call } = setup({ whoop: false });
  const res = await call('code=abc&state=S');
  assert.equal(res.status, 200);
  assert.match(res.body, /Could not connect Whoop/);
});
