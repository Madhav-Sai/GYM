/* What Whoop told us, per profile: DATA_DIR/whoop/u-<uid>.json, written temp-then-rename like every
 * other file here. Kept apart from the profile's own state (which syncs to every device and rides in
 * every backup) and from the connection record (which holds the sealed tokens). Only fields the app
 * shows are kept, and anything older than KEEP_DAYS is dropped on every save.
 *
 * Nothing here ever invents a number: a value Whoop did not send is null and the app draws a dash. */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';
import { localDay, offsetMin } from './providers/whoop.js';

export const KEEP_DAYS = 400;
// How far back the summary lists workouts, and at most how many.
export const WORKOUT_DAYS = 90;
export const WORKOUT_MAX = 500;
const DAY = 86400_000;

// Spec 5.2: recovery guidance bands, the heart-rate ceiling, and the weekly zone 4-5 budget.
export const HR_CEILING = 175;
export const ZONE45_TARGET = [20, 25];
export const ZONE45_WARN = 30;

export function recoveryBand(score) {
  if (score == null) return null;
  if (score >= 67) return { band: 'green', text: 'Green. Push for a PR today.' };
  if (score >= 34) return { band: 'yellow', text: 'Yellow. Hit targets, do not force new weight.' };
  return { band: 'red', text: "Red. Drop to last week's weight or make it a cardio day." };
}

const safeUid = uid => String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
const blank = () => ({ v: 1, cycles: {}, recovery: {}, sleep: {}, workouts: {}, profile: null, body: null, syncedAt: null, lastStart: null });

