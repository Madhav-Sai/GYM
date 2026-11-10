/* Two-factor sign-in for the password login: time-based one-time codes (TOTP, RFC 6238) and
 * recovery codes. node:crypto only.
 *
 * The parameters are the ones every authenticator app understands without being told: HMAC-SHA1,
 * six digits, a 30 second step. A code is accepted one step either side of the server's clock
 * (a phone a little fast or slow, a code typed as it rolled over), and never twice: the caller
 * keeps the last step that signed in (`last`) and verifyTotp() refuses that step and every one
 * before it, so a code read over someone's shoulder is spent the moment it is used.
 *
 * The secret is 20 random bytes (160 bits, the size RFC 4226 recommends for SHA-1), handed to the
 * app as base32 inside an otpauth:// URI. At rest it is sealed (AES-256-GCM, integrations/crypto.js)
 * with a key derived from the server secret, bound to the profile it belongs to.
 *
 * Recovery codes are for a lost phone: ten of them, shown once, each good for one sign-in. They
 * are 50 random bits each, far past what a throttled guesser can reach, so a salted SHA-256 is
 * enough to keep them unreadable in db.json and keeps the check off the scrypt queue. */
import crypto from 'node:crypto';
import { seal, open } from './integrations/crypto.js';

export const ISSUER = 'myGym';
export const DIGITS = 6;
export const STEP_SEC = 30;
export const WINDOW = 1;
export const SECRET_BYTES = 20;
export const RECOVERY_COUNT = 10;

/* ---------- base32 (RFC 4648, no padding) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Bytes of a base32 string, spaces, dashes, padding and case forgiven; null when it is not base32. */
export function base32Decode(str) {
  const s = String(str || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!s) return null;
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ---------- HOTP / TOTP ---------- */

/** RFC 4226 HOTP of `counter` under the raw key `key`, as a zero-padded string. */
export function hotp(key, counter, { digits = DIGITS, algorithm = 'sha1' } = {}) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(msg).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The time step a moment falls in. */
export const stepAt = (now = Date.now(), step = STEP_SEC) => Math.floor(now / 1000 / step);

/** The code a base32 secret shows at `now` (ms). */
export function totp(secret, now = Date.now(), opts = {}) {
  const key = base32Decode(secret);
  if (!key) throw new Error('totp: secret is not base32');
  return hotp(key, stepAt(now, opts.step), opts);
}

/** Six digits, with any spaces a person typed between them taken out; null for anything else. */
export const cleanCode = code => {
  const s = String(code ?? '').replace(/\s/g, '');
  return /^\d{6}$/.test(s) ? s : null;
};

/**
 * The step `code` belongs to, within ±window of `now`, or null. A step at or before `last` (the
 * last one accepted for this secret) is refused even when the digits match: single use.
 */
export function verifyTotp(secret, code, { now = Date.now(), window = WINDOW, last = null } = {}) {
  const c = cleanCode(code);
  const key = base32Decode(secret);
  if (!c || !key) return null;
  const want = Buffer.from(c);
  const t = stepAt(now);
  let hit = null;
  // Every step in the window is computed and compared in constant time, so how long the answer
  // takes says nothing about which step (if any) matched.
  for (let s = t - window; s <= t + window; s++) {
    if (s < 0) continue;
    const got = Buffer.from(hotp(key, s));
    if (crypto.timingSafeEqual(got, want) && hit === null && (last == null || s > last)) hit = s;
  }
  return hit;
}

/* ---------- the secret and how an app is told about it ---------- */

export const generateSecret = () => base32Encode(crypto.randomBytes(SECRET_BYTES));

/** otpauth://totp/myGym:<name>?secret=…&issuer=myGym&algorithm=SHA1&digits=6&period=30 */
export function otpauthUri(secret, account, issuer = ISSUER) {
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(String(account || ''));
  const q = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SEC) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

/** The key that seals secrets at rest, from the server secret (never that key itself). */
export function deriveTotpKey(serverSecret) {
  if (!serverSecret || String(serverSecret).length < 16) throw new Error('totp: server secret missing');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(serverSecret)), Buffer.from('opengym-totp'), Buffer.from('totp secrets v1'), 32));
}
export const sealSecret = (key, secret, uid) => seal(key, secret, 'totp:' + uid);
/** The base32 secret, or null when it does not open (another server secret, another profile). */
export const openSecret = (key, sealed, uid) => open(key, sealed, 'totp:' + uid);

/* ---------- recovery codes ---------- */
// No 0/O/1/I/L: read off a screen or a sheet of paper.
const RC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RC_LEN = 10;

/** How a recovery code is compared: upper case, nothing but its letters and digits. */
export const normalizeRecovery = code => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);

function recoveryCode() {
  // Rejection sampling, so every character is equally likely.
  let s = '';
  while (s.length < RC_LEN) {
    for (const b of crypto.randomBytes(16)) {
      if (b < 248 && s.length < RC_LEN) s += RC_ALPHABET[b % RC_ALPHABET.length];
    }
  }
  return s.slice(0, 5) + '-' + s.slice(5);
}

export function hashRecovery(code, salt = crypto.randomBytes(12)) {
  const h = crypto.createHash('sha256').update(salt).update(normalizeRecovery(code)).digest();
  return salt.toString('base64url') + '$' + h.toString('base64url');
}

/** Ten fresh codes: `codes` to show once, `hashes` to keep. */
export function generateRecoveryCodes(n = RECOVERY_COUNT) {
  const codes = [];
  while (codes.length < n) {
    const c = recoveryCode();
    if (!codes.includes(c)) codes.push(c);
  }
  return { codes, hashes: codes.map(c => hashRecovery(c)) };
}

/** The index of the stored hash `code` matches, or -1. Every hash is checked. */
export function matchRecovery(hashes, code) {
  const n = normalizeRecovery(code);
  if (n.length !== RC_LEN || !Array.isArray(hashes)) return -1;
  let hit = -1;
  hashes.forEach((stored, i) => {
    const [salt, h] = String(stored).split('$');
    if (!salt || !h) return;
    const want = Buffer.from(h, 'base64url');
    const got = crypto.createHash('sha256').update(Buffer.from(salt, 'base64url')).update(n).digest();
    if (want.length === got.length && crypto.timingSafeEqual(want, got) && hit < 0) hit = i;
  });
  return hit;
}
