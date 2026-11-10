/* Whoop (our addition): the provider's mappers, the OAuth round trip, token rotation and the sync,
 * all against a fake Whoop so nothing leaves the machine. The fixtures are the response samples
 * printed in developer.whoop.com's v2 API reference (checked 2026-11-08). What none of this proves
 * is Whoop's live behaviour: that needs real credentials (docs/WHOOP.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { createIntegrations } = await import('../integrations/index.js');
const { createStore } = await import('../integrations/store.js');
const { deriveKey } = await import('../integrations/crypto.js');
const { createWhoopData, recoveryBand } = await import('../integrations/whoop-data.js');
const { createWhoop } = await import('../integrations/whoop-service.js');
const W = await import('../integrations/providers/whoop.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gym-whoop-'));
const SECRET = 'b'.repeat(64);
const ENV = { INTEGRATIONS: 'whoop', WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'csecret', WHOOP_REDIRECT_URI: 'https://gym.example.com/api/integrations/oauth/callback' };
const H = 3600_000;

/* ---------- fixtures: the docs' samples ---------- */
const cycleRec = (id, startIso, extra = {}) => ({ id, user_id: 1, created_at: startIso, updated_at: startIso, start: startIso, end: null, timezone_offset: '+05:30', score_state: 'SCORED', score: { strain: 5.2951527, kilojoule: 8288.297, average_heart_rate: 68, max_heart_rate: 141 }, step_count: 8234, ...extra });
const recoveryRec = (cycleId, score = 44) => ({ cycle_id: cycleId, sleep_id: '123e4567-e89b-12d3-a456-426614174000', user_id: 1, created_at: 'x', updated_at: '2026-11-08T05:00:00.000Z', score_state: 'SCORED', score: { user_calibrating: false, recovery_score: score, resting_heart_rate: 64, hrv_rmssd_milli: 31.813562, spo2_percentage: 95.6875, skin_temp_celsius: 33.7 } });
const sleepRec = (id, cycleId, startIso, endIso, nap = false) => ({ id, cycle_id: cycleId, user_id: 1, start: startIso, end: endIso, timezone_offset: '+05:30', nap, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 30272735, total_awake_time_milli: 1403507, total_no_data_time_milli: 0, total_light_sleep_time_milli: 14905851, total_slow_wave_sleep_time_milli: 6630370, total_rem_sleep_time_milli: 5879573, sleep_cycle_count: 3, disturbance_count: 12 }, sleep_needed: { baseline_milli: 27395716, need_from_sleep_debt_milli: 352230, need_from_recent_strain_milli: 208595, need_from_recent_nap_milli: -12312 }, respiratory_rate: 16.11, sleep_performance_percentage: 98, sleep_consistency_percentage: 90, sleep_efficiency_percentage: 91.7 } });
const workoutRec = (id, startIso, maxHr = 146, z4 = 600000, z5 = 300000) => ({ id, v1_id: 1, user_id: 1, start: startIso, end: startIso, timezone_offset: '+05:30', sport_name: 'running', score_state: 'SCORED', score: { strain: 8.2, average_heart_rate: 123, max_heart_rate: maxHr, kilojoule: 1569, distance_meter: 1772, zone_durations: { zone_zero_milli: 300000, zone_one_milli: 600000, zone_two_milli: 900000, zone_three_milli: 900000, zone_four_milli: z4, zone_five_milli: z5 } }, sport_id: 1 });

