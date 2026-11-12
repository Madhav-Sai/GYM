/* Lab report files (medical/files.js + routes): signed in only, the owner only, PDF/JPEG/PNG of up
 * to 10 MB checked by their first bytes, sent in pieces under the body limit, and no way out of the
 * profile's own folder. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMedicalStore } from '../medical/store.js';
import { createLabFiles, CHUNK_MAX, FILE_MAX, UPLOAD_IDLE_MS, cleanName, sniffOk } from '../medical/files.js';
import { medicalRoutes } from '../medical/routes.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20), Buffer.from('%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-medfiles-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'medical');
  let clock = Date.parse('2026-11-11T10:00:00Z');
  const store = createMedicalStore({ dir, now: () => clock });
  const files = createLabFiles({ dir: path.join(dir, 'files'), now: () => clock });
  let session = { id: 'u1' };
  const routes = medicalRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body,
    readSession: () => session,
    store, files,
  });
  const call = async (key, { url, body } = {}) => {
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(b) { this.raw = b; } };
    await routes[key]({ url: url || key.split(' ')[1], body }, res);
    return res;
  };
  const labId = store.get('u1').labs[0].id;
  return { call, setSession: s => { session = s; }, store, files, dir, labId, tick: ms => { clock += ms; } };
}
const up = (labId, buf, extra = {}) => ({ labId, type: 'application/pdf', name: 'Report Aug.pdf', data: buf.toString('base64'), ...extra });

test('not signed in: 401 on every file route', async t => {
  const { call, setSession, labId } = setup(t);
  setSession(null);
  assert.equal((await call('POST /api/medical/labs/file', { body: up(labId, PDF) })).status, 401);
  assert.equal((await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=x' })).status, 401);
  assert.equal((await call('POST /api/medical/labs/file/delete', { body: { labId } })).status, 401);
});

test('attach, read back with safe headers, replace, survive an edit, remove', async t => {
  const { call, store, files, labId, dir } = setup(t);
  let r = await call('POST /api/medical/labs/file', { body: up(labId, PDF) });
  assert.equal(r.status, 200);
  const f = r.body.file;
  assert.match(f.id, /^[a-f0-9]{24}\.pdf$/);
  assert.equal(r.body.labs.find(l => l.id === labId).file.id, f.id);
  assert.equal(f.size, PDF.length);
  const full = path.join(dir, 'files', 'u1', f.id);
  assert.ok(fs.existsSync(full));
  assert.equal(fs.statSync(full).mode & 0o777, 0o600);
  r = await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + f.id });
  assert.equal(r.status, 200);
  assert.ok(Buffer.compare(r.raw, PDF) === 0);
  assert.equal(r.headers['Content-Type'], 'application/pdf');
  assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(r.headers['Content-Disposition'], /^inline; filename="Report Aug\.pdf"/);
  // Editing the result keeps its file.
  const lab = store.get('u1').labs.find(l => l.id === labId);
  const { file, ...plain } = lab;
  assert.equal(store.saveLab('u1', { ...plain, lab: 'Other lab' }).labs.find(l => l.id === labId).file.id, f.id);
  // A new file replaces the old one, which is deleted.
  r = await call('POST /api/medical/labs/file', { body: up(labId, PNG, { type: 'image/png', name: 'scan.png' }) });
  assert.equal(r.status, 200);
  assert.equal(fs.existsSync(full), false);
  const png = r.body.file.id;
  r = await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + png });
  assert.equal(r.headers['Content-Type'], 'image/png');
  r = await call('POST /api/medical/labs/file/delete', { body: { labId } });
  assert.equal(r.status, 200);
  assert.equal(r.body.labs.find(l => l.id === labId).file, undefined);
  assert.equal(files.read('u1', png), null);
});

test('deleting the result deletes its file', async t => {
  const { call, files, labId } = setup(t);
  const id = (await call('POST /api/medical/labs/file', { body: up(labId, PDF) })).body.file.id;
  await call('POST /api/medical/labs/delete', { body: { id: labId } });
  assert.equal(files.read('u1', id), null);
});

test('owner only: another profile can neither read, attach to nor remove the file', async t => {
  const { call, setSession, store, dir } = setup(t);
  // A result of u1's own (the seeded ones carry the same ids in every profile).
  const labId = store.saveLab('u1', { date: '2026-11-01', markers: [{ name: 'B12', value: 300 }] }).labs.find(l => l.date === '2026-11-01').id;
  const id = (await call('POST /api/medical/labs/file', { body: up(labId, PDF) })).body.file.id;
  setSession({ id: 'u2' });
  assert.equal((await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + id })).status, 404);
  assert.equal((await call('POST /api/medical/labs/file', { body: up(labId, PDF) })).status, 404);
  assert.equal((await call('POST /api/medical/labs/file/delete', { body: { labId } })).status, 404);
  // Even a copy of the bytes in u2's folder is not served unless u2's own result names it.
  fs.mkdirSync(path.join(dir, 'files', 'u2'), { recursive: true });
  fs.copyFileSync(path.join(dir, 'files', 'u1', id), path.join(dir, 'files', 'u2', id));
  assert.equal((await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + id })).status, 404);
  setSession({ id: 'u1' });
  assert.equal((await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + id })).status, 200);
});

test('type and size limits: allow-list, magic bytes, 10 MB, base64 only', async t => {
  const { call, labId } = setup(t);
  const post = body => call('POST /api/medical/labs/file', { body });
  assert.equal((await post(up(labId, PDF, { type: 'text/html' }))).status, 415);
  assert.equal((await post(up(labId, PDF, { type: 'image/svg+xml' }))).status, 415);
  // An HTML page called a PDF is refused by its first bytes.
  const html = await post(up(labId, Buffer.from('<html><script>alert(1)</script></html>')));
  assert.equal(html.status, 400);
  assert.equal(html.body.code, 'type');
  assert.equal((await post(up(labId, PDF, { size: FILE_MAX + 1 }))).status, 413);
  assert.equal((await post({ ...up(labId, PDF), data: 'not base64!' })).status, 400);
  assert.equal((await post({ ...up(labId, PDF), data: 'A'.repeat(Math.ceil(CHUNK_MAX / 3) * 4 + 4) })).status, 400);
  assert.equal((await post(up('nope', PDF))).status, 404);
  assert.equal(sniffOk('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(sniffOk('image/png', PDF), false);
});

test('a large file in pieces: in order, checked whole, and an abandoned one expires', async t => {
  const { call, labId, files, tick, dir } = setup(t);
  const big = Buffer.concat([PDF, Buffer.alloc(CHUNK_MAX * 2 + 10, 0x41)]);
  const post = body => call('POST /api/medical/labs/file', { body });
  const piece = (o, n = CHUNK_MAX) => big.subarray(o, o + n).toString('base64');
  let r = await post({ labId, type: 'application/pdf', name: 'big.pdf', size: big.length, data: piece(0) });
  assert.equal(r.status, 200);
  const upload = r.body.upload;
  assert.equal(r.body.received, CHUNK_MAX);
  // A repeated or skipped piece is a 409, not a corrupted file.
  assert.equal((await post({ upload, offset: 0, data: piece(0) })).status, 409);
  r = await post({ upload, offset: CHUNK_MAX, data: piece(CHUNK_MAX) });
  assert.equal(r.body.received, CHUNK_MAX * 2);
  r = await post({ upload, offset: CHUNK_MAX * 2, data: piece(CHUNK_MAX * 2) });
  assert.equal(r.status, 200);
  assert.equal(r.body.file.size, big.length);
  assert.ok(Buffer.compare(files.read('u1', r.body.file.id), big) === 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'files', 'u1')).filter(n => n.endsWith('.partial')), []);
  // Another profile cannot continue someone's upload.
  r = await post({ labId, type: 'application/pdf', size: big.length, data: piece(0) });
  const second = r.body.upload;
  tick(UPLOAD_IDLE_MS + 1);
  assert.equal((await post({ upload: second, offset: CHUNK_MAX, data: piece(CHUNK_MAX) })).status, 404);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'files', 'u1')).filter(n => n.endsWith('.partial')), []);
});

test('traversal: ids that are not ours never reach the disk', async t => {
  const { call, files, dir } = setup(t);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'u-u1.json.bak'), 'secret');
  for (const id of ['../u-u1.json', '..%2Fu-u1.json', '/etc/passwd', 'aaaaaaaaaaaaaaaaaaaaaaaa.pdf/../../u-u1.json', 'x.pdf', '']) {
    const r = await call('GET /api/medical/labs/file', { url: '/api/medical/labs/file?id=' + encodeURIComponent(id) });
    assert.equal(r.status, 404, id);
    assert.equal(files.fileOf('u1', id), null, id);
  }
  assert.equal(files.fileOf('../u2', 'aaaaaaaaaaaaaaaaaaaaaaaa.pdf'), path.join(dir, 'files', 'u2', 'aaaaaaaaaaaaaaaaaaaaaaaa.pdf'));
  assert.equal(cleanName('../../etc/passwd"\r\n.pdf', 'application/pdf'), 'passwd.pdf');
  assert.equal(cleanName('', 'image/png'), 'report.png');
});

test('removeUser deletes the profile\'s whole files folder and nobody else\'s', async t => {
  const { call, setSession, files, dir, store } = setup(t);
  await call('POST /api/medical/labs/file', { body: up(store.get('u1').labs[0].id, PDF) });
  setSession({ id: 'u2' });
  await call('POST /api/medical/labs/file', { body: up(store.get('u2').labs[0].id, PDF) });
  files.removeUser('u1');
  assert.equal(fs.existsSync(path.join(dir, 'files', 'u1')), false);
  assert.equal(fs.readdirSync(path.join(dir, 'files', 'u2')).length, 1);
});
