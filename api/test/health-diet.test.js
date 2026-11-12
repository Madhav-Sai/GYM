/* Diet log (api/health/diet.js, our addition): entries are checked, plan items log once, water
 * never goes below 0, and an unknown saturated-fat value stays unknown in the totals. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitiseEntry, addEntry, removeEntry, addWater, setDay, totals, blankDay } from '../health/diet.js';
import { createHealthStore, validDay } from '../health/store.js';

const chicken = { name: 'Chicken breast cooked', foodId: 'chicken', qty: 150, unit: 'g', slot: 'lunch', kcal: 247.5, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, satFat: 1.5, omega3: null };

test('an entry keeps its numbers and refuses what is not a number', () => {
  const e = sanitiseEntry(chicken);
  assert.equal(e.protein, 46.5);
  assert.equal(e.omega3, null);
  assert.match(e.id, /^[0-9a-f]{12}$/);
  assert.throws(() => sanitiseEntry({ ...chicken, kcal: -1 }), /kcal/);
  assert.throws(() => sanitiseEntry({ ...chicken, protein: 'lots' }), /protein/);
  assert.throws(() => sanitiseEntry({ ...chicken, qty: 0 }), /amount/);
  assert.throws(() => sanitiseEntry({ ...chicken, name: ' ' }), /name/);
  // kcal can not be null: only saturated fat, omega-3 and fibre may be unknown
  assert.throws(() => sanitiseEntry({ ...chicken, kcal: null }), /kcal/);
  assert.equal(sanitiseEntry({ ...chicken, fiber: null }).fiber, null);
});

test('a plan item logs once; unlog by id or by plan key', () => {
  const day = blankDay();
  addEntry(day, { ...chicken, planKey: 'lunch:2' }, 't');
  addEntry(day, { ...chicken, planKey: 'lunch:2' }, 't');
  assert.equal(day.entries.length, 1);
  const free = addEntry(day, { ...chicken, name: 'Extra' }, 't');
  assert.equal(day.entries.length, 2);
  assert.ok(removeEntry(day, 'lunch:2'));
  assert.ok(removeEntry(day, free.id));
  assert.equal(day.entries.length, 0);
  assert.equal(removeEntry(day, 'nothing'), false);
});

test('water: 250 ml taps, never below 0', () => {
  const day = blankDay();
  assert.equal(addWater(day, 250), 250);
  assert.equal(addWater(day, 250), 500);
  assert.equal(addWater(day, -1000), 0);
  assert.throws(() => addWater(day, 'a lot'));
});

test('totals add up and count unknown saturated fat instead of reading it as 0', () => {
  const t = totals([sanitiseEntry(chicken), sanitiseEntry({ ...chicken, satFat: null, omega3: 300 })]);
  assert.equal(t.protein, 93);
  assert.equal(t.satFat, 1.5);
  assert.equal(t.unknown.satFat, 1);
  assert.equal(t.omega3, 300);
  assert.equal(t.unknown.omega3, 1);
});

test('day settings: a day type or null, per-meal veg', () => {
  const day = blankDay();
  setDay(day, { dayType: 'cardio', vegMeals: { lunch: true, bogus: true } });
  assert.equal(day.dayType, 'cardio');
  assert.deepEqual(day.vegMeals, { lunch: true });
  setDay(day, { dayType: null, vegMeals: { lunch: null } });
  assert.equal(day.dayType, null);
  assert.deepEqual(day.vegMeals, {});
  assert.throws(() => setDay(day, { dayType: 'cheat' }));
});

test('validDay takes only real dates', () => {
  assert.equal(validDay('2026-11-08'), '2026-11-08');
  assert.equal(validDay('2026-02-30'), null);
  assert.equal(validDay('8/11/2026'), null);
});

test('the store writes DATA_DIR/health/u-<uid>.json, seeds supplements, and drops old days', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-health-')), 'health');
  const now = () => Date.parse('2026-11-08T06:00:00Z');
  const store = createHealthStore({ dir, now });
  assert.equal(store.get('u1').supplements.list.length, 8);
  store.change('u1', doc => { doc.diet.days['2026-11-08'] = { ...blankDay(), water: 500 }; doc.diet.days['2024-01-01'] = blankDay(); });
  const file = path.join(dir, 'u-u1.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.diet.days['2026-11-08'].water, 500);
  assert.ok(!('2024-01-01' in raw.diet.days), 'older than 400 days is dropped');
  // a fresh store (a restart) reads the file back
  assert.equal(createHealthStore({ dir, now }).get('u1').diet.days['2026-11-08'].water, 500);
  // a throw inside change saves nothing
  assert.throws(() => store.change('u1', doc => { doc.diet.days['2026-11-08'].water = 9; throw new Error('no'); }));
  assert.equal(store.get('u1').diet.days['2026-11-08'].water, 500);
  store.removeUser('u1');
  assert.ok(!fs.existsSync(file));
});