/* ---------- a fake Whoop ---------- */
function fakeWhoop(opts = {}) {
  const st = {
    access: new Set(['A0']), refresh: new Set(['R0']), n: 0, refreshes: 0, calls: [], revoked: false,
    cycles: opts.cycles ?? [], recoveries: opts.recoveries ?? [], sleeps: opts.sleeps ?? [], workouts: opts.workouts ?? [],
    pageSize: opts.pageSize ?? 25, fail401Once: false, rate: false, grantDead: false, expiresIn: opts.expiresIn ?? 3600,
  };
  const res = (status, body, headers = {}) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    st.calls.push(`${init.method || 'GET'} ${u.pathname}${u.search}`);
    if (u.pathname === '/oauth/oauth2/token') {
      const f = new URLSearchParams(String(init.body));
      if (f.get('client_id') !== 'cid' || f.get('client_secret') !== 'csecret') return res(401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        if (f.get('code') !== 'GOODCODE') return res(400, { error: 'invalid_grant' });
        const a = 'A' + ++st.n, r = 'R' + st.n; st.access.add(a); st.refresh.add(r);
        return res(200, { access_token: a, refresh_token: opts.noRefresh ? undefined : r, expires_in: st.expiresIn, scope: 'offline read:recovery', token_type: 'bearer' });
      }
      // refresh: single use, and a dead grant is a 400
      st.refreshes++;
      await new Promise(r => setTimeout(r, 5)); // a real network hop, so races are real
      const old = f.get('refresh_token');
      if (st.grantDead || !st.refresh.has(old)) return res(400, { error: 'invalid_grant' });
      st.refresh.delete(old);
      const a = 'A' + ++st.n, r = 'R' + st.n; st.access.add(a); st.refresh.add(r);
      return res(200, { access_token: a, refresh_token: r, expires_in: st.expiresIn, scope: 'offline', token_type: 'bearer' });
    }
    if (!st.access.has((init.headers?.Authorization || '').replace('Bearer ', ''))) return res(401, { message: 'unauthorized' });
    if (u.pathname === '/developer/v2/user/access' && init.method === 'DELETE') { st.revoked = true; return res(204, null); }
    if (st.rate) return res(429, { message: 'slow down' }, { 'x-ratelimit-reset': '42' });
    if (st.fail401Once) { st.fail401Once = false; return res(401, { message: 'expired' }); }
    const coll = { '/developer/v2/cycle': st.cycles, '/developer/v2/recovery': st.recoveries, '/developer/v2/activity/sleep': st.sleeps, '/developer/v2/activity/workout': st.workouts }[u.pathname];
    if (coll) {
      assert.ok(Number(u.searchParams.get('limit')) <= 25, 'limit never above 25');
      const from = u.searchParams.get('nextToken') ? Number(Buffer.from(u.searchParams.get('nextToken'), 'base64url').toString()) : 0;
      const page = coll.slice(from, from + st.pageSize);
      const next = from + st.pageSize < coll.length ? Buffer.from(String(from + st.pageSize)).toString('base64url') : '';
      return res(200, { records: page, next_token: next });
    }
    if (u.pathname === '/developer/v2/user/profile/basic') return res(200, { user_id: 1, first_name: 'Madhav' });
    if (u.pathname === '/developer/v2/user/measurement/body') return res(200, { height_meter: 1.72, weight_kilogram: 72.9, max_heart_rate: 190 });
    return res(404, {});
  };
  return { st, fetchImpl };
}

function rig({ now = () => Date.now(), fake = fakeWhoop(), env = ENV } = {}) {
  const dir = tmp();
  const store = createStore({ dir: path.join(dir, 'integrations'), key: deriveKey(SECRET), now });
  const data = createWhoopData({ dir: path.join(dir, 'whoop'), now });
  const provider = W.whoopProvider({ env, fetchImpl: fake.fetchImpl, now });
  const quiet = { error() {}, warn() {}, log() {} };
  const svc = createWhoop({ store, data, provider, now, log: quiet });
  return { dir, store, data, provider, svc, fake };
}
const connect = async (r, uid = 'u1') => {
  const url = new URL(r.svc.authorize(uid).url);
  await r.svc.callback(uid, { code: 'GOODCODE', state: url.searchParams.get('state') });
  return r.store.list(uid).find(x => x.provider === 'whoop');
};

/* ---------- mappers ---------- */

test('mappers read the documented v2 shapes', () => {
  const c = W.mapCycle(cycleRec(93845, '2026-11-08T03:00:00.000Z'));
  assert.equal(c.id, 93845); assert.equal(c.strain, 5.2951527); assert.equal(c.steps, 8234); assert.equal(c.maxHr, 141);
  const r = W.mapRecovery(recoveryRec(93845, 44));
  assert.deepEqual([r.score, r.hrv, r.rhr, r.spo2, r.skinTemp], [44, 31.813562, 64, 95.6875, 33.7]);
  const s = W.mapSleep(sleepRec('ecfc6a15', 93845, '2026-11-07T20:55:00.000Z', '2026-11-08T04:00:00.000Z'));
  assert.equal(s.asleepMin, Math.round((14905851 + 6630370 + 5879573) / 60000));
  assert.equal(s.deepMin, Math.round(6630370 / 60000)); assert.equal(s.consistency, 90); assert.equal(s.debtMin, Math.round(352230 / 60000));
  const w = W.mapWorkout(workoutRec('w1', '2026-11-08T05:00:00.000Z'));
  assert.deepEqual(w.zonesMin, [5, 10, 15, 15, 10, 5]); assert.equal(w.sport, 'running');
});

