/* Medical records, per profile: DATA_DIR/medical/u-<uid>.json, written temp-then-rename like every
 * other file here (durable.js). Blood tests, InBody scans and goals. A lab result's report file
 * (PDF or photo) is kept beside it in DATA_DIR/medical/files/<uid>/ (files.js).
 * Kept apart from the profile's synced state on purpose: it is health data, it does not ride along in every device's localStorage
 * or every backup, and only this profile's session ever reads it.
 *
 * The first read of a profile with no file seeds it (seed.js) and saves, so it happens once. A
 * record carries the seed version it has had (`seedV`, 1 when missing): a read of an older one adds
 * what the later rounds bring (seed-v2.js, migrateMedical) exactly once and saves. Every value is
 * checked on the way in: a number the person did not give is null (the app draws a dash), never 0. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from '../durable.js';
import { seedDoc, SEED_TRACKED } from './seed.js';
import { V2_DATE, V2_LAB, V2_INBODY, V2_GOALS, V2_TRACKED, V2_TESTS, V2_VITD_GOAL, V2_VITD_ACHIEVED } from './seed-v2.js';

export const LIMITS = { labs: 200, markers: 200, inbody: 500, goals: 50 };
export const SEED_VERSION = 2;
export const LAB_FLAGS = ['normal', 'high', 'low', 'deficient'];
export const SEG_FLAGS = ['normal', 'under', 'over'];
export const SEGMENTS = ['la', 'ra', 'trunk', 'll', 'rl'];
export const INBODY_FIELDS = ['weight', 'bodyFatPct', 'bodyFatMass', 'skeletalMuscle', 'leanMass', 'visceralFat', 'whr', 'bmr', 'bmi', 'score', 'tbw', 'protein', 'mineral', 'smi', 'intake'];
const TARGET_FIELDS = ['weight', 'weightControl', 'fatControl', 'muscleControl'];

const safeUid = uid => String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

export class MedicalError extends Error {
  constructor(message, code) { super(message); this.status = 400; this.code = code; }
}
const bad = (msg, code) => { throw new MedicalError(msg, code); };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function day(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) bad('date must be YYYY-MM-DD', 'date');
  return v;
}
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// A number, or null for "not given". Strings like "12.5" are read, "" and anything else is null.
const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? n : null;
};
const id = (v, prefix) => (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(v) ? v : prefix + '-' + crypto.randomBytes(6).toString('hex'));
const keyOf = (v, name) => {
  const k = (typeof v === 'string' && v ? v : name).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return k || null;
};

export function cleanMarker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name, 80);
  const key = keyOf(raw.key, name);
  if (!key || !name) return null;
  const ref = raw.ref && typeof raw.ref === 'object' ? raw.ref : {};
  const value = num(raw.value);
  const text = str(raw.text, 80);
  if (value === null && !text) return null; // nothing measured: not a result
  return {
    key, name, panel: str(raw.panel, 40) || 'Other', value, unit: str(raw.unit, 20),
    ref: {
      lo: num(ref.lo), hi: num(ref.hi), text: str(ref.text, 40),
      ...(num(ref.below) !== null ? { below: num(ref.below) } : {}),
      ...(ref.std === true ? { std: true } : {}),
    },
    flag: LAB_FLAGS.includes(raw.flag) ? raw.flag : null,
    ...(text ? { text } : {}),
    ...(str(raw.note, 200) ? { note: str(raw.note, 200) } : {}),
  };
}

export function cleanLab(raw) {
  if (!raw || typeof raw !== 'object') bad('a lab result is an object', 'body');
  const markers = (Array.isArray(raw.markers) ? raw.markers : []).slice(0, LIMITS.markers).map(cleanMarker).filter(Boolean);
  if (!markers.length) bad('add at least one marker with a value', 'markers');
  // One marker per key: the last one given wins.
  const byKey = new Map(markers.map(x => [x.key, x]));
  const note = str(raw.note, 200);
  return { id: id(raw.id, 'lab'), date: day(raw.date), lab: str(raw.lab, 80), ...(note ? { note } : {}), markers: [...byKey.values()] };
}

export function cleanInbody(raw) {
  if (!raw || typeof raw !== 'object') bad('an InBody entry is an object', 'body');
  const out = { id: id(raw.id, 'inbody'), date: day(raw.date) };
  for (const f of INBODY_FIELDS) out[f] = num(raw[f]);
  const time = typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : null;
  if (time) out.time = time;
  const device = str(raw.device, 40); if (device) out.device = device;
  // Lean mass and fat mass per segment. `approx` marks a value read off a faint sheet.
  const segs = v => {
    const seg = v && typeof v === 'object' ? v : {};
    return Object.fromEntries(SEGMENTS.map(s => {
      const r = seg[s] && typeof seg[s] === 'object' ? seg[s] : {};
      return [s, { kg: num(r.kg), flag: SEG_FLAGS.includes(r.flag) ? r.flag : null, ...(r.approx === true ? { approx: true } : {}) }];
    }));
  };
  out.segmental = segs(raw.segmental);
  out.segmentalFat = segs(raw.segmentalFat);
  const note = str(raw.note, 200); if (note) out.note = note;
  const tg = raw.targets && typeof raw.targets === 'object' ? raw.targets : {};
  out.targets = Object.fromEntries(TARGET_FIELDS.map(f => [f, num(tg[f])]));
  if (!INBODY_FIELDS.some(f => out[f] !== null)) bad('fill in at least one value', 'empty');
  return out;
}

export function cleanGoal(raw) {
  if (!raw || typeof raw !== 'object') bad('a goal is an object', 'body');
  const key = typeof raw.key === 'string' && /^(weight|lab:[a-z0-9_]{1,40}|inbody:[a-zA-Z]{1,40})$/.test(raw.key) ? raw.key : null;
  if (!key) bad('unknown goal metric', 'key');
  const lo = num(raw.lo), hi = num(raw.hi);
  if (lo === null && hi === null) bad('a goal needs a target', 'target');
  if (lo !== null && hi !== null && lo > hi) bad('the low end of the target is above the high end', 'target');
  const note = str(raw.note, 200);
  const a = raw.achieved && typeof raw.achieved === 'object' && DATE_RE.test(raw.achieved.date || '') ? { date: raw.achieved.date, value: num(raw.achieved.value) } : null;
  return {
    id: id(raw.id, 'g'), key, label: str(raw.label, 60) || key, unit: str(raw.unit, 20),
    start: num(raw.start), lo, hi, by: day(raw.by), from: raw.from ? day(raw.from) : null,
    ...(note ? { note } : {}), ...(a ? { achieved: a } : {}),
  };
}

/** A test to book: a title, the window it is due in (from/to, either may be null), why, what to
 *  expect, and the day it was done. */
