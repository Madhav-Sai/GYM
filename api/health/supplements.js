/* Supplements (our addition): the owner's list and a per-day log of taken / skipped. Which days a
 * supplement is due, the vitamin D3 loading phase and the 30-day adherence are the app's to work out
 * (frontend/src/lib/supplements.js, d3-phase.js); the server keeps the list and the log honest. */
import crypto from 'node:crypto';

export const SCHEDULES = ['daily', 'weekly', 'phase'];
export const MAX_SUPPLEMENTS = 40;
const bad = (message, code = 'invalid') => Object.assign(new Error(message), { status: 400, code });
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const hhmm = v => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const isoDay = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The owner's supplements, as on 2026-11-08. `today` is the first day adherence counts from. */
export function seedSupplements(today) {
  const base = { active: true, createdDay: today };
  return [
    { ...base, id: 'd3', name: 'Uprise-D3 60K', dose: '1 capsule (60,000 IU)', timing: 'Sunday, after dinner',
      schedule: { kind: 'phase', start: '2026-09-06', weeklyDoses: 8, everyDays: 28, dow: 0 }, requiresFat: true, remind: '20:30',
      warning: 'Never double-dose to catch up. Serum calcium was 9.8 (upper normal).' },
    { ...base, id: 'omega3', name: 'Tata 1mg Triple Strength Omega 3', dose: '1 capsule (560 mg EPA + 400 mg DHA)', timing: 'With a fat-containing meal',
      schedule: { kind: 'daily' }, requiresFat: true, remind: '10:15',
      warning: 'Milk alone is not enough fat.' },
    { ...base, id: 'isabgol', name: 'Isabgol', dose: '1 tsp in a full glass of water', timing: 'Night',
      schedule: { kind: 'daily' }, requiresFat: false, remind: '23:45',
      warning: 'Keep a 2 hour gap from other medication.' },
    { ...base, id: 'whey', name: 'Whey protein AS-IT-IS ONE', dose: '1 scoop', timing: 'Post-gym and bedtime',
      schedule: { kind: 'daily' }, requiresFat: false, remind: null,
      doseByDayType: { training: '2 scoops (post-gym + bedtime)', cardio: '1 scoop', rest: '1 scoop' } },
    { ...base, id: 'magnesium', name: 'Magnesium glycinate (Tata 1mg Advanced)', dose: '1 tablet (about 220 mg)', timing: '30 to 60 min before bed',
      schedule: { kind: 'daily' }, requiresFat: false, remind: '00:45', note: 'For sleep consistency.' },
  ];
}

/** A supplement as the app sent it, checked. `prev` is the one it edits, if any. */
export function sanitiseSupplement(s, prev, today) {
  if (!s || typeof s !== 'object') throw bad('supplement missing');
  const name = str(s.name, 80) || prev?.name;
  if (!name) throw bad('supplement needs a name');
  const sch = s.schedule || prev?.schedule || { kind: 'daily' };
  if (!SCHEDULES.includes(sch.kind)) throw bad('schedule must be daily, weekly or phase');
  let schedule = { kind: sch.kind };
  if (sch.kind === 'weekly' || sch.kind === 'phase') {
    const dow = Number.isInteger(sch.dow) && sch.dow >= 0 && sch.dow <= 6 ? sch.dow : 0;
    schedule.dow = dow;
  }
  if (sch.kind === 'phase') {
    const start = isoDay(sch.start);
    if (!start) throw bad('a phase needs a start day');
    const weeklyDoses = Number.isInteger(sch.weeklyDoses) && sch.weeklyDoses >= 0 && sch.weeklyDoses <= 52 ? sch.weeklyDoses : 8;
    const everyDays = Number.isInteger(sch.everyDays) && sch.everyDays >= 7 && sch.everyDays <= 90 ? sch.everyDays : 28;
    schedule = { ...schedule, start, weeklyDoses, everyDays };
  }
  const out = {
    id: prev?.id || 's' + crypto.randomBytes(5).toString('hex'),
    name,
    dose: str(s.dose ?? prev?.dose, 80),
    timing: str(s.timing ?? prev?.timing, 80),
    schedule,
    requiresFat: s.requiresFat !== undefined ? !!s.requiresFat : !!prev?.requiresFat,
    remind: s.remind !== undefined ? hhmm(s.remind) : (prev?.remind ?? null),
    active: s.active !== undefined ? !!s.active : prev ? prev.active !== false : true,
    createdDay: prev?.createdDay || today,
  };
  const warning = str(s.warning ?? prev?.warning, 200); if (warning) out.warning = warning;
  const note = str(s.note ?? prev?.note, 200); if (note) out.note = note;
  const byType = s.doseByDayType ?? prev?.doseByDayType;
  if (byType && typeof byType === 'object') {
    const o = {};
    for (const k of ['training', 'cardio', 'rest']) if (str(byType[k], 80)) o[k] = str(byType[k], 80);
    if (Object.keys(o).length) out.doseByDayType = o;
  }
  return out;
}

/** Add (no id) or edit (an id on the list) one supplement. Deactivate with active: false. */
export function saveSupplement(doc, s, today) {
  const list = doc.supplements.list || [];
  const i = typeof s?.id === 'string' ? list.findIndex(x => x.id === s.id) : -1;
  if (s?.id && i < 0) throw Object.assign(new Error('no such supplement'), { status: 404, code: 'missing' });
  if (i < 0 && list.length >= MAX_SUPPLEMENTS) throw bad('too many supplements', 'too-many');
  const next = sanitiseSupplement(s, i >= 0 ? list[i] : null, today);
  if (i >= 0) list[i] = next; else list.push(next);
  doc.supplements.list = list;
  return next;
}

/** Taken, skipped (with a reason) or cleared (status null) for one supplement on one day. */
export function markSupplement(doc, { day, id, status, reason }, at) {
  if (!(doc.supplements.list || []).some(x => x.id === id)) throw Object.assign(new Error('no such supplement'), { status: 404, code: 'missing' });
  if (status !== null && status !== 'taken' && status !== 'skipped') throw bad('status must be taken, skipped or null');
  const log = doc.supplements.log;
  const dayLog = { ...(log[day] || {}) };
  if (status === null) delete dayLog[id];
  else dayLog[id] = { status, at, ...(status === 'skipped' && str(reason, 120) ? { reason: str(reason, 120) } : {}) };
  if (Object.keys(dayLog).length) log[day] = dayLog; else delete log[day];
  return dayLog[id] || null;
}