test('steps are null when Whoop does not send step_count, never 0', () => {
  const rec = cycleRec(1, '2026-11-08T03:00:00.000Z'); delete rec.step_count;
  assert.equal(W.mapCycle(rec).steps, null);
  assert.equal(W.mapCycle({ ...rec, step_count: 'lots' }).steps, null);
  assert.equal(W.mapCycle({ ...rec, step_count: 0 }).steps, 0, 'a real zero stays a zero');
});

test('an unscored record keeps its numbers null instead of making some up', () => {
  const c = W.mapCycle({ id: 7, start: '2026-11-08T03:00:00.000Z', timezone_offset: '+05:30', score_state: 'PENDING_SCORE' });
  assert.equal(c.strain, null); assert.equal(c.kj, null);
  assert.equal(W.mapRecovery({ cycle_id: 7, score_state: 'PENDING_SCORE' }).score, null);
  assert.equal(W.mapCycle({ id: 'x', start: 'nope' }), null, 'garbage is dropped');
});

test('a cycle belongs to the day it mostly covers, for a night sleeper and for a night-shift worker', () => {
  // 23:00 IST on the 7th (17:30Z) -> the 8th; 01:30 IST on the 8th (20:00Z on the 7th) -> the 8th.
  assert.equal(W.cycleDay(Date.parse('2026-11-07T17:30:00Z'), 330), '2026-11-08');
  assert.equal(W.cycleDay(Date.parse('2026-11-07T20:00:00Z'), 330), '2026-11-08');
  assert.equal(W.offsetMin('+05:30'), 330); assert.equal(W.offsetMin('-05:00'), -300); assert.equal(W.offsetMin(undefined), 0);
});

/* ---------- OAuth round trip ---------- */

