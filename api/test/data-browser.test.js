/* data-browser.js (our addition): what the admin data browser may show, and what it strips. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isExcluded, redact, sanitiseDb, createDataBrowser, REDACTED } from '../data-browser.js';

test('secret files and directories are excluded by path', () => {
  for (const p of ['secret', 'vapid.json', 'integrations/u-1.json', 'integrations', 'coach-auth-u1.json', 'push-token.json',
    'whoop/refresh_TOKEN.json', 'db.json.bak', 'db.json.unreadable-1', 'tls.key', '.health-1', 'a/../secret', 'x/.hidden/y.json', '']) {
    assert.equal(isExcluded(p), true, p);
  }
  for (const p of ['db.json', 'state-u1.json', 'health/u-u1.json', 'health/foods.json', 'medical/u-u1.json', 'audit.log', 'whoop/u-u1.json']) {
    assert.equal(isExcluded(p), false, p);
  }
});

test('redact drops every secret-looking field at any depth and keeps the rest', () => {
  const out = redact({ name: 'A', pw: 'h', password: 'p', totp: 's', totpPending: 's', nested: [{ accessToken: 't', refresh_token: 'r', apiKey: 'k', privateKey: 'k', keys: { auth: 'a' }, w: 80 }] });
  assert.equal(out.name, 'A');
  for (const k of ['pw', 'password', 'totp', 'totpPending']) assert.equal(out[k], REDACTED, k);
  const n = out.nested[0];
  for (const k of ['accessToken', 'refresh_token', 'apiKey', 'privateKey', 'keys']) assert.equal(n[k], REDACTED, k);
  assert.equal(n.w, 80);
});

test('sanitiseDb removes the passkeys and device links whole', () => {
  const out = sanitiseDb({ users: [{ id: 'u', name: 'N', pwReset: { hash: 'x' } }], creds: [{ publicKey: 'K' }], deviceLinks: [{ hash: 'h' }], invites: [{ code: 'C' }] });
  assert.equal(out.creds, REDACTED);
  assert.equal(out.deviceLinks, REDACTED);
  assert.equal(out.users[0].pwReset, REDACTED);
  assert.equal(out.invites[0].code, 'C');
});

test('resolve refuses traversal, absolute paths and symlinks out of the folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-db-'));
  const dir = path.join(root, 'data');
  fs.mkdirSync(path.join(dir, 'health'), { recursive: true });
  fs.writeFileSync(path.join(root, 'outside.json'), '{"leaked":true}');
  fs.writeFileSync(path.join(dir, 'health', 'u-1.json'), '{"v":1}');
  fs.writeFileSync(path.join(dir, 'audit.log'), '{"ev":"x"}\n');
  fs.writeFileSync(path.join(dir, 'bin.dat'), Buffer.from([1, 0, 2]));
  let linked = true;
  try { fs.symlinkSync(root, path.join(dir, 'up')); fs.symlinkSync(path.join(root, 'outside.json'), path.join(dir, 'x.json')); } catch { linked = false; }
  const b = createDataBrowser({ dir });
  assert.deepEqual(b.read('health/u-1.json').json, { v: 1 });
  assert.equal(b.read('./health//u-1.json').path, 'health/u-1.json');
  assert.equal(b.read('audit.log').kind, 'text');
  assert.throws(() => b.read('bin.dat'), e => e.status === 415);
  for (const p of ['../outside.json', 'health/../../outside.json', root + '/outside.json', 'C:/x', '..\\outside.json', 'a\0b', null, '']) {
    assert.throws(() => b.read(p), e => e.status >= 400 && e.status < 500, String(p));
  }
  if (linked) {
    assert.throws(() => b.read('up/outside.json'), e => e.status === 403 || e.status === 404);
    assert.throws(() => b.read('x.json'), e => e.status === 403);
    assert.ok(!b.list().some(f => f.path.startsWith('up/') || f.path === 'x.json'));
  }
  const ex = b.exportAll();
  assert.ok(!JSON.stringify(ex).includes('leaked'));
  assert.ok(ex.skipped.some(s => s.path === 'bin.dat'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('lab report files are listed by name and size, never read or exported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-db-'));
  const dir = path.join(root, 'data');
  const fdir = path.join(dir, 'medical', 'files', 'u1');
  fs.mkdirSync(fdir, { recursive: true });
  // A PDF with no NUL byte would otherwise pass the text check.
  fs.writeFileSync(path.join(fdir, 'aaaaaaaaaaaaaaaaaaaaaaaa.pdf'), '%PDF-1.7 Vitamin D 24.5 ng/mL');
  fs.writeFileSync(path.join(fdir, 'bbbbbbbbbbbbbbbbbbbbbbbb.partial'), '%PDF-half');
  const b = createDataBrowser({ dir });
  const listed = b.list().map(f => f.path);
  assert.deepEqual(listed, ['medical/files/u1/aaaaaaaaaaaaaaaaaaaaaaaa.pdf']);
  assert.throws(() => b.read('medical/files/u1/aaaaaaaaaaaaaaaaaaaaaaaa.pdf'), e => e.status === 403);
  const ex = b.exportAll();
  assert.ok(!JSON.stringify(ex.files).includes('Vitamin D'));
  assert.ok(ex.skipped.some(s => s.path === 'medical/files/u1/aaaaaaaaaaaaaaaaaaaaaaaa.pdf' && s.why === 'lab report file'));
  fs.rmSync(root, { recursive: true, force: true });
});