export function cleanTest(raw) {
  if (!raw || typeof raw !== 'object') bad('a test is an object', 'body');
  const title = str(raw.title, 120);
  if (!title) bad('a test needs a title', 'title');
  const out = { id: id(raw.id, 't'), title, from: raw.from ? day(raw.from) : null, to: raw.to ? day(raw.to) : null };
  for (const k of ['reason', 'expect']) { const v = str(raw[k], 200); if (v) out[k] = v; }
  if (raw.prominent === true) out.prominent = true;
  if (raw.done) out.done = day(raw.done);
  return out;
}

/* Seed round 2 (seed-v2.js), onto whatever the record holds now. A test or scan of the same day is
   taken as the person's own entry of the same sheet and left alone. Goals of the new plan replace
   the ones of the same id, keeping an achieved mark; tracked markers become the new list plus any
   the person added. Returns the record. */
function applyV2(d) {
  if (!d.labs.some(l => l.date === V2_DATE)) d.labs.push(cleanLab(V2_LAB));
  if (!d.inbody.some(s => s.date === V2_DATE)) d.inbody.push(cleanInbody(V2_INBODY));
  const v1 = new Set(SEED_TRACKED);
  const own = (Array.isArray(d.tracked) ? d.tracked : []).filter(k => !v1.has(k) && !V2_TRACKED.includes(k));
  d.tracked = [...V2_TRACKED, ...own];
  for (const raw of V2_GOALS) {
    const at = d.goals.findIndex(g => g.id === raw.id);
    const g = cleanGoal(at >= 0 && d.goals[at].achieved ? { ...raw, achieved: d.goals[at].achieved } : raw);
    if (at >= 0) d.goals[at] = g; else d.goals.push(g);
  }
  const vd = d.goals.findIndex(g => g.id === V2_VITD_GOAL.id || g.key === V2_VITD_GOAL.key);
  if (vd >= 0) d.goals[vd] = { ...d.goals[vd], achieved: d.goals[vd].achieved || { ...V2_VITD_ACHIEVED } };
  else d.goals.push(cleanGoal({ ...V2_VITD_GOAL, achieved: V2_VITD_ACHIEVED }));
  const tests = Array.isArray(d.tests) ? d.tests : [];
  for (const raw of V2_TESTS) if (!tests.some(x => x.id === raw.id)) tests.push(cleanTest(raw));
  d.tests = tests;
  return d;
}

