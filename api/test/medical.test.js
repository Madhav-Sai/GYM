/* api/medical: the per-profile record of blood tests, InBody scans and goals. Seeded once on first
 * read, every value checked on the way in, and one profile never sees another's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMedicalStore, cleanLab, cleanInbody, cleanGoal, cleanTest, migrateMedical } from '../medical/store.js';
import { seedDoc } from '../medical/seed.js';
import { medicalRoutes } from '../medical/routes.js';

const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-med-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('the first read seeds the owner record once, and an edit survives a fresh store', t => {
  const dir = tmp(t);
  const a = createMedicalStore({ dir });
  const doc = a.get('u_a');
  assert.equal(doc.profile.name, 'Madhav');
  assert.equal(doc.seedV, 2);
  assert.deepEqual(doc.labs.map(l => l.date), ['2026-08-12', '2026-11-11']);
  assert.equal(doc.labs[0].markers.find(m => m.key === 'vitd').flag, 'deficient');
  assert.equal(doc.inbody[0].segmental.ll.flag, 'under');
  assert.equal(doc.goals.length, 9);
  assert.ok(fs.existsSync(path.join(dir, 'u-u_a.json')));
  a.deleteLab('u_a', doc.labs[0].id);
  // A new process reading the same file: the deleted test stays deleted, nothing is re-seeded.
  const b = createMedicalStore({ dir });
  assert.equal(b.get('u_a').labs.length, 1);
  assert.equal(b.get('u_a').goals.length, 9);
});

test('labs: add, edit by id, sorted by date, delete', t => {
  const s = createMedicalStore({ dir: tmp(t) });
  let d = s.saveLab('u', { date: '2026-11-04', lab: 'Orange', markers: [{ key: 'vitd', name: 'Vitamin D', value: '24.5', unit: 'ng/mL', ref: { lo: 30, hi: 100 }, flag: 'low' }] });
  assert.equal(d.labs.length, 3);
  const added = d.labs[1];
  assert.equal(added.markers[0].value, 24.5);
  d = s.saveLab('u', { ...added, lab: 'Orange Health Labs' });
  assert.equal(d.labs.length, 3);
  assert.equal(d.labs[1].lab, 'Orange Health Labs');
  d = s.deleteLab('u', added.id);
  assert.equal(d.labs.length, 2);
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
  assert.equal(sent.pop().body.inbody.length, 1);
  who = { id: 'u_b' };
  await r['GET /api/medical']({}, {});
  assert.equal(sent.pop().body.inbody.length, 2, 'u_b has its own seeded record');
  await r['POST /api/medical/tests/done']({ body: { id: 't-cbc', day: '2026-12-10' } }, {});
  assert.equal(sent.pop().body.tests.find(x => x.id === 't-cbc').done, '2026-12-10');
  await r['POST /api/medical/tests/done']({ body: { id: 't-cbc', done: false } }, {});
  assert.equal(sent.pop().body.tests.find(x => x.id === 't-cbc').done, undefined);
  await r['POST /api/medical/tests/done']({ body: { id: 'nope' } }, {});
  assert.equal(sent.pop().code, 404);
  await r['POST /api/medical/labs/save']({ body: { date: 'nope', markers: [{ name: 'B12', value: 1 }] } }, {});
  const bad = sent.pop();
  assert.equal(bad.code, 400);
  assert.equal(bad.body.code, 'date');
});

/* Seed round 2 (seed-v2.js): reaches a record that already exists, once. */
const writeDoc = (dir, uid, doc) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'u-' + uid + '.json'), JSON.stringify(doc)); };

