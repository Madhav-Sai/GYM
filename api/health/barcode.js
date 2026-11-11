/* Barcode food lookup (our addition): GET /api/health/foods/barcode?code=... asks Open Food Facts
 * for a packaged food by its EAN/UPC and answers it in the app's food shape (frontend/src/lib/
 * diet-foods.js: values per 100 g). The phone never calls Open Food Facts itself: the request goes
 * through this server, so the app's CSP stays closed and the user's IP is not handed out per scan.
 *
 * The outbound call uses node's own https with the integrations' guarded lookup (net-guard.js
 * outboundLookup): never a private address, no redirects, gives up after TIMEOUT_MS and reads at
 * most READ_MAX bytes. Answers are cached in DATA_DIR/health/barcodes.json, "not found" too (for
 * NOT_FOUND_TTL, so a product added to Open Food Facts later is picked up); a network failure or a
 * timeout is never cached.
 *
 * A value Open Food Facts does not have stays null, never 0. */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../durable.js';
import { outboundLookup } from '../net-guard.js';

export const TIMEOUT_MS = 6000;
export const READ_MAX = 512 * 1024;
export const MAX_CACHED = 5000;
export const NOT_FOUND_TTL = 7 * 86400_000;
export const FOUND_TTL = 180 * 86400_000;
const FIELDS = 'product_name,brands,nutriments,serving_size,serving_quantity';

export const validCode = c => typeof c === 'string' && /^\d{8,14}$/.test(c);

let VERSION = 'dev';
try {
  VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version || 'dev';
} catch { /* the version is only for the User-Agent */ }
export const userAgent = (version = VERSION) => `myGym/${version} (self-hosted)`;

const r2 = v => Math.round(v * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
/** A nutriment value as a number in [0, max], else null (missing, text, negative or absurd). */
function val(n, key, max) {
  const raw = n?.[key];
  const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? r2(v) : null;
}

/**
 * An Open Food Facts product in the app's food shape, per 100 g. kcal falls back to the kJ value
 * when only that is given. `serving` is the label's serving in grams, when it says one.
 */
export function mapProduct(code, p) {
  const n = p?.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {};
  let kcal = val(n, 'energy-kcal_100g', 2000);
  if (kcal == null) { const kj = val(n, 'energy-kj_100g', 8400); if (kj != null) kcal = r2(kj / 4.184); }
  const brand = str(p?.brands, 60).split(',')[0].trim() || null;
  const name = str(p?.product_name, 80) || (brand ? brand : 'Barcode ' + code);
  const sq = typeof p?.serving_quantity === 'string' ? Number(p.serving_quantity) : p?.serving_quantity;
  const serving = typeof sq === 'number' && Number.isFinite(sq) && sq > 0 && sq <= 2000
    ? { g: r2(sq), label: str(p?.serving_size, 40) || `${r2(sq)} g` } : null;
  return {
    id: 'bc-' + code, code, name, brand, unit: 'g', per: 100,
    kcal,
    protein: val(n, 'proteins_100g', 100),
    carbs: val(n, 'carbohydrates_100g', 100),
    fat: val(n, 'fat_100g', 100),
    fiber: val(n, 'fiber_100g', 100),
    satFat: val(n, 'saturated-fat_100g', 100),
    omega3: null,
    serving,
    source: 'openfoodfacts',
  };
}

/** One GET by node's https with the guarded lookup, fetch-shaped enough for lookup(): { status, text() }. */
export function makeGuardedGet() {
  const agent = new https.Agent({ lookup: outboundLookup(), keepAlive: false });
  return (url, { headers = {}, signal } = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'https:') { reject(new Error('https only')); return; }
    const req = https.request(u, { method: 'GET', agent, headers }, res => {
      const chunks = [];
      let n = 0;
      res.on('data', d => { n += d.length; if (n > READ_MAX) { res.destroy(); reject(new Error('answer too large')); } else chunks.push(d); });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text: async () => body });
      });
      res.on('error', reject);
    });
    const abort = () => req.destroy(Object.assign(new Error('timed out'), { name: 'TimeoutError', code: 'ETIMEDOUT' }));
    if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
    req.on('error', reject);
    req.end();
  });
}

export function createBarcodeCache({ file, now = Date.now }) {
  let cache = null;
  function load() {
    if (cache) return cache;
    cache = {};
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw?.codes && typeof raw.codes === 'object' && !Array.isArray(raw.codes)) cache = raw.codes;
    } catch (e) { if (e.code !== 'ENOENT') console.error('barcodes: cannot read', e.message); }
    return cache;
  }
  return {
    /** { food } (food null for "not found"), or null when unknown or expired. */
    get(code) {
      const row = load()[code];
      if (!row || typeof row.at !== 'number') return null;
      const ttl = row.food ? FOUND_TTL : NOT_FOUND_TTL;
      if (now() - row.at > ttl) return null;
      return { food: row.food ? structuredClone(row.food) : null, at: row.at };
    },
    set(code, food) {
      const codes = { ...load(), [code]: { food: food || null, at: now() } };
      const keys = Object.keys(codes);
      if (keys.length > MAX_CACHED) {
        keys.sort((a, b) => codes[a].at - codes[b].at);
        for (const k of keys.slice(0, keys.length - MAX_CACHED)) delete codes[k];
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWrite(file, JSON.stringify({ v: 1, codes }), 0o600);
      cache = codes;
    },
  };
}

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

/**
 * The lookup the route uses: cache first, then Open Food Facts. Answers { food, cached } with food
 * null for "not found"; throws { status 502 or 504 } when Open Food Facts could not be asked.
 */
export function createBarcodeLookup({ cache, fetchImpl = null, timeoutMs = TIMEOUT_MS, version = VERSION, base = 'https://world.openfoodfacts.org' }) {
  let get = fetchImpl;
  return async function lookup(code) {
    if (!validCode(code)) throw fail(400, 'code must be 8 to 14 digits', 'code');
    const hit = cache.get(code);
    if (hit) return { food: hit.food, cached: true };
    get ||= makeGuardedGet();
    // A timer of our own rather than AbortSignal.timeout: it covers reading the body too.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), timeoutMs);
    let res, text = '';
    try {
      res = await get(`${base}/api/v2/product/${code}.json?fields=${FIELDS}`, {
        headers: { 'User-Agent': userAgent(version), Accept: 'application/json' },
        redirect: 'error',
        signal: ctl.signal,
      });
      text = await res.text();
    } catch (e) {
      if (ctl.signal.aborted || e?.name === 'TimeoutError' || e?.code === 'ETIMEDOUT') throw fail(504, 'Open Food Facts did not answer in time', 'timeout');
      throw fail(502, 'Could not reach Open Food Facts', 'upstream');
    } finally { clearTimeout(timer); }
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    // Open Food Facts answers 404 (and status 0) for a code it does not know.
    if (res.status === 404 || (res.status === 200 && body && (body.status === 0 || !body.product))) {
      cache.set(code, null);
      return { food: null, cached: false };
    }
    if (res.status !== 200 || !body?.product) throw fail(502, 'Open Food Facts answered ' + res.status, 'upstream');
    const food = mapProduct(code, body.product);
    cache.set(code, food);
    return { food, cached: false };
  };
}