test('the authorize URL carries what Whoop requires, and a state of 8+ characters', () => {
  const r = rig();
  const u = new URL(r.svc.authorize('u1').url);
  assert.equal(u.origin + u.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.equal(u.searchParams.get('response_type'), 'code'); assert.equal(u.searchParams.get('client_id'), 'cid');
  assert.equal(u.searchParams.get('redirect_uri'), ENV.WHOOP_REDIRECT_URI);
  assert.ok(u.searchParams.get('state').length >= 8);
  const scopes = u.searchParams.get('scope').split(' ');
  for (const s of ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement']) assert.ok(scopes.includes(s), s);
  assert.notEqual(new URL(r.svc.authorize('u1').url).searchParams.get('state'), u.searchParams.get('state'));
});

test('state is one use, belongs to the profile, expires, and a cancelled sign-in is "denied"', async () => {
  let t = 1_000_000;
  const r = rig({ now: () => t });
  const st = u => new URL(r.svc.authorize(u).url).searchParams.get('state');
  const a = st('u1');
  await assert.rejects(r.svc.callback('u2', { code: 'GOODCODE', state: a }), { code: 'state' }, "another profile's state");
  await assert.rejects(r.svc.callback('u1', { code: 'GOODCODE', state: a }), { code: 'state' }, 'and it was spent by the attempt');
  const b = st('u1');
  t += 11 * 60_000;
  await assert.rejects(r.svc.callback('u1', { code: 'GOODCODE', state: b }), { code: 'state' }, 'expired');
  await assert.rejects(r.svc.callback('u1', { code: 'GOODCODE', state: 'made-up-state' }), { code: 'state' });
  await assert.rejects(r.svc.callback('u1', { error: 'access_denied', state: st('u1') }), { code: 'denied' });
  assert.equal(r.store.list('u1').length, 0, 'nothing stored by any of those');
});

test('a good callback stores the tokens sealed, never in the clear', async () => {
  const r = rig();
  const rec = await connect(r);
  assert.equal(rec.provider, 'whoop'); assert.equal(rec.events.length, 0);
  assert.equal(r.store.reveal('u1', rec, 'refresh'), 'R1');
  const disk = fs.readFileSync(path.join(r.dir, 'integrations', 'u-u1.json'), 'utf8');
  assert.ok(!disk.includes('R1') && !disk.includes('"A1"') && !/A1\b/.test(disk.replace(/[A-Za-z0-9_-]{20,}/g, '')), 'no plain token on disk');
  assert.equal((fs.statSync(path.join(r.dir, 'integrations', 'u-u1.json')).mode & 0o777), 0o600);
});

test('no refresh token back (no offline scope) is a refusal, not a half connection', async () => {
  const r = rig({ fake: fakeWhoop({ noRefresh: true }) });
  await assert.rejects(connect(r), { code: 'no-refresh' });
  assert.equal(r.store.list('u1').length, 0);
});

test('stateOwner says whose sign-in a state is without using it up, and not for a spent, unknown or expired one', async () => {
  let t = 1_000_000;
  const r = rig({ now: () => t });
  const state = new URL(r.svc.authorize('u1').url).searchParams.get('state');
  assert.equal(r.svc.stateOwner(state), 'u1');
  assert.equal(r.svc.stateOwner(state), 'u1', 'looking does not spend it');
  assert.equal(r.svc.stateOwner('made-up'), null);
  assert.equal(r.svc.stateOwner(undefined), null);
  await r.svc.callback('u1', { code: 'GOODCODE', state });
  assert.equal(r.svc.stateOwner(state), null, 'spent by the callback');
  const s2 = new URL(r.svc.authorize('u1').url).searchParams.get('state');
  t += 11 * 60_000;
  assert.equal(r.svc.stateOwner(s2), null, 'expired');
});

/* ---------- token rotation: what kills integrations silently ---------- */

test('refreshing stores the NEW refresh token and the old one is dead', async () => {
  let t = Date.now();
  const r = rig({ now: () => t, fake: fakeWhoop({ expiresIn: 3600 }) });
  const rec = await connect(r);
  t += 2 * H; // access token expired
  const a = await r.svc.accessToken('u1', r.store.get('u1', rec.id));
  assert.equal(r.fake.st.refreshes, 1);
  const after = r.store.get('u1', rec.id);
  assert.equal(r.store.reveal('u1', after, 'refresh'), 'R2');
  assert.equal(r.store.reveal('u1', after, 'access'), a);
  assert.ok(!r.fake.st.refresh.has('R1'), 'Whoop no longer accepts the old one');
  t += 2 * H;
  await r.svc.accessToken('u1', r.store.get('u1', rec.id)); // works again with R2 -> R3
  assert.equal(r.store.reveal('u1', r.store.get('u1', rec.id), 'refresh'), 'R3');
});

test('two refreshes at once become one request (the second would have failed at Whoop)', async () => {
  let t = Date.now();
  const r = rig({ now: () => t });
  const rec = await connect(r);
  t += 2 * H;
  const cur = r.store.get('u1', rec.id);
  const [a, b, c] = await Promise.all([r.svc.accessToken('u1', cur), r.svc.accessToken('u1', cur), r.svc.accessToken('u1', cur)]);
  assert.equal(r.fake.st.refreshes, 1);
  assert.equal(a, b); assert.equal(b, c);
  assert.equal(r.store.get('u1', rec.id).status, 'ok');
});

test('if saving the rotated token fails, the new pair is kept in memory and used next time', async () => {
  let t = Date.now();
  const r = rig({ now: () => t });
  const rec = await connect(r);
  t += 2 * H;
  const realUpdate = r.store.update; let broken = true;
  r.store.update = (...a) => { if (broken) throw new Error('disk full'); return realUpdate(...a); };
  const a = await r.svc.accessToken('u1', r.store.get('u1', rec.id));
  assert.equal(r.fake.st.refreshes, 1);
  assert.ok(r.svc._mem.has(rec.id), 'the only working refresh token is held in memory');
  t += 2 * H; // expires again, still can't write
  await r.svc.accessToken('u1', r.store.get('u1', rec.id));
  assert.equal(r.fake.st.refreshes, 2, 'the in-memory token (not the stale one on disk) was used, so it worked');
  broken = false;
  t += 2 * H;
  await r.svc.accessToken('u1', r.store.get('u1', rec.id));
  assert.equal(r.store.reveal('u1', r.store.get('u1', rec.id), 'refresh'), 'R4', 'and it reached the disk once the disk worked');
  assert.ok(a);
});

test('a refused grant marks the connection "attention" and the schedule leaves it alone', async () => {
  let t = Date.now();
  const r = rig({ now: () => t });
  const rec = await connect(r);
  r.fake.st.grantDead = true; t += 2 * H;
  const res = await r.svc.sync('u1', { force: true });
  assert.equal(res.code, 'reauth');
  const after = r.store.get('u1', rec.id);
  assert.equal(after.status, 'attention'); assert.equal(after.lastError.code, 'reauth');
  const before = r.fake.st.refreshes;
  assert.equal((await r.svc.sync('u1', { scheduled: true })).skipped, 'attention');
  assert.equal(r.fake.st.refreshes, before, 'not hammering Whoop with a dead grant');
});

/* ---------- sync ---------- */

test('a sync pulls every collection, follows next_token, and stores what it got', async () => {
  const cycles = [cycleRec(3, '2026-11-08T03:00:00.000Z'), cycleRec(2, '2026-11-07T03:00:00.000Z'), cycleRec(1, '2026-11-06T03:00:00.000Z')];
  const fake = fakeWhoop({ cycles, pageSize: 2, recoveries: cycles.map(c => recoveryRec(c.id)), sleeps: [sleepRec('s3', 3, '2026-11-07T20:00:00.000Z', '2026-11-08T04:00:00.000Z')], workouts: [workoutRec('w1', '2026-11-08T05:00:00.000Z')] });
  const r = rig({ fake });
  await connect(r);
  const res = await r.svc.sync('u1', { force: true });
  assert.equal(res.ok, true); assert.equal(res.cycles, 3);
  assert.ok(fake.st.calls.some(c => c.includes('/v2/cycle') && c.includes('nextToken=')), 'second page requested with nextToken');
  assert.ok(fake.st.calls.some(c => c.includes('/v2/user/profile/basic')));
  const s = r.svc.summary('u1');
  assert.equal(s.days.length, 3); assert.equal(s.profile.firstName, 'Madhav'); assert.equal(s.body.weightKg, 72.9);
  assert.equal(r.store.list('u1')[0].info.name, 'Madhav');
});

test('a 401 mid-sync refreshes once and retries instead of failing', async () => {
  const fake = fakeWhoop({ cycles: [cycleRec(1, '2026-11-08T03:00:00.000Z')] });
  const r = rig({ fake });
  await connect(r);
  fake.st.fail401Once = true;
  const res = await r.svc.sync('u1', { force: true });
  assert.equal(res.ok, true);
  assert.equal(fake.st.refreshes, 1, 'one forced refresh, then it went through');
});

test('a 429 backs off for what Whoop asked and scheduled runs wait', async () => {
  let t = Date.now();
  const fake = fakeWhoop({ cycles: [cycleRec(1, '2026-11-08T03:00:00.000Z')] });
  const r = rig({ fake, now: () => t });
  await connect(r);
  fake.st.rate = true;
  const res = await r.svc.sync('u1', { force: true });
  assert.equal(res.code, 'rate'); assert.equal(res.retryAfterMs, 42_000);
  const calls = fake.st.calls.length;
  assert.equal((await r.svc.sync('u1', { scheduled: true })).skipped, 'attention');
  assert.equal(fake.st.calls.length, calls, 'no request while backing off');
  t += 43_000; fake.st.rate = false;
  assert.equal((await r.svc.sync('u1', { scheduled: true })).ok, true);
});

test('only one sync runs per profile at a time', async () => {
  const r = rig({ fake: fakeWhoop({ cycles: [cycleRec(1, '2026-11-08T03:00:00.000Z')] }) });
  await connect(r);
  const [a, b] = await Promise.all([r.svc.sync('u1', { force: true }), r.svc.sync('u1', { force: true })]);
  assert.deepEqual([a.ok, b.skipped].sort(), ['busy', true].sort());
});

test('a second sync only asks for what is new (with a few days of overlap)', async () => {
  let t = Date.parse('2026-11-08T12:00:00Z');
  const fake = fakeWhoop({ cycles: [cycleRec(1, '2026-11-08T03:00:00.000Z')] });
  const r = rig({ fake, now: () => t });
  await connect(r);
  await r.svc.sync('u1', { force: true });
  fake.st.calls.length = 0; t += 30 * 60_000;
  await r.svc.sync('u1', { force: true });
  const q = new URL('https://x' + fake.st.calls.find(c => c.includes('/v2/cycle')).split(' ')[1]);
  const start = Date.parse(q.searchParams.get('start'));
  assert.ok(Math.abs(start - (Date.parse('2026-11-08T03:00:00.000Z') - 3 * 86400_000)) < 1000, 'last record minus the overlap');
});

/* ---------- what the app draws ---------- */

test('recovery bands follow the spec: 67+ green, 34-66 yellow, 33 and under red', () => {
  assert.equal(recoveryBand(67).band, 'green'); assert.equal(recoveryBand(66).band, 'yellow');
  assert.equal(recoveryBand(34).band, 'yellow'); assert.equal(recoveryBand(33).band, 'red'); assert.equal(recoveryBand(null), null);
});

test('the summary shows dashes for what is missing and flags heart rate over 175', async () => {
  const now = Date.parse('2026-11-08T12:00:00Z'); // a Sunday
  const noSteps = cycleRec(3, '2026-11-08T03:00:00.000Z'); delete noSteps.step_count;
  const fake = fakeWhoop({
    cycles: [noSteps], recoveries: [recoveryRec(3, 30)], sleeps: [sleepRec('s3', 3, '2026-11-07T20:00:00.000Z', '2026-11-08T04:00:00.000Z'), sleepRec('nap', 3, '2026-11-08T07:00:00.000Z', '2026-11-08T07:30:00.000Z', true)],
    workouts: [workoutRec('w1', '2026-11-04T05:00:00.000Z', 176, 15 * 60000, 8 * 60000), workoutRec('w2', '2026-11-03T05:00:00.000Z', 150, 5 * 60000, 0)],
  });
  const r = rig({ fake, now: () => now });
  await connect(r);
  await r.svc.sync('u1', { force: true });
  const s = r.svc.summary('u1', now);
  assert.equal(s.steps.value, null, 'a dash, not 0'); assert.equal(s.steps.source, 'whoop');
  assert.equal(s.today.recovery.score, 30); assert.equal(s.today.guidance.band, 'red');
  assert.equal(s.today.sleep.nap, false, 'a nap is never the main sleep');
  assert.equal(s.hrFlags.length, 1); assert.equal(s.hrFlags[0].maxHr, 176); assert.equal(s.hrFlags[0].ceiling, 175);
  // week of Mon 2 Nov: 15+8 (w1) + 5 (w2) = 28 minutes of zone 4-5 -> above the 25 target, under the 30 warning
  assert.equal(s.zone45.weekStart, '2026-11-02'); assert.equal(s.zone45.minutes, 28); assert.equal(s.zone45.status, 'high');
});

test('the summary carries every scored field per day, averages, naps and calories', async () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const fake = fakeWhoop({
    cycles: [cycleRec(3, '2026-11-08T03:00:00.000Z')], recoveries: [recoveryRec(3, 70)],
    sleeps: [sleepRec('s3', 3, '2026-11-07T20:00:00.000Z', '2026-11-08T04:00:00.000Z'), sleepRec('nap', 3, '2026-11-08T07:00:00.000Z', '2026-11-08T07:30:00.000Z', true)],
  });
  const r = rig({ fake, now: () => now });
  await connect(r);
  await r.svc.sync('u1', { force: true });
  const s = r.svc.summary('u1', now);
  const d = s.days[s.days.length - 1];
  for (const k of ['spo2', 'skinTemp', 'kj', 'avgHr', 'maxHr', 'deepMin', 'remMin', 'lightMin', 'awakeMin', 'performance', 'efficiency', 'respRate', 'neededMin', 'debtMin']) assert.ok(k in d, k);
  assert.equal(s.avg.recovery.d7, 70); assert.equal(s.avg.recovery.d30, 70);
  assert.equal(s.naps.length, 1);
  assert.equal(s.today.cycle.kcal == null || Number.isInteger(s.today.cycle.kcal), true);
});

test('each day carries when its night began and ended, and null without a sleep', async () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const fake = fakeWhoop({
    cycles: [cycleRec(2, '2026-11-07T03:00:00.000Z'), cycleRec(3, '2026-11-08T03:00:00.000Z')], recoveries: [recoveryRec(3, 70)],
    sleeps: [sleepRec('s3', 3, '2026-11-07T20:00:00.000Z', '2026-11-08T04:00:00.000Z')],
  });
  const r = rig({ fake, now: () => now });
  await connect(r);
  await r.svc.sync('u1', { force: true });
  const s = r.svc.summary('u1', now);
  const last = s.days[s.days.length - 1], first = s.days[0];
  assert.equal(Date.parse(last.sleepStart), Date.parse('2026-11-07T20:00:00.000Z'));
  assert.equal(Date.parse(last.sleepEnd), Date.parse('2026-11-08T04:00:00.000Z'));
  assert.equal(first.sleepStart, null); assert.equal(first.sleepEnd, null);
});