test('v2: an existing v1 record gets the new test, scan, goals and next tests, exactly once', t => {
  const dir = tmp(t);
  writeDoc(dir, 'u', seedDoc(1));
  const d = createMedicalStore({ dir }).get('u');
  assert.equal(d.seedV, 2);
  assert.deepEqual(d.labs.map(l => l.date), ['2026-08-12', '2026-11-11']);
  const lab = d.labs[1];
  assert.equal(lab.note, 'Fasted about 11 hours.');
  const mk = k => lab.markers.find(m => m.key === k);
  assert.equal(mk('tg').value, 215);
  assert.equal(mk('hdl').flag, 'low');
  assert.equal(mk('vitd').value, 52.9);
  assert.equal(mk('lymph').flag, 'high');
  assert.match(mk('lymph').note, /correlate clinically/);
  assert.equal(mk('urine_mucus').text, 'Present');
  // Same keys as the first test wherever it had the marker, so the trends line up.
  for (const m of d.labs[0].markers) assert.ok(mk(m.key), 'v2 has ' + m.key);
  assert.deepEqual(d.tracked, ['tg', 'hdl', 'vldl', 'ldl', 'nonhdl', 'chol_hdl', 'tchol', 'lymph', 'vitd']);
  const scan = d.inbody.at(-1);
  assert.equal(scan.date, '2026-11-11');
  assert.equal(scan.weight, 72.1);
  assert.equal(scan.smi, 7.4);
  assert.equal(scan.segmental.rl.flag, 'under');
  assert.equal(scan.segmental.rl.approx, true);
  assert.equal(scan.segmentalFat.trunk.kg, 11.8);
  assert.deepEqual(scan.targets, { weight: 65.1, weightControl: -7, fatControl: -11.9, muscleControl: 4.9 });
  const g = id => d.goals.find(x => x.id === id);
  assert.deepEqual(g('g-vitd').achieved, { date: '2026-11-11', value: 52.9 });
  assert.equal(g('g-tg').hi, 150);
  assert.equal(g('g-hdl').start, 27);
  assert.equal(g('g-vldl').hi, 30);
  assert.equal(g('g-weight').lo, 65);
  assert.equal(d.tests.length, 5);
  assert.equal(d.tests.find(x => x.prominent).id, 't-physician');
  // Read again, and by a fresh process: nothing is added twice.
  const again = createMedicalStore({ dir }).get('u');
  assert.equal(again.labs.length, 2);
  assert.equal(again.inbody.length, 2);
  assert.equal(again.goals.length, d.goals.length);
  assert.equal(again.tests.length, 5);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'u-u.json'), 'utf8')).seedV, 2);
});

test('v2: a test or scan he already entered on 2026-11-11 is left alone, and a tick and own markers stay', t => {
  const dir = tmp(t);
  const doc = seedDoc(1);
  doc.labs.push({ id: 'mine', date: '2026-11-11', lab: 'Typed in', markers: [{ key: 'tg', name: 'TG', panel: 'Lipid profile', value: 215, unit: 'mg/dL', ref: {}, flag: 'high' }] });
  doc.inbody.push({ id: 'my-scan', date: '2026-11-11', weight: 72.1 });
  doc.tracked = [...doc.tracked, 'b12'];
  doc.goals[0] = { ...doc.goals[0], achieved: { date: '2026-11-12', value: 53 } };
  writeDoc(dir, 'u', doc);
  const s = createMedicalStore({ dir });
  const d = s.get('u');
  assert.deepEqual(d.labs.filter(l => l.date === '2026-11-11').map(l => l.id), ['mine']);
  assert.deepEqual(d.inbody.filter(x => x.date === '2026-11-11').map(x => x.id), ['my-scan']);
  assert.ok(d.tracked.includes('b12'));
  assert.ok(!d.tracked.includes('ldl_hdl'));
  assert.deepEqual(d.goals.find(x => x.id === 'g-vitd').achieved, { date: '2026-11-12', value: 53 }, 'an achieved mark already there is kept');
  s.setTestDone('u', 't-lipid', true, '2027-01-02');
  assert.equal(createMedicalStore({ dir }).get('u').tests.find(x => x.id === 't-lipid').done, '2027-01-02');
});

test('v2: a record that never had the first seed still gets round 2', t => {
  const dir = tmp(t);
  writeDoc(dir, 'u', { v: 1, profile: null, tracked: [], labs: [], inbody: [], goals: [] });
  const d = createMedicalStore({ dir }).get('u');
  assert.equal(d.seedV, 2);
  assert.deepEqual(d.labs.map(l => l.date), ['2026-11-11']);
  assert.deepEqual(d.inbody.map(x => x.date), ['2026-11-11']);
  assert.deepEqual(d.goals.find(x => x.id === 'g-vitd').achieved, { date: '2026-11-11', value: 52.9 });
  assert.equal(d.goals.length, 9);
  assert.equal(d.tests.length, 5);
  // A record already at round 2 is not touched.
  const done = { seedV: 2, labs: [], inbody: [], goals: [], tracked: [] };
  assert.equal(migrateMedical(done), false);
  assert.equal(done.labs.length, 0);
});

test('goals keep a note and an achieved mark; tests are checked', () => {
  const g = cleanGoal({ key: 'lab:tg', hi: 150, by: '2026-12-31', note: 'x', achieved: { date: '2026-11-11', value: '52.9' } });
  assert.deepEqual(g.achieved, { date: '2026-11-11', value: 52.9 });
  assert.equal(cleanGoal({ key: 'lab:tg', hi: 150, by: '2026-12-31', achieved: { date: 'soon' } }).achieved, undefined);
  assert.throws(() => cleanTest({ title: '' }), e => e.code === 'title');
  assert.deepEqual(cleanTest({ id: 't', title: 'CBC', from: '2026-12-09', to: null }), { id: 't', title: 'CBC', from: '2026-12-09', to: null });
});
