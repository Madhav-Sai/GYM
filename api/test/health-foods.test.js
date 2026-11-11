/* The food database's per-instance changes (health/foods.js) and the diet prefs (our addition). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitiseFood, saveFood, hideFood, blankFoods, createFoodStore } from '../health/foods.js';
import { setPrefs } from '../health/diet.js';
import { blankHealth } from '../health/store.js';

const sattu = { name: 'Sattu', unit: 'g', per: 100, kcal: 400, protein: 22, carbs: 60, fat: 6, fiber: 10, satFat: null, omega3: null, veg: true, cat: 'dal', note: 'roasted gram flour' };

test('a whole food is checked; bad values are a 400', () => {
  assert.equal(sanitiseFood(sattu).name, 'Sattu');
  assert.equal(sanitiseFood({ ...sattu, cat: 'zzz' }).cat, 'other');
  for (const bad of [{ ...sattu, name: '' }, { ...sattu, unit: 'kg' }, { ...sattu, per: 0 }, { ...sattu, kcal: -1 }, { ...sattu, protein: 'x' }, { ...sattu, satFat: -2 }, { ...sattu, vegAlt: '../x' }, null]) {
    assert.throws(() => sanitiseFood(bad), e => e.status === 400);
  }
});

test('a scanned food keeps its barcode; a bad one is a 400', () => {
  assert.equal(sanitiseFood({ ...sattu, barcode: '8901234567890' }).barcode, '8901234567890');
  assert.equal('barcode' in sanitiseFood(sattu), false);
  assert.throws(() => sanitiseFood({ ...sattu, barcode: '12ab' }), e => e.status === 400);
});

test('save adds with a fresh id, edits a built-in by fields, and hide or restore', () => {
  const doc = blankFoods();
  assert.equal(saveFood(doc, { food: sattu }).id, 'x-sattu');
  assert.equal(saveFood(doc, { food: sattu }).id, 'x-sattu-2');
  saveFood(doc, { food: { ...sattu, id: 'x-sattu', kcal: 380 } });
  assert.equal(doc.added.length, 2);
  assert.equal(doc.added[0].kcal, 380);
  saveFood(doc, { builtin: true, food: { id: 'chicken', protein: 30 } });
  saveFood(doc, { builtin: true, food: { id: 'chicken', vegAlt: 'paneer' } });
  assert.deepEqual(doc.edited.chicken, { protein: 30, vegAlt: 'paneer' });
  assert.throws(() => saveFood(doc, { builtin: true, food: { id: 'chicken' } }), e => e.status === 400);
  hideFood(doc, { id: 'rohu' }); hideFood(doc, { id: 'rohu' });
  assert.deepEqual(doc.hidden, ['rohu']);
  hideFood(doc, { id: 'rohu', restore: true });
  assert.deepEqual(doc.hidden, []);
  hideFood(doc, { id: 'chicken', reset: true });
  assert.equal(doc.edited.chicken, undefined);
});

test('the store survives a restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-foods-')), 'health', 'foods.json');
  createFoodStore({ file }).change(d => saveFood(d, { food: sattu }));
  assert.equal(createFoodStore({ file }).get().added[0].id, 'x-sattu');
});

test('diet prefs: protein per kg 1.6 to 2.6 and an optional kcal target', () => {
  const doc = blankHealth();
  setPrefs(doc, { proteinPerKg: 2.04 });
  assert.equal(doc.diet.prefs.proteinPerKg, 2);
  setPrefs(doc, { kcalTarget: 2200.4 });
  assert.equal(doc.diet.prefs.kcalTarget, 2200);
  for (const bad of [{ proteinPerKg: 1.5 }, { proteinPerKg: 2.7 }, { proteinPerKg: '2' }, { kcalTarget: 500 }, { kcalTarget: 'x' }]) {
    assert.throws(() => setPrefs(doc, bad), e => e.status === 400, JSON.stringify(bad));
  }
  setPrefs(doc, { proteinPerKg: null, kcalTarget: null });
  assert.deepEqual(doc.diet.prefs, { veg: false });
});