/** Bring a record up to SEED_VERSION. True when it changed (and needs saving). */
export function migrateMedical(d) {
  const v = Number.isInteger(d.seedV) ? d.seedV : 1;
  if (v >= SEED_VERSION) return false;
  if (v < 2) applyV2(d);
  d.seedV = SEED_VERSION;
  return true;
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function createMedicalStore({ dir, now = Date.now }) {
  const fileOf = uid => path.join(dir, 'u-' + safeUid(uid) + '.json');
  const cache = new Map();

  function write(uid, d) {
    d.updatedAt = now();
    fs.mkdirSync(dir, { recursive: true });
    atomicWrite(fileOf(uid), JSON.stringify(d), 0o600);
    cache.set(uid, d);
    return d;
  }
  function load(uid) {
    if (!safeUid(uid)) bad('no profile', 'uid');
    if (cache.has(uid)) return cache.get(uid);
    let d;
    try { d = JSON.parse(fs.readFileSync(fileOf(uid), 'utf8')); }
    catch (e) {
      // Only a missing file seeds. An unreadable one is not replaced: that would lose the record.
      if (e.code !== 'ENOENT') { console.error('medical: cannot read', safeUid(uid), e.message); throw Object.assign(new Error('medical record unreadable'), { status: 500 }); }
      const fresh = seedDoc(now());
      migrateMedical(fresh);
      return write(uid, fresh);
    }
    d = { v: 1, profile: null, tracked: [], labs: [], inbody: [], goals: [], tests: [], ...d };
    if (migrateMedical(d)) return write(uid, d);
    cache.set(uid, d);
    return d;
  }
  const view = d => ({ ...d, labs: [...d.labs].sort(byDate), inbody: [...d.inbody].sort(byDate) });

  function upsert(uid, list, item, max) {
    const d = structuredClone(load(uid));
    const at = d[list].findIndex(x => x.id === item.id);
    if (at >= 0) d[list][at] = item;
    else {
      if (d[list].length >= max) bad(`at most ${max} entries`, 'too-many');
      d[list].push(item);
    }
    return view(write(uid, d));
  }
  function remove(uid, list, itemId) {
    const d = structuredClone(load(uid));
    const before = d[list].length;
    d[list] = d[list].filter(x => x.id !== itemId);
    if (d[list].length === before) throw Object.assign(new Error('no such entry'), { status: 404, code: 'missing' });
    return view(write(uid, d));
  }

  return {
    get: uid => view(load(uid)),
    // An edit keeps the report file attached to the result (files.js); only its own routes change it.
    saveLab(uid, raw) {
      const lab = cleanLab(raw);
      const before = load(uid).labs.find(x => x.id === lab.id);
      return upsert(uid, 'labs', before?.file ? { ...lab, file: before.file } : lab, LIMITS.labs);
    },
    /** One lab result of this profile, or null. */
    lab: (uid, itemId) => load(uid).labs.find(x => x.id === itemId) || null,
    /** Attach a report file to a lab result (null takes it off). Returns { doc, old }: old is the file it replaces. */
    setLabFile(uid, itemId, file) {
      const d = structuredClone(load(uid));
      const lab = d.labs.find(x => x.id === itemId);
      if (!lab) throw Object.assign(new Error('no such entry'), { status: 404, code: 'missing' });
      const old = lab.file || null;
      if (file) lab.file = file; else delete lab.file;
      return { doc: view(write(uid, d)), old };
    },
    deleteLab: (uid, itemId) => remove(uid, 'labs', itemId),
    saveInbody: (uid, raw) => upsert(uid, 'inbody', cleanInbody(raw), LIMITS.inbody),
    deleteInbody: (uid, itemId) => remove(uid, 'inbody', itemId),
    saveGoal: (uid, raw) => upsert(uid, 'goals', cleanGoal(raw), LIMITS.goals),
    deleteGoal: (uid, itemId) => remove(uid, 'goals', itemId),
    /** Tick a test done on `on` (YYYY-MM-DD), or take the tick off (done false). */
    setTestDone(uid, itemId, done, on) {
      const d = structuredClone(load(uid));
      const item = (d.tests || []).find(x => x.id === itemId);
      if (!item) throw Object.assign(new Error('no such entry'), { status: 404, code: 'missing' });
      if (done) item.done = on ? day(on) : new Date(now()).toISOString().slice(0, 10);
      else delete item.done;
      return view(write(uid, d));
    },
    setTracked(uid, keys) {
      const d = structuredClone(load(uid));
      d.tracked = [...new Set((Array.isArray(keys) ? keys : []).map(k => keyOf(k, '')).filter(Boolean))].slice(0, 40);
      return view(write(uid, d));
    },
    removeUser(uid) { cache.delete(uid); try { fs.unlinkSync(fileOf(uid)); } catch { /* none */ } },
  };
}