// The app adds Whoop workouts to History (frontend lib/whoop-import.js): it needs every workout of
// the last 90 days, not only the newest 20.
test('the summary lists every workout of the last 90 days, newest first, and none older', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const r = rig({ now: () => now });
  const at = d => new Date(now - d * 86400_000).toISOString();
  const workouts = [];
  for (let d = 1; d <= 30; d++) workouts.push(W.mapWorkout(workoutRec('w' + d, at(d))));
  workouts.push(W.mapWorkout(workoutRec('w89', at(89))), W.mapWorkout(workoutRec('w95', at(95))));
  r.data.upsert('u1', { cycles: [W.mapCycle(cycleRec(3, '2026-11-08T03:00:00.000Z'))], workouts });
  const s = r.data.summary('u1', now);
  assert.equal(s.workouts.length, 31, 'all 30 recent ones plus day 89, not day 95');
  assert.equal(s.workouts[0].id, 'w1');
  assert.equal(s.workouts[s.workouts.length - 1].id, 'w89');
  assert.ok(!s.workouts.some(w => w.id === 'w95'));
  for (const k of ['id', 'day', 'sport', 'start', 'end', 'strain', 'avgHr', 'maxHr', 'kj', 'distanceM', 'zonesMin']) assert.ok(k in s.workouts[0], k);
});

