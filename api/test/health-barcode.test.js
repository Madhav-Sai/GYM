/* GET /api/health/foods/barcode (our addition): Open Food Facts through this server, mapped to the
 * app's food shape, cached (not found too), with the outbound call mocked. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { healthRoutes } from '../health/routes.js';
import { createHealthStore } from '../health/store.js';
import { createBarcodeCache, createBarcodeLookup, mapProduct, validCode, userAgent, NOT_FOUND_TTL } from '../health/barcode.js';

const NUTELLA = {
  product_name: 'Nutella', brands: 'Ferrero, Nutella', serving_size: '15 g', serving_quantity: 15,
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, 'saturated-fat_100g': 10.6 },
};

function setup({ answer, timeoutMs = 6000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-barcode-'));
  let t = Date.parse('2026-11-08T06:00:00Z');
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return answer(url, init); };
  const cache = createBarcodeCache({ file: path.join(dir, 'health', 'barcodes.json'), now: () => t });
  const barcode = createBarcodeLookup({ cache, fetchImpl, timeoutMs, version: '9.9.9' });
  let session = { id: 'u1' };
  const routes = healthRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body,
    readSession: () => session,
    store: createHealthStore({ dir: path.join(dir, 'health') }),
    barcode,
  });
  const call = async code => { const res = {}; await routes['GET /api/health/foods/barcode']({ url: '/api/health/foods/barcode?code=' + encodeURIComponent(code) }, res); return res; };
  return { call, calls, dir, setSession: s => { session = s; }, tick: ms => { t += ms; } };
}
const ok = body => ({ status: 200, text: async () => JSON.stringify(body) });

test('found: mapped per 100 g, missing values null, never 0', async () => {
  const s = setup({ answer: () => ok({ status: 1, product: NUTELLA }) });
  const r = await s.call('3017620422003');
  assert.equal(r.status, 200);
  const f = r.body.food;
  assert.equal(f.name, 'Nutella');
  assert.equal(f.brand, 'Ferrero');
  assert.equal(f.unit, 'g');
  assert.equal(f.per, 100);
  assert.equal(f.kcal, 539);
  assert.equal(f.protein, 6.3);
  assert.equal(f.satFat, 10.6);
  assert.equal(f.fiber, null);
  assert.deepEqual(f.serving, { g: 15, label: '15 g' });
  assert.equal(r.body.cached, false);
  const { url, init } = s.calls[0];
  assert.match(url, /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json\?fields=product_name,brands,nutriments,serving_size,serving_quantity$/);
  assert.equal(init.headers['User-Agent'], 'myGym/9.9.9 (self-hosted)');
  assert.ok(init.signal);
  assert.ok(fs.existsSync(path.join(s.dir, 'health', 'barcodes.json')));
});

test('cache hit: the second scan never leaves the server', async () => {
  const s = setup({ answer: () => ok({ status: 1, product: NUTELLA }) });
  await s.call('3017620422003');
  const r = await s.call('3017620422003');
  assert.equal(r.status, 200);
  assert.equal(r.body.cached, true);
  assert.equal(r.body.food.kcal, 539);
  assert.equal(s.calls.length, 1);
});

test('not found: 404, and the "not found" is cached for a while', async () => {
  const s = setup({ answer: () => ({ status: 404, text: async () => JSON.stringify({ status: 0, status_verbose: 'product not found' }) }) });
  let r = await s.call('12345678');
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'not-found');
  assert.equal(r.body.barcode, '12345678');
  r = await s.call('12345678');
  assert.equal(r.status, 404);
  assert.equal(s.calls.length, 1);
  s.tick(NOT_FOUND_TTL + 1000);
  await s.call('12345678');
  assert.equal(s.calls.length, 2);
});

test('a 200 with status 0 is "not found" too', async () => {
  const s = setup({ answer: () => ok({ status: 0 }) });
  assert.equal((await s.call('12345670')).status, 404);
});

test('bad code: 400 without asking anyone', async () => {
  const s = setup({ answer: () => ok({ status: 1, product: NUTELLA }) });
  for (const c of ['', '1234567', '123456789012345', 'abcdefgh', '1234 5678', '../../etc']) {
    const r = await s.call(c);
    assert.equal(r.status, 400, c);
    assert.equal(r.body.code, 'code');
  }
  assert.equal(s.calls.length, 0);
});

test('timeout: 504, and nothing cached', async () => {
  const s = setup({
    timeoutMs: 30,
    answer: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
  });
  let r = await s.call('3017620422003');
  assert.equal(r.status, 504);
  assert.equal(r.body.code, 'timeout');
  r = await s.call('3017620422003');
  assert.equal(s.calls.length, 2);
});

test('network failure or a 500 upstream: 502, not cached', async () => {
  let n = 0;
  const s = setup({ answer: () => { if (n++ === 0) throw new Error('ECONNRESET'); return { status: 500, text: async () => 'oops' }; } });
  assert.equal((await s.call('3017620422003')).status, 502);
  assert.equal((await s.call('3017620422003')).status, 502);
  assert.equal(s.calls.length, 2);
});

test('not signed in: 401', async () => {
  const s = setup({ answer: () => ok({ status: 1, product: NUTELLA }) });
  s.setSession(null);
  assert.equal((await s.call('3017620422003')).status, 401);
  assert.equal(s.calls.length, 0);
});

test('mapProduct: kJ fallback, text numbers, junk and a nameless product', () => {
  const f = mapProduct('40000000', { brands: 'Acme', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: '12.5', fat_100g: -3, carbohydrates_100g: 'n/a', fiber_100g: 0 } });
  assert.equal(f.kcal, 100);
  assert.equal(f.protein, 12.5);
  assert.equal(f.fat, null);
  assert.equal(f.carbs, null);
  assert.equal(f.fiber, 0);
  assert.equal(f.name, 'Acme');
  assert.equal(f.serving, null);
  assert.equal(mapProduct('40000000', {}).name, 'Barcode 40000000');
  assert.equal(validCode('12345678901234'), true);
  assert.equal(validCode(12345678), false);
  assert.match(userAgent('1.2.3'), /^myGym\/1\.2\.3 \(self-hosted\)$/);
});
