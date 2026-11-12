/* /api/health routes (our addition): signed-in only, each profile sees only its own file, and the
 * supplements list is seeded on the first read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { healthRoutes } from '../health/routes.js';
import { createHealthStore } from '../health/store.js';
import { seedSupplements, seedSupplementsV1, migrateSupplementsV2, migrateSupplementsV3, saveSupplement, markSupplement } from '../health/supplements.js';

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
  assert.deepEqual(r.body.list.map(s => s.id), ['d3', 'omega3', 'omega3-lunch', 'omega3-dinner', 'isabgol', 'whey', 'whey-night', 'magnesium']);
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'omega3', status: 'taken' } });
  assert.equal(r.body.log['2026-11-08'].omega3.status, 'taken');
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'isabgol', status: 'skipped', reason: 'Antibiotic tonight' } });
  assert.equal(r.body.log['2026-11-08'].isabgol.reason, 'Antibiotic tonight');
  r = await call('POST /api/health/supplements/mark', { body: { day: '2026-11-08', id: 'nope' } });
  assert.equal(r.status, 404);
  r = await call('POST /api/health/supplements/save', { body: { supplement: { id: 'magnesium', active: false } } });
  assert.equal(r.body.list.find(s => s.id === 'magnesium').active, false);
  r = await call('POST /api/health/supplements/save', { body: { supplement: { name: 'Creatine', dose: '5 g', schedule: { kind: 'daily' } } } });
  assert.equal(r.body.list.length, 9);
  assert.equal(r.body.supplement.createdDay, '2026-11-08');
});

test('the seed is what the owner takes', () => {
  const list = seedSupplements('2026-11-08');
  const [d3, omega] = list;
  assert.deepEqual(d3.schedule, { kind: 'phase', start: '2026-09-06', weeklyDoses: 8, everyDays: 28, dow: 0, monthly: 'firstSunday', monthlyFrom: '2026-11-11' });
  assert.equal(d3.requiresFat, true);
  assert.equal(d3.remind, '23:00');
  assert.match(d3.warning, /double-dose/);
  assert.match(omega.warning, /empty stomach/);
  assert.match(omega.warning, /Back to 1 a day/);
  assert.equal(omega.note, undefined);
  const by = id => list.find(x => x.id === id);
  assert.deepEqual(['omega3', 'omega3-lunch', 'omega3-dinner'].map(id => by(id).remind), ['07:30', '13:15', '23:00']);
  // round 3: 1 capsule a day, with breakfast; the other two kept, switched off
  assert.deepEqual(['omega3', 'omega3-lunch', 'omega3-dinner'].map(id => by(id).active), [true, false, false]);
  assert.match(by('omega3').warning, /fasting retest is still above 200/);
  assert.equal(by('whey').remind, '07:15');
  assert.equal(by('whey').doseByDayType, undefined);
  assert.match(by('whey-night').note, /maltodextrin/);
  assert.equal(by('isabgol').remind, '23:45');
  assert.equal(by('magnesium').remind, '23:45');
});

test('round 2 reaches a stored round-1 list once, keeping ids, log and own items', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-supp-')), 'health');
  fs.mkdirSync(dir, { recursive: true });
  const v1 = seedSupplementsV1('2026-11-08');
  v1.push({ id: 'screat', name: 'Creatine', dose: '5 g', schedule: { kind: 'daily' }, active: true, createdDay: '2026-11-09' });
  const log = { '2026-11-09': { omega3: { status: 'taken', at: 1 } } };
  fs.writeFileSync(path.join(dir, 'u-u1.json'), JSON.stringify({ v: 1, supplements: { list: v1, log } }));
  const now = () => Date.parse('2026-11-11T06:00:00Z');
  const list = createHealthStore({ dir, now }).get('u1').supplements.list;
  assert.deepEqual(list.map(s => s.id), ['d3', 'omega3', 'omega3-lunch', 'omega3-dinner', 'isabgol', 'whey', 'whey-night', 'magnesium', 'screat']);
  assert.equal(list.find(s => s.id === 'omega3').createdDay, '2026-11-08');
  assert.equal(list.find(s => s.id === 'omega3-lunch').createdDay, '2026-11-11');
  assert.equal(list[0].schedule.monthly, 'firstSunday');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'u-u1.json'), 'utf8'));
  assert.equal(raw.suppV, 3, 'saved at once');
  assert.deepEqual(raw.supplements.log['2026-11-09'], log['2026-11-09']);
  // A fresh process, and the person deleting nothing: still one of each.
  const again = createHealthStore({ dir, now }).get('u1').supplements.list;
  assert.equal(again.length, 9);
  // Running rounds 2 and 3 again changes nothing.
  assert.deepEqual(migrateSupplementsV3(migrateSupplementsV2(structuredClone(again), '2026-11-12')), again);
});

test('saving keeps what an edit did not send, and refuses a bad schedule', () => {
  const doc = { supplements: { list: seedSupplements('2026-11-08'), log: {} } };
  const s = saveSupplement(doc, { id: 'd3', dose: '1 capsule' }, '2026-11-09');
  assert.equal(s.schedule.kind, 'phase');
  assert.equal(s.remind, '23:00');
  assert.equal(s.createdDay, '2026-11-08');
  assert.throws(() => saveSupplement(doc, { name: 'X', schedule: { kind: 'hourly' } }, '2026-11-09'));
  markSupplement(doc, { day: '2026-11-08', id: 'd3', status: 'taken' }, 't');
  markSupplement(doc, { day: '2026-11-08', id: 'd3', status: null }, 't');
  assert.deepEqual(doc.supplements.log, {});
});

test('round 3 reaches a stored round-2 list once: 1 omega-3 a day, the lunch and dinner ones off', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-supp-')), 'health');
  fs.mkdirSync(dir, { recursive: true });
  const v2 = migrateSupplementsV2(seedSupplementsV1('2026-11-08'), '2026-11-11');
  v2.find(s => s.id === 'whey').remind = '07:20';   // an own edit from round 2 stays
  const log = { '2026-11-11': { 'omega3-lunch': { status: 'taken', at: 1 } } };
  fs.writeFileSync(path.join(dir, 'u-u1.json'), JSON.stringify({ v: 1, suppV: 2, supplements: { list: v2, log } }));
  const store = createHealthStore({ dir, now: () => Date.parse('2026-11-12T06:00:00Z') });
  const list = store.get('u1').supplements.list;
  const by = id => list.find(x => x.id === id);
  assert.equal(by('omega3').active, true);
  assert.equal(by('omega3').remind, '07:30');
  assert.equal(by('omega3-lunch').active, false);
  assert.equal(by('omega3-dinner').active, false);
  assert.equal(by('whey').remind, '07:20');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'u-u1.json'), 'utf8'));
  assert.equal(raw.suppV, 3);
  assert.deepEqual(raw.supplements.log, log);
});
