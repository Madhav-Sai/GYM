/* /api/health routes (our addition): signed-in only, each profile sees only its own file, and the
 * supplements list is seeded on the first read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { healthRoutes } from '../health/routes.js';
import { createHealthStore } from '../health/store.js';
import { seedSupplements, saveSupplement, markSupplement } from '../health/supplements.js';

const NOW = Date.parse('2026-11-08T06:00:00Z');
function setup() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-health-r-')), 'health');
  const store = createHealthStore({ dir, now: () => NOW });
  let session = { id: 'u1' };
  const routes = healthRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body,
    readSession: () => session,
    store, now: () => NOW,
  });
  const call = async (key, { url, body } = {}) => { const res = {}; await routes[key]({ url: url || key.split(' ')[1], body }, res); return res; };
  return { call, setSession: s => { session = s; } };
}

test('not signed in: 401 on every route', async () => {
  const { call, setSession } = setup();
  setSession(null);
  for (const key of ['GET /api/health/diet', 'GET /api/health/supplements', 'POST /api/health/diet/water']) {
    assert.equal((await call(key, { body: { day: '2026-11-08', ml: 250 } })).status, 401, key);
  }
});

test('log, water and unlog for a day, with totals', async () => {
  const { call } = setup();
  const entry = { name: 'Egg whole boiled', qty: 150, unit: 'g', slot: 'pre', kcal: 232.5, protein: 19.5, carbs: 1.5, fat: 16.5, fiber: 0, satFat: 5, omega3: null, planKey: 'pre:0' };
  let r = await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entry } });
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.protein, 19.5);
  r = await call('POST /api/health/diet/water', { body: { day: '2026-11-08', ml: 250 } });
  assert.equal(r.body.water, 250);
  r = await call('GET /api/health/diet', { url: '/api/health/diet?day=2026-11-08' });
  assert.equal(r.body.entries.length, 1);
  r = await call('POST /api/health/diet/unlog', { body: { day: '2026-11-08', id: 'pre:0' } });
  assert.equal(r.body.entries.length, 0);
  assert.equal(r.body.water, 250);
});

test('another profile never sees the first one\'s log', async () => {
  const { call, setSession } = setup();
  await call('POST /api/health/diet/water', { body: { day: '2026-11-08', ml: 500 } });
  setSession({ id: 'u2' });
  const r = await call('GET /api/health/diet', { url: '/api/health/diet?day=2026-11-08' });
  assert.equal(r.body.water, 0);
});

test('a bad day or a bad entry is a 400, never a 500', async () => {
  const { call } = setup();
  assert.equal((await call('POST /api/health/diet/water', { body: { day: 'tomorrow', ml: 250 } })).status, 400);
  assert.equal((await call('POST /api/health/diet/water', { body: { day: '2030-01-01', ml: 250 } })).status, 400);
  assert.equal((await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entry: { name: 'x' } } })).status, 400);
});

test('supplements: seeded, marked, edited and deactivated', async () => {
  const { call } = setup();
  let r = await call('GET /api/health/supplements');
  assert.deepEqual(r.body.list.map(s => s.id), ['d3', 'omega3', 'isabgol', 'whey', 'magnesium']);
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'omega3', status: 'taken' } });
  assert.equal(r.body.log['2026-11-08'].omega3.status, 'taken');
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'isabgol', status: 'skipped', reason: 'Antibiotic tonight' } });
  assert.equal(r.body.log['2026-11-08'].isabgol.reason, 'Antibiotic tonight');
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'nope' } });
  assert.equal(r.status, 404);
  r = await call('POST /api/health/supplements/save', { body: { supplement: { id: 'magnesium', active: false } } });
  assert.equal(r.body.list.find(s => s.id === 'magnesium').active, false);
  r = await call('POST /api/health/supplements/save', { body: { supplement: { name: 'Creatine', dose: '5 g', schedule: { kind: 'daily' } } } });
  assert.equal(r.body.list.length, 6);
  assert.equal(r.body.supplement.createdDay, '2026-11-08');
});

test('the seed is what the owner takes', () => {
  const [d3, omega] = seedSupplements('2026-11-08');
  assert.deepEqual(d3.schedule, { kind: 'phase', start: '2026-09-06', weeklyDoses: 8, everyDays: 28, dow: 0 });
  assert.equal(d3.requiresFat, true);
  assert.match(d3.warning, /double-dose/);
  assert.match(omega.warning, /Milk alone/);
});

test('saving keeps what an edit did not send, and refuses a bad schedule', () => {
  const doc = { supplements: { list: seedSupplements('2026-11-08'), log: {} } };
  const s = saveSupplement(doc, { id: 'd3', dose: '1 capsule' }, '2026-11-09');
  assert.equal(s.schedule.kind, 'phase');
  assert.equal(s.remind, '20:30');
  assert.equal(s.createdDay, '2026-11-08');
  assert.throws(() => saveSupplement(doc, { name: 'X', schedule: { kind: 'hourly' } }, '2026-11-09'));
  markSupplement(doc, { day: '2026-11-08', id: 'd3', status: 'taken' }, 't');
  markSupplement(doc, { day: '2026-11-08', id: 'd3', status: null }, 't');
  assert.deepEqual(doc.supplements.log, {});
});
