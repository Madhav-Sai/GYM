/* web/10-resolver-auto.envsh (our addition): nginx's resolver from resolv.conf when RESOLVER_AUTO=1.
 * Run through a real sh, sourcing the file the way nginx's entrypoint does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', '10-resolver-auto.envsh');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-resolv-'));
const conf = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; };

function run(env, resolvConf) {
  const r = spawnSync('sh', ['-c', `. "${SCRIPT}"; printf %s "$RESOLVER"`], {
    env: { PATH: process.env.PATH, ...env, ...(resolvConf ? { RESOLV_CONF: resolvConf } : {}) }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('off by default: RESOLVER is whatever it was', () => {
  assert.equal(run({ RESOLVER: '127.0.0.11' }, conf('a', 'nameserver 10.0.0.2\n')), '127.0.0.11');
  assert.equal(run({}, conf('a2', 'nameserver 10.0.0.2\n')), '');
});

test('RESOLVER_AUTO=1 takes the nameserver from resolv.conf', () => {
  assert.equal(run({ RESOLVER_AUTO: '1', RESOLVER: '127.0.0.11' }, conf('b', '# comment\nsearch railway.internal\nnameserver 10.0.0.2\n')), '10.0.0.2');
});

test('an IPv6 nameserver gets the brackets nginx needs, and several are all kept', () => {
  assert.equal(run({ RESOLVER_AUTO: '1' }, conf('c', 'nameserver fd12::10\n')), '[fd12::10]');
  assert.equal(run({ RESOLVER_AUTO: '1' }, conf('d', 'nameserver 10.0.0.2\nnameserver fd12::10\nnameserver 1.1.1.1\n')), '10.0.0.2 [fd12::10] 1.1.1.1');
});

test('no nameserver, or no file: keeps what RESOLVER was and does not fail the container', () => {
  assert.equal(run({ RESOLVER_AUTO: '1', RESOLVER: '127.0.0.11' }, conf('e', 'search x\n')), '127.0.0.11');
  assert.equal(run({ RESOLVER_AUTO: '1', RESOLVER: '127.0.0.11' }, path.join(dir, 'missing')), '127.0.0.11');
});

test('the Dockerfile copies it next to the other entrypoint scripts', () => {
  const d = fs.readFileSync(path.join(path.dirname(SCRIPT), 'Dockerfile'), 'utf8');
  assert.match(d, /COPY --chmod=755 web\/10-resolver-auto\.envsh \/docker-entrypoint\.d\//);
});
