/* Saved meals (our addition): "my usual breakfast", kept so it can be logged again in one tap. A meal
 * is a name and the items it was saved from, each checked like a diet entry (diet.js sanitiseEntry)
 * and stored without the parts that belong to one day: its id, its slot, its plan key, its time.
 * Lives in the profile's health file beside the diet log: { meals: [{ id, name, items, at }] }. */
import crypto from 'node:crypto';
import { sanitiseEntry } from './diet.js';

export const MAX_MEALS = 100;
export const MAX_MEAL_ITEMS = 30;
export const MEAL_NAME_MAX = 60;

const bad = (message, code = 'invalid') => Object.assign(new Error(message), { status: 400, code });
const missing = () => Object.assign(new Error('no such meal'), { status: 404, code: 'missing' });
const MEAL_ID = /^m-[a-f0-9]{12}$/;

/** One item of a meal, checked: an entry without its day-only fields. Throws a 400. */
export function sanitiseMealItem(raw) {
  // sanitiseEntry needs nothing from the slot; any value it gives is dropped below.
  const { id, slot, planKey, ...item } = sanitiseEntry(raw);
  return item;
}

/** A meal as the app sent it ({ name, items }), checked. Throws a 400. */
export function sanitiseMeal(raw, { needItems = true } = {}) {
  if (!raw || typeof raw !== 'object') throw bad('meal missing');
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MEAL_NAME_MAX) : '';
  if (!name) throw bad('a meal needs a name', 'name');
  if (raw.items === undefined && !needItems) return { name };
  if (!Array.isArray(raw.items) || !raw.items.length) throw bad('a meal needs at least one item', 'items');
  if (raw.items.length > MAX_MEAL_ITEMS) throw bad(`a meal has at most ${MAX_MEAL_ITEMS} items`, 'too-many');
  return { name, items: raw.items.map(sanitiseMealItem) };
}

export const mealsOf = doc => (Array.isArray(doc.meals) ? doc.meals : []);

/**
 * Save a new meal, or change one by its id (a rename may leave `items` out to keep them).
 * Returns the saved meal. 404 for an id this profile does not have.
 */
export function saveMeal(doc, raw, at) {
  const list = mealsOf(doc);
  const id = typeof raw?.id === 'string' ? raw.id : null;
  if (id) {
    const i = list.findIndex(m => m.id === id);
    if (!MEAL_ID.test(id) || i < 0) throw missing();
    const next = { ...list[i], ...sanitiseMeal(raw, { needItems: false }), at };
    doc.meals = list.map((m, j) => (j === i ? next : m));
    return next;
  }
  if (list.length >= MAX_MEALS) throw bad(`at most ${MAX_MEALS} saved meals`, 'too-many');
  const meal = { id: 'm-' + crypto.randomBytes(6).toString('hex'), ...sanitiseMeal(raw), at };
  doc.meals = [...list, meal];
  return meal;
}

export function deleteMeal(doc, id) {
  const list = mealsOf(doc);
  const next = list.filter(m => m.id !== id);
  if (next.length === list.length) throw missing();
  doc.meals = next;
}
