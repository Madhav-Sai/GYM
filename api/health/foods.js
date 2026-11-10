/* The food database's per-instance changes (our addition): DATA_DIR/health/foods.json.
 *
 * The built-in list lives in the app (frontend/src/lib/diet-foods.js) and this image cannot import
 * it, so the server keeps only what an admin changed on top of it:
 *   added:  foods that are not in the built-in list, whole
 *   edited: { id: fields } changed on a built-in food (only the fields that were sent)
 *   hidden: ids no longer offered when logging (built-in or added); a plan or an old entry that
 *           names one still resolves, it is only left out of the pick list
 * The app merges the three onto its list (mergeFoods in diet-foods.js). Written temp-then-rename. */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';

export const FOOD_UNITS = ['g', 'ml', 'piece', 'slice', 'tsp', 'scoop'];
export const FOOD_CATS = ['protein', 'dal', 'dairy', 'grain', 'nuts', 'fat', 'veg', 'fruit', 'snack', 'fibre', 'other'];
export const MAX_ADDED = 500;
const NUM_FIELDS = { kcal: 2000, protein: 200, carbs: 200, fat: 200, fiber: 200 };
const NULLABLE_FIELDS = { satFat: 200, omega3: 100000 };
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const bad = (message, code = 'invalid') => Object.assign(new Error(message), { status: 400, code });
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => Math.round(v * 100) / 100;

export const blankFoods = () => ({ v: 1, added: [], edited: {}, hidden: [] });
export const validFoodId = id => typeof id === 'string' && ID.test(id);

/**
 * A food (or, with `partial`, only some fields of one) as an admin sent it, checked. Throws a 400.
 * Values are per `per` of `unit`; omega-3 in mg; satFat and omega3 may be null (unknown).
 */
export function sanitiseFood(f, { partial = false } = {}) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw bad('food missing');
  const out = {};
  const has = k => f[k] !== undefined;
  if (!partial || has('name')) {
    const name = str(f.name, 80);
    if (!name) throw bad('food needs a name');
    out.name = name;
  }
  if (!partial || has('unit')) {
    if (!FOOD_UNITS.includes(f.unit)) throw bad('unit must be one of ' + FOOD_UNITS.join(', '));
    out.unit = f.unit;
  }
  if (!partial || has('per')) {
    if (!isNum(f.per) || f.per <= 0 || f.per > 1000) throw bad('per must be above 0 and at most 1000');
    out.per = r2(f.per);
  }
  for (const [k, max] of Object.entries(NUM_FIELDS)) {
    if (partial && !has(k)) continue;
    if (!isNum(f[k]) || f[k] < 0 || f[k] > max) throw bad(`${k} must be a number from 0 to ${max}`);
    out[k] = r2(f[k]);
  }
  for (const [k, max] of Object.entries(NULLABLE_FIELDS)) {
    if (partial && !has(k)) continue;
    if (f[k] == null) { out[k] = null; continue; }
    if (!isNum(f[k]) || f[k] < 0 || f[k] > max) throw bad(`${k} must be empty or a number from 0 to ${max}`);
    out[k] = r2(f[k]);
  }
  if (!partial || has('veg')) out.veg = !!f.veg;
  if (!partial || has('cat')) out.cat = FOOD_CATS.includes(f.cat) ? f.cat : 'other';
  if (!partial || has('vegAlt')) {
    if (f.vegAlt == null || f.vegAlt === '') out.vegAlt = null;
    else if (!validFoodId(f.vegAlt)) throw bad('vegAlt must be a food id');
    else out.vegAlt = f.vegAlt;
  }
  if (!partial || has('note')) out.note = str(f.note, 80) || null;
  return out;
}

const slug = name => String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'food';

/** Add or change a food. `builtin` true stores the fields as an edit of the app's own food. */
export function saveFood(doc, { food, builtin = false } = {}) {
  if (builtin) {
    if (!validFoodId(food?.id)) throw bad('a built-in food needs its id');
    const fields = sanitiseFood(food, { partial: true });
    if (!Object.keys(fields).length) throw bad('nothing to change');
    doc.edited[food.id] = { ...(doc.edited[food.id] || {}), ...fields };
    return { id: food.id, ...doc.edited[food.id] };
  }
  const fields = sanitiseFood(food);
  let id = food?.id;
  if (id !== undefined && !validFoodId(id)) throw bad('id must be lowercase letters, digits and dashes');
  const i = id ? doc.added.findIndex(x => x.id === id) : -1;
  if (i >= 0) { doc.added[i] = { id, ...fields }; return doc.added[i]; }
  if (doc.added.length >= MAX_ADDED) throw bad('too many added foods', 'too-many');
  if (!id) {
    const base = 'x-' + slug(fields.name);
    id = base;
    for (let n = 2; doc.added.some(x => x.id === id); n++) id = `${base}-${n}`;
  }
  const row = { id, ...fields };
  doc.added.push(row);
  return row;
}

/** Hide a food from the pick list, or with `restore` offer it again. `reset` drops a built-in's edits. */
export function hideFood(doc, { id, restore = false, reset = false } = {}) {
  if (!validFoodId(id)) throw bad('id missing');
  if (reset) { delete doc.edited[id]; return doc; }
  const hidden = new Set(doc.hidden);
  if (restore) hidden.delete(id); else hidden.add(id);
  doc.hidden = [...hidden].slice(0, 2000);
  return doc;
}

export function createFoodStore({ file }) {
  let cache = null;
  function load() {
    if (cache) return cache;
    let d = blankFoods();
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      d = {
        v: 1,
        added: Array.isArray(raw.added) ? raw.added : [],
        edited: raw.edited && typeof raw.edited === 'object' && !Array.isArray(raw.edited) ? raw.edited : {},
        hidden: Array.isArray(raw.hidden) ? raw.hidden.filter(validFoodId) : [],
      };
    } catch (e) { if (e.code !== 'ENOENT') console.error('foods: cannot read', e.message); }
    cache = d;
    return d;
  }
  return {
    get: () => structuredClone(load()),
    change(fn) {
      const d = structuredClone(load());
      const out = fn(d);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWrite(file, JSON.stringify(d), 0o600);
      cache = d;
      return out;
    },
  };
}
