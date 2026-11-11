/* Server backups (backups.js, our addition): what goes in, what stays out, rotation, the name
   check that stands between a download and the rest of the disk, and a full gzip round trip. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createBackups, readBackup, restoreBackup, isSkipped, backupName, BACKUP_NAME, DAY_MS } from '../backups.js';
import { createDataBrowser } from '../data-browser.js';

const silent = { log() {}, error() {} };

function dataDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-backups-'));
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'u1' }], creds: [{ publicKey: 'PK' }] }));
  fs.writeFileSync(path.join(dir, 'secret'), 'SESSION-SECRET', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'vapid.json'), JSON.stringify({ privateKey: 'VP' }));
  fs.writeFileSync(path.join(dir, 'state-u1.json'), JSON.stringify({ unit: 'kg', note: 'héllo ✓' }));
  fs.mkdirSync(path.join(dir, 'integrations'));
  fs.writeFileSync(path.join(dir, 'integrations', 'u-u1.json'), JSON.stringify({ sealed: 'TOKEN' }));
  fs.mkdirSync(path.join(dir, 'health'));
  fs.writeFileSync(path.join(dir, 'health', 'u1.json'), '{}');
  fs.mkdirSync(path.join(dir, 'uploads'));
  fs.writeFileSync(path.join(dir, 'uploads', 'abc.jpg'), Buffer.from([0xff, 0xd8, 0, 1, 2]));
  fs.writeFileSync(path.join(dir, 'state-u1.json.tmp'), 'half');
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 250, 251]));
  try { fs.symlinkSync(path.join(root, 'elsewhere'), path.join(dir, 'link.json')); } catch { /* no symlinks */ }
  return { root, dir };
}

test('a backup carries every data file, secrets included, and leaves out uploads, backups and temp files', async t => {
  const { dir } = dataDir(t);
  const b = createBackups({ dir, now: () => Date.parse('2026-11-11T10:00:00Z'), log: silent });
  const r = await b.run();
  assert.equal(r.name, 'backup-2026-11-11.json.gz');
  const doc = readBackup(fs.readFileSync(path.join(dir, 'backups', r.name)));
  const paths = doc.files.map(f => f.path);
  assert.deepEqual(paths, ['blob.bin', 'db.json', 'health/u1.json', 'integrations/u-u1.json', 'secret', 'state-u1.json', 'vapid.json']);
  assert.ok(!paths.some(p => p.startsWith('uploads/') || p.startsWith('backups/') || p.endsWith('.tmp') || p === 'link.json'));
  // A second backup does not contain the first.
  const r2 = await b.run();
  assert.ok(!readBackup(fs.readFileSync(path.join(dir, 'backups', r2.name))).files.some(f => f.path.startsWith('backups')));
});

test('the backup file and its folder are private to the server user', async t => {
  if (process.platform === 'win32') return;
  const { dir } = dataDir(t);
  const b = createBackups({ dir, log: silent });
  const r = await b.run();
  assert.equal(fs.statSync(path.join(dir, 'backups', r.name)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(dir, 'backups')).mode & 0o777, 0o700);
});

test('gzip round trip: restoring a backup gives back the same bytes and modes', async t => {
  const { root, dir } = dataDir(t);
  const b = createBackups({ dir, log: silent });
  const r = await b.run();
  const gz = fs.readFileSync(path.join(dir, 'backups', r.name));
  // It is plain gzip, readable without our code.
  assert.equal(JSON.parse(zlib.gunzipSync(gz).toString('utf8')).format, 'mygym-backup');
  const target = path.join(root, 'restored');
  const out = restoreBackup(gz, target);
  assert.equal(out.refused.length, 0);
  for (const rel of ['db.json', 'secret', 'state-u1.json', 'integrations/u-u1.json', 'blob.bin', 'vapid.json']) {
    assert.ok(fs.readFileSync(path.join(target, rel)).equals(fs.readFileSync(path.join(dir, rel))), rel);
  }
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(target, 'secret')).mode & 0o777, 0o600);
  assert.ok(!fs.existsSync(path.join(target, 'uploads')));
});

