/* Diet log (our addition): what was eaten each day, water, and the day's own settings. The app
 * owns the food database and works out each entry's macros when it is logged (frontend/src/lib/
 * diet-foods.js); the server keeps the numbers it was sent, checks them, and adds them up.
 *
 * A value nobody knows (saturated fat of a home-cooked chapati) stays null, never 0: the totals say
 * how many entries had no value so the app can mark the sum as partial. */
import crypto from 'node:crypto';

export const MACROS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'satFat', 'omega3'];
// Nullable: not every food in the seed has a known saturated-fat or omega-3 value.
const NULLABLE = new Set(['satFat', 'omega3']);
export const SLOTS = ['pre', 'post', 'lunch', 'snack1', 'dinner', 'snack2', 'bed', 'other'];
export const DAY_TYPES = ['training', 'cardio', 'rest'];
export const UNITS = ['g', 'ml', 'piece', 'slice', 'tsp', 'scoop'];
export const MAX_ENTRIES = 200;
export const MAX_WATER = 10000;

const bad = (message, code = 'invalid') => Object.assign(new Error(message), { status: 400, code });
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined);

export const blankDay = () => ({ entries: [], water: 0, dayType: null, vegMeals: {} });

/** One entry as the app sent it, checked. Throws a 400 for anything that is not an entry. */
export function sanitiseEntry(e) {
  if (!e || typeof e !== 'object') throw bad('entry missing');
  const name = str(e.name, 80);
  if (!name) throw bad('entry needs a name');
  const qty = num(e.qty, 5000);
  if (!qty) throw bad('entry needs an amount above 0');
  const unit = UNITS.includes(e.unit) ? e.unit : 'g';
  const slot = SLOTS.includes(e.slot) ? e.slot : 'other';
  const out = { id: crypto.randomBytes(6).toString('hex'), name, qty, unit, slot };
  if (str(e.foodId, 40)) out.foodId = str(e.foodId, 40);
  if (str(e.planKey, 40)) out.planKey = str(e.planKey, 40);
  for (const k of MACROS) {
    if (e[k] == null && NULLABLE.has(k)) { out[k] = null; continue; }
    const v = num(e[k], k === 'omega3' ? 100000 : 10000);
    if (v === undefined) throw bad(`entry ${k} must be a number from 0`);
    out[k] = v;
  }
  return out;
}

export function addEntry(day, entry, at) {
  if (day.entries.length >= MAX_ENTRIES) throw bad('too many entries on one day', 'too-many');
  const e = { ...sanitiseEntry(entry), at };
  // A plan item is logged once: tapping it again is the app's unlog, not a second helping.
  if (e.planKey) day.entries = day.entries.filter(x => x.planKey !== e.planKey);
  day.entries.push(e);
  return e;
}

export function removeEntry(day, id) {
  const before = day.entries.length;
  day.entries = day.entries.filter(e => e.id !== id && (!e.planKey || e.planKey !== id));
  return before !== day.entries.length;
}

/** Water in ml, by a delta (a 250 ml tap, or -250 to take one back). Never below 0. */
export function addWater(day, delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) > 2000) throw bad('water must be a change in ml');
  day.water = Math.max(0, Math.min(MAX_WATER, Math.round((day.water || 0) + delta)));
  return day.water;
}

/** The day's own settings: its type (training, cardio, rest; null = by weekday) and per-meal veg. */
export function setDay(day, { dayType, vegMeals } = {}) {
  if (dayType !== undefined) {
    if (dayType !== null && !DAY_TYPES.includes(dayType)) throw bad('dayType must be training, cardio, rest or null');
    day.dayType = dayType;
  }
  if (vegMeals !== undefined) {
    if (!vegMeals || typeof vegMeals !== 'object') throw bad('vegMeals must be an object');
    const next = { ...(day.vegMeals || {}) };
    for (const [slot, v] of Object.entries(vegMeals)) {
      if (!SLOTS.includes(slot)) continue;
      if (v === null) delete next[slot];
      else next[slot] = !!v;
    }
    day.vegMeals = next;
  }
  return day;
}

/** Sums of every macro, with how many entries had no value for the nullable ones. */
export function totals(entries) {
  const t = Object.fromEntries(MACROS.map(k => [k, 0]));
  const unknown = { satFat: 0, omega3: 0 };
  for (const e of entries || []) {
    for (const k of MACROS) {
      if (e[k] == null) { if (k in unknown) unknown[k]++; continue; }
      t[k] += e[k];
    }
  }
  for (const k of MACROS) t[k] = Math.round(t[k] * 10) / 10;
  return { ...t, unknown };
}

export function dayView(doc, dayKey) {
  const day = { ...blankDay(), ...(doc.diet.days[dayKey] || {}) };
  return { day: dayKey, ...day, totals: totals(day.entries), prefs: doc.diet.prefs };
}

export function setPrefs(doc, { veg } = {}) {
  if (veg !== undefined) doc.diet.prefs.veg = !!veg;
  return doc.diet.prefs;
}
