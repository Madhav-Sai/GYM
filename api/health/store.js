/* Diet and supplements (our addition), per profile: DATA_DIR/health/u-<uid>.json, written
 * temp-then-rename like every other file here. Kept apart from the profile's synced state the way
 * the Whoop data is: this is a single-owner log, read and written by the app over the API.
 *
 * The file holds { v, suppV, diet: { prefs, days: { 'YYYY-MM-DD': day } }, supplements: { list, log }, meals }
 * (meals.js: the saved meals).
 * Days older than KEEP_DAYS are dropped on every save. */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';
import { seedSupplements, migrateSupplementsV2, SUPP_SEED_VERSION } from './supplements.js';

export const KEEP_DAYS = 400;
const DAY = 86400_000;

const safeUid = uid => String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
export const blankHealth = () => ({ v: 1, diet: { prefs: { veg: false }, days: {} }, supplements: { list: null, log: {} }, meals: [] });

/** 'YYYY-MM-DD' that is a real calendar date, or null. */
export function validDay(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d ? d : null;
}

export function createHealthStore({ dir, now = Date.now }) {
  const fileOf = uid => path.join(dir, 'u-' + safeUid(uid) + '.json');
  const cache = new Map();

  function load(uid) {
    if (cache.has(uid)) return cache.get(uid);
    let d = blankHealth();
    try {
      const raw = JSON.parse(fs.readFileSync(fileOf(uid), 'utf8'));
      d = { ...d, ...raw, diet: { ...d.diet, ...(raw.diet || {}) }, supplements: { ...d.supplements, ...(raw.supplements || {}) } };
    } catch (e) { if (e.code !== 'ENOENT') console.error('health: cannot read data of', safeUid(uid), e.message); }
    // First read: the owner's supplements, so the checklist is never empty on day one. A list seeded
    // in an earlier round gets the later ones once (supplements.js), and is saved.
    const today = new Date(now()).toISOString().slice(0, 10);
    if (!Array.isArray(d.supplements.list)) {
      d.supplements.list = seedSupplements(today);
      d.suppV = SUPP_SEED_VERSION;
    } else if ((Number.isInteger(d.suppV) ? d.suppV : 1) < SUPP_SEED_VERSION) {
      migrateSupplementsV2(d.supplements.list, today);
      d.suppV = SUPP_SEED_VERSION;
      save(uid, d);
    }
    cache.set(uid, d);
    return d;
  }

  function save(uid, d) {
    const cutoff = new Date(now() - KEEP_DAYS * DAY).toISOString().slice(0, 10);
    const recent = o => Object.fromEntries(Object.entries(o || {}).filter(([day]) => day >= cutoff));
    d.diet.days = recent(d.diet.days);
    d.supplements.log = recent(d.supplements.log);
    fs.mkdirSync(dir, { recursive: true });
    atomicWrite(fileOf(uid), JSON.stringify(d), 0o600);
    cache.set(uid, d);
  }

  return {
    /** A copy to read. */
    get: uid => structuredClone(load(uid)),
    /** Change a copy with fn(doc) and save it; returns fn's answer. A throw saves nothing. */
    change(uid, fn) {
      const d = structuredClone(load(uid));
      const out = fn(d);
      save(uid, d);
      return out;
    },
    removeUser(uid) { cache.delete(uid); try { fs.unlinkSync(fileOf(uid)); } catch { /* none */ } },
  };
}