test('before the first sync the summary is empty, not zeros', () => {
  const r = rig();
  const s = r.data.summary('nobody');
  assert.equal(s.today, null); assert.deepEqual(s.days, []); assert.equal(s.steps, null); assert.equal(s.synced, false);
});

/* ---------- the hub ---------- */

test('Whoop is off unless named AND configured; the generic connect and test refuse an OAuth provider', async () => {
  const dir = tmp();
  const off = createIntegrations({ dataDir: dir, secret: SECRET, env: { INTEGRATIONS: 'whoop' } });
  assert.equal(off.active, false); assert.equal(off.whoop, null);
  const fake = fakeWhoop();
  const on = createIntegrations({ dataDir: tmp(), secret: SECRET, env: ENV, whoopFetch: fake.fetchImpl });
  assert.deepEqual(on.ids, ['whoop']); assert.ok(on.whoop);
  assert.equal(on.describe('u1').providers[0].kind, 'oauth');
  assert.throws(() => on.connect('u1', 'whoop', {}), { status: 400, code: 'oauth' });
  on.stop();
});

test('disconnecting tells Whoop to drop the grant and forgets the data', async () => {
  const fake = fakeWhoop({ cycles: [cycleRec(1, '2026-11-08T03:00:00.000Z')] });
  const hub = createIntegrations({ dataDir: tmp(), secret: SECRET, env: ENV, whoopFetch: fake.fetchImpl });
  const url = new URL(hub.whoop.authorize('u1').url);
  await hub.whoop.callback('u1', { code: 'GOODCODE', state: url.searchParams.get('state') });
  await hub.whoop.sync('u1', { force: true });
  assert.equal(hub.whoop.summary('u1').days.length, 1);
  const id = hub.describe('u1').connections[0].id;
  await assert.rejects(hub.test('u1', id), { status: 400, code: 'oauth' });
  hub.disconnect('u1', id);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(fake.st.revoked, true, 'DELETE /v2/user/access was sent');
  assert.equal(hub.whoop.summary('u1').days.length, 0);
  assert.equal(hub.describe('u1').connections.length, 0);
  hub.stop();
});
