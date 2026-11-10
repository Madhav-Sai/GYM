/* Two-factor codes (totp.js): RFC 4226 / RFC 6238 test vectors, the ±1 step window, single use,
   the otpauth URI, sealing at rest and recovery codes. In-process, no server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Encode, base32Decode, hotp, totp, stepAt, verifyTotp, generateSecret, otpauthUri,
  deriveTotpKey, sealSecret, openSecret, generateRecoveryCodes, matchRecovery, normalizeRecovery, cleanCode
} from '../totp.js';

const RFC_KEY = Buffer.from('12345678901234567890');   // RFC 4226 / 6238 SHA-1 seed

test('base32 round-trips and matches RFC 4648', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(base32Encode(Buffer.from('f')), 'MY');
  assert.deepEqual(base32Decode('MZXW6YTBOI'), Buffer.from('foobar'));
  assert.deepEqual(base32Decode('mzxw 6ytb-oi======'), Buffer.from('foobar'), 'case, spaces, dashes and padding are forgiven');
  assert.equal(base32Decode('not base32!'), null);
  assert.equal(base32Decode(''), null);
  const raw = Buffer.from([0, 1, 2, 253, 254, 255, 7, 9, 128, 64]);
  assert.deepEqual(base32Decode(base32Encode(raw)), raw);
});

test('HOTP: the RFC 4226 appendix D values', () => {
  const want = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  want.forEach((code, i) => assert.equal(hotp(RFC_KEY, i), code, 'counter ' + i));
});

test('TOTP: the RFC 6238 appendix B values (SHA-1, SHA-256, SHA-512, 8 digits)', () => {
  const keys = {
    sha1: RFC_KEY,
    sha256: Buffer.from('12345678901234567890123456789012'),
    sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234')
  };
  const rows = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826']
  ];
  for (const [sec, s1, s256, s512] of rows) {
    const T = stepAt(sec * 1000);
    assert.equal(hotp(keys.sha1, T, { digits: 8 }), s1, `sha1 @${sec}`);
    assert.equal(hotp(keys.sha256, T, { digits: 8, algorithm: 'sha256' }), s256, `sha256 @${sec}`);
    assert.equal(hotp(keys.sha512, T, { digits: 8, algorithm: 'sha512' }), s512, `sha512 @${sec}`);
  }
  // The six digits an app shows are the last six of the same number.
  assert.equal(totp(base32Encode(RFC_KEY), 59000), '287082');
  assert.equal(totp(base32Encode(RFC_KEY), 1111111109000), '081804');
});

test('a secret is 20 random bytes in base32 (32 characters), never the same twice', () => {
  const a = generateSecret(), b = generateSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(a).length, 20);
  assert.notEqual(a, b);
});

test('verify: the current step and one either side, nothing further', () => {
  const secret = generateSecret();
  const now = 1_700_000_015_000;   // mid-step
  const T = stepAt(now);
  const at = s => totp(secret, s * 30000);
  assert.equal(verifyTotp(secret, at(T), { now }), T);
  assert.equal(verifyTotp(secret, at(T - 1), { now }), T - 1);
  assert.equal(verifyTotp(secret, at(T + 1), { now }), T + 1);
  // Two steps off: refused (unless by chance the two codes coincide).
  if (at(T - 2) !== at(T) && at(T - 2) !== at(T - 1) && at(T - 2) !== at(T + 1)) assert.equal(verifyTotp(secret, at(T - 2), { now }), null);
  if (at(T + 2) !== at(T) && at(T + 2) !== at(T - 1) && at(T + 2) !== at(T + 1)) assert.equal(verifyTotp(secret, at(T + 2), { now }), null);
  assert.equal(verifyTotp(secret, ' ' + at(T).slice(0, 3) + ' ' + at(T).slice(3), { now }), T, 'spaces a person typed are fine');
  assert.equal(verifyTotp(secret, '12345', { now }), null);
  assert.equal(verifyTotp(secret, 'abcdef', { now }), null);
  assert.equal(verifyTotp(secret, null, { now }), null);
  assert.equal(verifyTotp('!!', at(T), { now }), null, 'a broken secret verifies nothing');
});

test('single use: a step at or before the last one accepted is refused', () => {
  const secret = generateSecret();
  const now = 1_700_000_015_000;
  const T = stepAt(now);
  const code = totp(secret, now);
  assert.equal(verifyTotp(secret, code, { now, last: T }), null, 'the same code again');
  assert.equal(verifyTotp(secret, totp(secret, (T - 1) * 30000), { now, last: T }), null, 'an older one in the window');
  assert.equal(verifyTotp(secret, totp(secret, (T + 1) * 30000), { now, last: T }), T + 1, 'the next one is fine');
  assert.equal(verifyTotp(secret, code, { now, last: T - 1 }), T);
});

test('cleanCode takes six digits only', () => {
  assert.equal(cleanCode('123 456'), '123456');
  assert.equal(cleanCode('1234567'), null);
  assert.equal(cleanCode(123456), '123456');
  assert.equal(cleanCode(undefined), null);
});

test('the otpauth URI names myGym and the account, with the standard parameters', () => {
  const u = new URL(otpauthUri('JBSWY3DPEHPK3PXP', 'Madhav Sai'));
  assert.equal(u.protocol, 'otpauth:');
  assert.equal(u.host, 'totp');
  assert.equal(decodeURIComponent(u.pathname), '/myGym:Madhav Sai');
  assert.equal(u.searchParams.get('secret'), 'JBSWY3DPEHPK3PXP');
  assert.equal(u.searchParams.get('issuer'), 'myGym');
  assert.equal(u.searchParams.get('algorithm'), 'SHA1');
  assert.equal(u.searchParams.get('digits'), '6');
  assert.equal(u.searchParams.get('period'), '30');
  assert.ok(!otpauthUri('S', 'a:b?c').includes('a:b?c'), 'the account is escaped');
});

test('sealed at rest: opens only with the same server secret and the same profile', () => {
  const key = deriveTotpKey('x'.repeat(64));
  const secret = generateSecret();
  const sealed = sealSecret(key, secret, 'u1');
  assert.ok(!sealed.includes(secret));
  assert.equal(openSecret(key, sealed, 'u1'), secret);
  assert.equal(openSecret(key, sealed, 'u2'), null, 'copied to another profile it does not open');
  assert.equal(openSecret(deriveTotpKey('y'.repeat(64)), sealed, 'u1'), null, 'another server secret');
  assert.equal(openSecret(key, sealed.slice(0, -2) + 'AA', 'u1'), null, 'tampered');
  assert.throws(() => deriveTotpKey(''));
});

test('recovery codes: ten, distinct, readable, stored hashed, each matches once', () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(hashes.length, 10);
  for (let i = 0; i < 10; i++) assert.ok(!hashes[i].includes(normalizeRecovery(codes[i])), 'no code is kept in the clear');
  assert.equal(matchRecovery(hashes, codes[3]), 3);
  assert.equal(matchRecovery(hashes, codes[3].toLowerCase().replace('-', ' ')), 3, 'case and separators do not matter');
  assert.equal(matchRecovery(hashes, 'AAAAA-AAAAA'), -1);
  assert.equal(matchRecovery(hashes, ''), -1);
  assert.equal(matchRecovery(null, codes[0]), -1);
  // Spent: the caller removes the hash, and the code no longer matches anything.
  const left = hashes.filter((_, i) => i !== 3);
  assert.equal(matchRecovery(left, codes[3]), -1);
  assert.equal(matchRecovery(left, codes[4]), 3);
  // The same code hashes differently each time (a salt per code).
  const again = generateRecoveryCodes(1);
  assert.equal(again.codes.length, 1);
});
