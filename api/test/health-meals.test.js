/* Saved meals (health/meals.js) and logging several entries at once: signed-in only, each profile
 * its own list, every item checked like a diet entry, and the totals move like a normal log. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { healthRoutes } from '../health/routes.js';
import { createHealthStore } from '../health/store.js';
import { sanitiseMeal, MAX_MEAL_ITEMS, MAX_MEALS, saveMeal } from '../health/meals.js';

const NOW = Date.parse('2026-11-08T06:00:00Z');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-meals-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'health');
  const store = createHealthStore({ dir, now: () => NOW });
  let session = { id: 'u1' };
  const routes = healthRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body,
    readSession: () => session,
    store, now: () => NOW,
  });
  const call = async (key, { url, body } = {}) => { const res = {}; await routes[key]({ url: url || key.split(' ')[1], body }, res); return res; };
  return { call, setSession: s => { session = s; }, dir, store };
}

const egg = { name: 'Egg whole boiled', qty: 100, unit: 'g', slot: 'pre', foodId: 'egg', planKey: 'pre:0', kcal: 155, protein: 13, carbs: 1, fat: 11, fiber: 0, satFat: 3.3, omega3: null };
const oats = { name: 'Oats', qty: 50, unit: 'g', slot: 'pre', kcal: 190, protein: 6.5, carbs: 33, fat: 3.5, fiber: 5, satFat: null, omega3: null };

test('not signed in: 401 on every meal route', async t => {
  const { call, setSession } = setup(t);
  setSession(null);
  for (const key of ['GET /api/health/meals', 'POST /api/health/meals/save', 'POST /api/health/meals/delete']) {
    assert.equal((await call(key, { body: { meal: { name: 'x', items: [oats] } } })).status, 401, key);
  }
});

test('save, rename, list and delete a meal; the day-only fields are not kept', async t => {
  const { call } = setup(t);
  let r = await call('POST /api/health/meals/save', { body: { meal: { name: '  Usual breakfast ', items: [egg, oats] } } });
  assert.equal(r.status, 200);
  const meal = r.body.meal;
  assert.match(meal.id, /^m-[a-f0-9]{12}$/);
  assert.equal(meal.name, 'Usual breakfast');
  assert.equal(meal.items.length, 2);
  assert.equal(meal.items[0].foodId, 'egg');
  for (const k of ['id', 'slot', 'planKey', 'at']) assert.equal(k in meal.items[0], false, k);
  assert.equal(meal.items[1].satFat, null);
  r = await call('POST /api/health/meals/save', { body: { meal: { id: meal.id, name: 'Breakfast A' } } });
  assert.equal(r.body.meal.name, 'Breakfast A');
  assert.equal(r.body.meal.items.length, 2, 'a rename keeps the items');
  r = await call('GET /api/health/meals');
  assert.deepEqual(r.body.meals.map(m => m.name), ['Breakfast A']);
  r = await call('POST /api/health/meals/delete', { body: { id: meal.id } });
  assert.deepEqual(r.body.meals, []);
  assert.equal((await call('POST /api/health/meals/delete', { body: { id: meal.id } })).status, 404);
});

test('another profile never sees or changes the first one\'s meals', async t => {
  const { call, setSession } = setup(t);
  const { body } = await call('POST /api/health/meals/save', { body: { meal: { name: 'Mine', items: [oats] } } });
  setSession({ id: 'u2' });
  assert.deepEqual((await call('GET /api/health/meals')).body.meals, []);
  assert.equal((await call('POST /api/health/meals/save', { body: { meal: { id: body.meal.id, name: 'Stolen' } } })).status, 404);
  assert.equal((await call('POST /api/health/meals/delete', { body: { id: body.meal.id } })).status, 404);
  setSession({ id: 'u1' });
  assert.equal((await call('GET /api/health/meals')).body.meals[0].name, 'Mine');
});

test('bad meals are a 400: no name, no items, too many items, a bad item', async t => {
  const { call } = setup(t);
  const save = meal => call('POST /api/health/meals/save', { body: { meal } });
  assert.equal((await save({ name: '', items: [oats] })).status, 400);
  assert.equal((await save({ name: 'x', items: [] })).status, 400);
  assert.equal((await save({ name: 'x', items: Array(MAX_MEAL_ITEMS + 1).fill(oats) })).status, 400);
  assert.equal((await save({ name: 'x', items: [{ name: 'y' }] })).status, 400);
  assert.equal((await save(null)).status, 400);
  assert.equal(sanitiseMeal({ name: 'x'.repeat(200), items: [oats] }).name.length, 60);
});

test('at most MAX_MEALS meals', () => {
  const doc = { meals: [] };
  for (let i = 0; i < MAX_MEALS; i++) saveMeal(doc, { name: 'm' + i, items: [oats] }, 'now');
  assert.throws(() => saveMeal(doc, { name: 'one more', items: [oats] }, 'now'), e => e.code === 'too-many');
});

test('a meal logged with entries: all at once, totals add up, and a bad one logs none', async t => {
  const { call } = setup(t);
  const entries = [{ ...egg, slot: 'lunch', planKey: undefined }, { ...oats, slot: 'lunch' }];
  let r = await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entries } });
  assert.equal(r.status, 200);
  assert.equal(r.body.entries.length, 2);
  assert.equal(r.body.totals.kcal, 345);
  assert.equal(r.body.totals.protein, 19.5);
  assert.ok(r.body.entries.every(e => e.slot === 'lunch'));
  r = await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entries: [oats, { name: 'bad' }] } });
  assert.equal(r.status, 400);
  r = await call('GET /api/health/diet', { url: '/api/health/diet?day=2026-11-08' });
  assert.equal(r.body.entries.length, 2, 'the refused batch left nothing behind');
  assert.equal((await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entries: [] } })).status, 400);
  assert.equal((await call('POST /api/health/diet/log', { body: { day: '2026-11-08', entries: Array(31).fill(oats) } })).status, 400);
});