export function createWhoopData({ dir, now = Date.now }) {
  const fileOf = uid => path.join(dir, 'u-' + safeUid(uid) + '.json');
  const cache = new Map();

  function load(uid) {
    if (cache.has(uid)) return cache.get(uid);
    let d = blank();
    try { d = { ...blank(), ...JSON.parse(fs.readFileSync(fileOf(uid), 'utf8')) }; }
    catch (e) { if (e.code !== 'ENOENT') console.error('whoop: cannot read data of', safeUid(uid), e.message); }
    cache.set(uid, d);
    return d;
  }
  function save(uid, d) {
    const cutoff = now() - KEEP_DAYS * DAY;
    const keep = (o, t) => Object.fromEntries(Object.entries(o).filter(([, r]) => !(Date.parse(t(r)) < cutoff)));
    d.cycles = keep(d.cycles, r => r.start);
    d.sleep = keep(d.sleep, r => r.start);
    d.workouts = keep(d.workouts, r => r.start);
    const live = new Set(Object.keys(d.cycles));
    d.recovery = Object.fromEntries(Object.entries(d.recovery).filter(([id]) => live.has(id)));
    fs.mkdirSync(dir, { recursive: true });
    atomicWrite(fileOf(uid), JSON.stringify(d), 0o600);
    cache.set(uid, d);
  }

  return {
    syncedAt: uid => load(uid).syncedAt,
    lastStart: uid => load(uid).lastStart,

    /** Merge one pull. Records are keyed by Whoop's id, so a re-pull (scores arrive late) overwrites. */
    upsert(uid, { cycles = [], recovery = [], sleep = [], workouts = [], profile, body } = {}) {
      const d = structuredClone(load(uid));
      for (const c of cycles) d.cycles[c.id] = c;
      for (const r of recovery) d.recovery[r.cycleId] = r;
      for (const s of sleep) d.sleep[s.id] = s;
      for (const w of workouts) d.workouts[w.id] = w;
      if (profile) d.profile = profile;
      if (body) d.body = body;
      d.syncedAt = now();
      // The next pull starts a little before this one's newest record so late scores are caught.
      const newest = Object.values(d.cycles).map(c => Date.parse(c.start)).filter(Number.isFinite);
      d.lastStart = newest.length ? new Date(Math.max(...newest)).toISOString() : d.lastStart;
      save(uid, d);
      return { cycles: cycles.length, recovery: recovery.length, sleep: sleep.length, workouts: workouts.length };
    },

    clear(uid) { cache.delete(uid); try { fs.unlinkSync(fileOf(uid)); } catch { /* none */ } },

    /** Everything the Whoop screens and the Home card draw, from what is stored. */
    summary(uid, nowMs = now()) {
      const d = load(uid);
      const cycles = Object.values(d.cycles).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
      const base = { synced: d.syncedAt != null, syncedAt: d.syncedAt, profile: d.profile, body: d.body };
      if (!cycles.length) return { ...base, today: null, days: [], workouts: [], zone45: null, hrFlags: [], steps: null };

      const recOf = c => d.recovery[c.id] || null;
      const sleeps = Object.values(d.sleep).filter(s => !s.nap).sort((a, b) => Date.parse(b.end) - Date.parse(a.end));
      const sleepOf = c => sleeps.find(s => s.cycleId === c.id) || null;

      // "Today" is the newest cycle. Its recovery is the newest SCORED one, so a pending score on a
      // brand-new cycle shows yesterday's, labelled with its own day, never a blank pretending to be 0.
      const latest = cycles[0];
      const scored = cycles.map(c => ({ c, r: recOf(c) })).find(x => x.r && x.r.score != null);
      const rec = scored ? { ...scored.r, day: scored.c.day } : null;
      const sl = sleeps[0] ? { ...sleeps[0], day: (cycles.find(c => c.id === sleeps[0].cycleId) || latest).day } : null;
      const today = {
        day: latest.day,
        recovery: rec, guidance: recoveryBand(rec?.score ?? null),
        sleep: sl,
        cycle: { strain: latest.strain, kj: latest.kj, kcal: latest.kj != null ? Math.round(latest.kj / 4.184) : null, avgHr: latest.avgHr, maxHr: latest.maxHr, steps: latest.steps, state: latest.state, start: latest.start, end: latest.end },
      };

      // Up to 90 days, oldest first, every field Whoop scores (null where it sent none).
      const days = cycles.slice(0, 90).map(c => {
        const r = recOf(c), s = sleepOf(c);
        return {
          day: c.day, recovery: r?.score ?? null, hrv: r?.hrv ?? null, rhr: r?.rhr ?? null, spo2: r?.spo2 ?? null, skinTemp: r?.skinTemp ?? null,
          strain: c.strain, kj: c.kj, avgHr: c.avgHr, maxHr: c.maxHr, steps: c.steps,
          sleepMin: s?.asleepMin ?? null, inBedMin: s?.inBedMin ?? null, neededMin: s?.neededMin ?? null, debtMin: s?.debtMin ?? null,
          lightMin: s?.lightMin ?? null, deepMin: s?.deepMin ?? null, remMin: s?.remMin ?? null, awakeMin: s?.awakeMin ?? null,
          performance: s?.performance ?? null, efficiency: s?.efficiency ?? null, consistency: s?.consistency ?? null,
          respRate: s?.respRate ?? null, disturbances: s?.disturbances ?? null,
          // When the night began and ended, for the bedtime and wake consistency dots.
          sleepStart: s?.start ?? null, sleepEnd: s?.end ?? null,
        };
      }).reverse();
      // Averages over the last 7 and 30 days (only days Whoop scored count).
      const avgOf = (n, k) => { const v = days.slice(-n).map(x => x[k]).filter(x => typeof x === 'number' && Number.isFinite(x)); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
      const avg = {};
      for (const k of ['recovery', 'hrv', 'rhr', 'strain', 'sleepMin', 'steps', 'performance', 'respRate', 'spo2', 'skinTemp', 'kj']) avg[k] = { d7: avgOf(7, k), d30: avgOf(30, k) };
      const naps = Object.values(d.sleep).filter(s => s.nap).sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).slice(0, 5);

      const workouts = Object.values(d.workouts).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

      // Zone 4-5 this week (Monday-based, in the zone of the newest cycle): target 20-25 min, warn above 30.
      const off = offsetMin(latest.tz);
      const todayLocal = localDay(nowMs, off);
      const dow = (new Date(todayLocal + 'T00:00:00Z').getUTCDay() + 6) % 7;
      const weekStart = localDay(Date.parse(todayLocal + 'T00:00:00Z') - dow * DAY, 0);
      const wk = workouts.filter(w => w.day >= weekStart);
      const known = wk.filter(w => w.zonesMin?.[4] != null && w.zonesMin?.[5] != null);
      const z45 = known.reduce((a, w) => a + w.zonesMin[4] + w.zonesMin[5], 0);
      const zone45 = {
        weekStart, minutes: z45, target: ZONE45_TARGET, warnAbove: ZONE45_WARN, workouts: wk.length,
        status: z45 > ZONE45_WARN ? 'over' : z45 > ZONE45_TARGET[1] ? 'high' : z45 >= ZONE45_TARGET[0] ? 'on-target' : 'building',
      };

      // Hard rule: never above 175 bpm. Anything that went over in the last 14 days is flagged.
      const since = localDay(nowMs - 14 * DAY, off);
      const hrFlags = workouts.filter(w => w.day >= since && w.maxHr != null && w.maxHr > HR_CEILING)
        .map(w => ({ day: w.day, sport: w.sport, maxHr: w.maxHr, ceiling: HR_CEILING }));

      return {
        ...base, today, days, avg, naps, zone45, hrFlags,
        // The last 90 days of workouts, newest first (capped, should a strap log hundreds): the app
        // adds them to History (frontend lib/whoop-import.js) and matches logged sessions to them.
        workouts: workouts.filter(w => !(Date.parse(w.start) < nowMs - WORKOUT_DAYS * DAY)).slice(0, WORKOUT_MAX),
        // Steps, labelled with where they came from. null when Whoop did not send one: a dash, not 0.
        steps: { value: latest.steps, day: latest.day, source: 'whoop' },
      };
    },
  };
}
