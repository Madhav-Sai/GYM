/* api/medical: the per-profile record of blood tests, InBody scans and goals. Seeded once on first
 * read, every value checked on the way in, and one profile never sees another's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMedicalStore, cleanLab, cleanInbody, cleanGoal } from '../medical/store.js';
import { medicalRoutes } from '../medical/routes.js';

const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-med-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('the first read seeds the owner record once, and an edit survives a fresh store', t => {
  const dir = tmp(t);
  const a = createMedicalStore({ dir });
  const doc = a.get('u_a');
  assert.equal(doc.profile.name, 'Madhav');
  assert.equal(doc.labs.length, 1);
  assert.equal(doc.labs[0].date, '2026-08-12');
  assert.equal(doc.labs[0].markers.find(m => m.key === 'vitd').flag, 'deficient');
  assert.equal(doc.inbody[0].segmental.ll.flag, 'under');
  assert.equal(doc.goals.length, 7);
  assert.ok(fs.existsSync(path.join(dir, 'u-u_a.json')));
  a.deleteLab('u_a', doc.labs[0].id);
  // A new process reading the same file: the deleted test stays deleted, nothing is re-seeded.
  const b = createMedicalStore({ dir });
  assert.equal(b.get('u_a').labs.length, 0);
  assert.equal(b.get('u_a').goals.length, 7);
});

test('labs: add, edit by id, sorted by date, delete', t => {
  const s = createMedicalStore({ dir: tmp(t) });
  let d = s.saveLab('u', { date: '2026-11-04', lab: 'Orange', markers: [{ key: 'vitd', name: 'Vitamin D', value: '24.5', unit: 'ng/mL', ref: { lo: 30, hi: 100 }, flag: 'low' }] });
  assert.equal(d.labs.length, 2);
  const added = d.labs.at(-1);
  assert.equal(added.markers[0].value, 24.5);
  d = s.saveLab('u', { ...added, lab: 'Orange Health Labs' });
  assert.equal(d.labs.length, 2);
  assert.equal(d.labs.at(-1).lab, 'Orange Health Labs');
  d = s.deleteLab('u', added.id);
  assert.equal(d.labs.length, 1);
  assert.throws(() => s.deleteLab('u', added.id), e => e.status === 404);
});

test('input is checked: a blank value is null, never 0, and nonsense is refused', () => {
  assert.throws(() => cleanLab({ date: '12/08/2026', markers: [{ name: 'X', value: 1 }] }), e => e.code === 'date');
  assert.throws(() => cleanLab({ date: '2026-08-12', markers: [{ name: 'X', value: '' }] }), e => e.code === 'markers');
  const lab = cleanLab({ date: '2026-08-12', markers: [{ name: 'Urine', text: 'All normal' }, { name: 'B12', value: 389, flag: 'weird' }] });
  assert.equal(lab.markers[0].value, null);
  assert.equal(lab.markers[1].key, 'b12');
  assert.equal(lab.markers[1].flag, null);
  const ib = cleanInbody({ date: '2026-10-02', weight: 72.9, bodyFatPct: '' });
  assert.equal(ib.bodyFatPct, null);
  assert.equal(ib.segmental.la.kg, null);
  assert.throws(() => cleanInbody({ date: '2026-10-02' }), e => e.code === 'empty');
  assert.throws(() => cleanGoal({ key: 'rm -rf', lo: 1, by: '2027-01-01' }), e => e.code === 'key');
  assert.throws(() => cleanGoal({ key: 'weight', by: '2027-01-01' }), e => e.code === 'target');
  assert.equal(cleanGoal({ key: 'weight', lo: 66, hi: 68, by: '2027-04-01' }).hi, 68);
});

test('routes: a session is required and each profile sees only its own file', async t => {
  const store = createMedicalStore({ dir: tmp(t) });
  const sent = [];
  const json = (res, code, body) => sent.push({ code, body });
  let who = null;
  const r = medicalRoutes({ json, readBody: async req => req.body, readSession: () => who, store });
  await r['GET /api/medical']({}, {});
  assert.equal(sent.pop().code, 401);
  who = { id: 'u_a' };
  await r['POST /api/medical/inbody/delete']({ body: { id: 'inbody-2026-10-02' } }, {});
  assert.equal(sent.pop().body.inbody.length, 0);
  who = { id: 'u_b' };
  await r['GET /api/medical']({}, {});
  assert.equal(sent.pop().body.inbody.length, 1, 'u_b has its own seeded record');
  await r['POST /api/medical/labs/save']({ body: { date: 'nope', markers: [{ name: 'B12', value: 1 }] } }, {});
  const bad = sent.pop();
  assert.equal(bad.code, 400);
  assert.equal(bad.body.code, 'date');
});