test('restore refuses entries that would leave the target folder', t => {
  const { root } = dataDir(t);
  const doc = {
    format: 'mygym-backup', version: 1, files: [
      { path: '../escaped.json', encoding: 'utf8', data: 'x' },
      { path: '/etc/evil', encoding: 'utf8', data: 'x' },
      { path: 'a/../../evil', encoding: 'utf8', data: 'x' },
      { path: 'backups/backup-2026-01-01.json.gz', encoding: 'utf8', data: 'x' },
      { path: 'ok.json', encoding: 'utf8', data: '{}' }
    ]
  };
  const target = path.join(root, 't');
  const r = restoreBackup(zlib.gzipSync(JSON.stringify(doc)), target);
  assert.deepEqual(r.written, ['ok.json']);
  assert.equal(r.refused.length, 4);
  assert.ok(!fs.existsSync(path.join(root, 'escaped.json')));
  assert.throws(() => restoreBackup(zlib.gzipSync('{"files":[]}'), target), /not a myGym backup/);
});

test('rotation keeps the newest `keep` backups', async t => {
  const { dir } = dataDir(t);
  let clock = Date.parse('2026-11-01T03:00:00Z');
  const b = createBackups({ dir, keep: 3, now: () => clock, log: silent });
  const made = [];
  for (let i = 0; i < 6; i++) { made.push((await b.run()).name); clock += DAY_MS; }
  assert.deepEqual(b.list().map(x => x.name), made.slice(-3).reverse());
  // A stray file in the folder is neither listed nor rotated away.
  fs.writeFileSync(path.join(dir, 'backups', 'notes.txt'), 'keep me');
  await b.run();
  assert.equal(b.list().length, 3);
  assert.ok(fs.existsSync(path.join(dir, 'backups', 'notes.txt')));
});

test('due: no backup, or the newest older than a day', async t => {
  const { dir } = dataDir(t);
  let clock = Date.now();
  const b = createBackups({ dir, now: () => clock, log: silent });
  assert.equal(b.due(), true);
  await b.run();
  assert.equal(b.due(), false);
  clock += DAY_MS + 1000;
  assert.equal(b.due(), true);
});

test('resolve takes only a backup name, never a path', async t => {
  const { dir } = dataDir(t);
  const b = createBackups({ dir, now: () => Date.parse('2026-11-11T10:00:00Z'), log: silent });
  await b.run();
  assert.equal(b.resolve('backup-2026-11-11.json.gz').name, 'backup-2026-11-11.json.gz');
  for (const bad of ['../db.json', '../secret', 'backup-2026-11-11.json.gz/../../secret', '/etc/passwd', 'backup-2026-11-11.json', '..%2Fdb.json', '', null, 'backup-2026-1-1.json.gz', 'backup-2026-11-11.json.gz\0']) {
    assert.throws(() => b.resolve(bad), e => e.status === 400, String(bad));
  }
  assert.throws(() => b.resolve('backup-2020-01-01.json.gz'), e => e.status === 404);
});

test('names and skip rules', () => {
  assert.equal(backupName(Date.parse('2026-03-04T23:59:00Z')), 'backup-2026-03-04.json.gz');
  assert.ok(BACKUP_NAME.test('backup-2026-03-04.json.gz'));
  for (const p of ['backups/x', 'uploads/a.jpg', 'db.json.tmp', '../x']) assert.equal(isSkipped(p), true, p);
  for (const p of ['db.json', 'secret', 'integrations/u.json', 'health/foods.json']) assert.equal(isSkipped(p), false, p);
});

test('the data browser never lists or reads the backups folder', async t => {
  const { dir } = dataDir(t);
  const b = createBackups({ dir, now: () => Date.parse('2026-11-11T10:00:00Z'), log: silent });
  await b.run();
  const browser = createDataBrowser({ dir });
  assert.ok(!browser.list().some(f => f.path.startsWith('backups')));
  assert.throws(() => browser.read('backups/backup-2026-11-11.json.gz'), e => e.status === 403);
  assert.ok(!Object.keys(browser.exportAll().files).some(p => p.startsWith('backups')));
});
