/* Whoop, the moving parts: the OAuth round trip, keeping the tokens alive, and pulling data.
 *
 * The one thing that kills this integration silently is the refresh token. Whoop rotates it on every
 * refresh and the old one stops working, and two refreshes at once make the second one fail. So:
 *   - a refresh is serialised per connection (one promise, everyone awaits it),
 *   - the new access + refresh token are written to the sealed store BEFORE the refresh returns,
 *   - and if that write fails, the new pair stays in memory (`mem`) so the next call still has the
 *     only refresh token that works, and writing it is retried first.
 * A grant Whoop refuses (revoked, secret changed) is marked "needs attention" and left alone until
 * the person connects again; a network error or a 5xx is just tried again on the next run. */
import crypto from 'node:crypto';
import { newId } from './crypto.js';
import { WhoopError } from './providers/whoop.js';

export const STATE_TTL_MS = 10 * 60_000;
export const STATE_MAX = 100;
export const EARLY_MS = 60_000;          // refresh a minute before expiry
export const OVERLAP_MS = 3 * 86400_000; // re-pull a few days back: scores arrive after the record
export const DEFAULT_BACKFILL_DAYS = 90;

export function createWhoop({ store, data, provider, now = Date.now, backfillDays = DEFAULT_BACKFILL_DAYS, log = console }) {
  const pending = new Map();    // state -> { uid, exp }
  const refreshing = new Map(); // connection id -> Promise<access token>
  const syncing = new Set();    // uid
  const mem = new Map();        // connection id -> { access, refresh, exp } not (yet) on disk
  const backoff = new Map();    // uid -> ms timestamp before which a scheduled run leaves it alone

  const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code }); };
  const conn = uid => store.list(uid).find(r => r.provider === 'whoop') || null;

  function persist(uid, id, tok) {
    store.update(uid, id, r => {
      r.secrets.access = store.seal(uid, id, 'access', tok.access);
      r.secrets.refresh = store.seal(uid, id, 'refresh', tok.refresh);
      r.secrets.expires = store.seal(uid, id, 'expires', String(tok.exp));
      r.status = 'ok'; r.failures = 0; r.lastError = null;
    });
  }

  function attention(uid, id, msg, code) {
    store.update(uid, id, r => {
      r.status = 'attention'; r.failures = (r.failures || 0) + 1;
      r.lastError = { at: now(), msg, code };
      r.log = [...r.log, { at: now(), ev: 'sync', ok: false, msg }];
    });
  }

  /* ---------------- OAuth round trip ---------------- */
  function authorize(uid) {
    const t = now();
    for (const [s, e] of pending) if (e.exp < t) pending.delete(s);
    if (pending.size >= STATE_MAX) fail(429, 'too many sign-ins in progress, try again in a few minutes', 'rate');
    const state = crypto.randomBytes(24).toString('base64url'); // 32 chars; Whoop needs at least 8
    pending.set(state, { uid, exp: t + STATE_TTL_MS });
    return { url: provider.authorizeUrl(state) };
  }

  /** The browser comes back from Whoop with ?code&state. State is one-use, expires, and belongs to this profile. */
  async function callback(uid, query) {
    const state = typeof query?.state === 'string' ? query.state : '';
    const entry = pending.get(state);
    pending.delete(state);
    if (query?.error) fail(400, 'Whoop sign-in was cancelled', 'denied');
    if (!entry || entry.uid !== uid || entry.exp < now()) fail(400, 'This sign-in link expired. Start again.', 'state');
    if (typeof query.code !== 'string' || !query.code || query.code.length > 2000) fail(400, 'Whoop sent no code', 'code');

    const tok = await provider.exchange(query.code);
    if (!tok.refresh_token) fail(502, 'Whoop sent no refresh token (the offline scope is needed)', 'no-refresh');
    const pair = { access: tok.access_token, refresh: tok.refresh_token, exp: tok.expires_at };

    const existing = conn(uid);
    let id;
    if (existing) { id = existing.id; persist(uid, id, pair); store.update(uid, id, r => { r.paused = false; r.log = [...r.log, { at: now(), ev: 'reconnected', ok: true }]; }); }
    else {
      id = newId('c');
      const secrets = {
        access: store.seal(uid, id, 'access', pair.access),
        refresh: store.seal(uid, id, 'refresh', pair.refresh),
        expires: store.seal(uid, id, 'expires', String(pair.exp)),
      };
      store.add(uid, { id, provider: 'whoop', label: 'Whoop', events: [], info: {}, secrets, log: [{ at: now(), ev: 'connected', ok: true }] });
    }
    mem.delete(id);
    backoff.delete(uid);
    return { id };
  }

  /* ---------------- keeping the token alive ---------------- */
  function current(uid, rec) {
    const m = mem.get(rec.id);
    if (m) return m;
    const access = store.reveal(uid, rec, 'access');
    const refresh = store.reveal(uid, rec, 'refresh');
    const exp = Number(store.reveal(uid, rec, 'expires'));
    return access && refresh && Number.isFinite(exp) ? { access, refresh, exp } : null;
  }

  function refreshOnce(uid, id) {
    if (refreshing.has(id)) return refreshing.get(id);
    const p = (async () => {
      const rec = store.get(uid, id);
      const cur = rec && current(uid, rec);
      if (!cur) { attention(uid, id, 'The saved Whoop sign-in cannot be read. Connect it again.', 'sealed'); throw new WhoopError('reauth', 'sign-in unreadable'); }
      let tok;
      try { tok = await provider.refresh(cur.refresh); }
      catch (e) {
        if (e.code === 'reauth') attention(uid, id, 'Whoop needs to be connected again.', 'reauth');
        throw e;
      }
      // Whoop rotates; if a response ever omits it the old one is all there is.
      const next = { access: tok.access_token, refresh: tok.refresh_token || cur.refresh, exp: tok.expires_at };
      mem.set(id, next);       // the only refresh token that works now: never lose it
      try { persist(uid, id, next); mem.delete(id); }
      catch (e) { log.error('whoop: could not save the rotated refresh token, keeping it in memory:', e.message); }
      return next.access;
    })().finally(() => refreshing.delete(id));
    refreshing.set(id, p);
    return p;
  }

  async function accessToken(uid, rec, { force = false } = {}) {
    const m = mem.get(rec.id);
    if (m && !refreshing.has(rec.id)) { try { persist(uid, rec.id, m); mem.delete(rec.id); } catch { /* still not writable */ } }
    const cur = current(uid, rec);
    if (!force && cur && cur.exp - now() > EARLY_MS) return cur.access;
    return refreshOnce(uid, rec.id);
  }

  /* ---------------- pulling data ---------------- */
  async function pull(uid, rec) {
    // The current token, refreshed only if it has (nearly) expired. A 401 below forces one refresh.
    let token = await accessToken(uid, rec);
    const run = async fn => {
      try { return await fn(token); }
      catch (e) {
        if (e.code !== 'unauthorized') throw e;
        token = await accessToken(uid, rec, { force: true }); // one retry with a fresh token
        return fn(token);
      }
    };
    const first = !data.syncedAt(uid);
    const lastStart = data.lastStart(uid);
    const start = new Date(first || !lastStart ? now() - backfillDays * 86400_000 : Math.max(Date.parse(lastStart) - OVERLAP_MS, now() - backfillDays * 86400_000)).toISOString();

    const cycles = await run(t => provider.collect(t, 'cycle', { start }));
    const recovery = await run(t => provider.collect(t, 'recovery', { start }));
    const sleep = await run(t => provider.collect(t, 'sleep', { start }));
    const workouts = await run(t => provider.collect(t, 'workout', { start }));
    // Profile and body change rarely: once on the first pull, then about daily.
    let profile, body;
    if (first || !data.summary(uid).body || now() - (data.syncedAt(uid) || 0) > 86400_000) {
      const p = await run(t => provider.get(t, '/v2/user/profile/basic').catch(e => (e.code === 'http' ? null : Promise.reject(e))));
      const b = await run(t => provider.get(t, '/v2/user/measurement/body').catch(e => (e.code === 'http' ? null : Promise.reject(e))));
      if (p) profile = { firstName: typeof p.first_name === 'string' ? p.first_name.slice(0, 40) : null };
      if (b) body = {
        heightM: Number.isFinite(b.height_meter) ? b.height_meter : null,
        weightKg: Number.isFinite(b.weight_kilogram) ? b.weight_kilogram : null,
        maxHr: Number.isFinite(b.max_heart_rate) ? b.max_heart_rate : null,
      };
    }
    return data.upsert(uid, { cycles, recovery, sleep, workouts, profile, body });
  }

  /** One profile's sync. `scheduled` runs respect the back-off after a rate limit or a refused grant. */
  async function sync(uid, { scheduled = false } = {}) {
    const rec = conn(uid);
    if (!rec) fail(404, 'Whoop is not connected', 'missing');
    if (rec.paused) return { ok: false, skipped: 'paused' };
    if (scheduled && (rec.status === 'attention' || (backoff.get(uid) || 0) > now())) return { ok: false, skipped: 'attention' };
    if (syncing.has(uid)) return { ok: false, skipped: 'busy' };
    syncing.add(uid);
    const t0 = now();
    try {
      const counts = await pull(uid, rec);
      store.update(uid, rec.id, r => {
        r.status = 'ok'; r.failures = 0; r.lastOk = now(); r.lastError = null;
        const p = data.summary(uid).profile;
        if (p?.firstName) r.info = { ...r.info, name: p.firstName };
        r.log = [...r.log, { at: now(), ev: 'sync', ok: true, ms: now() - t0, msg: `${counts.cycles} days, ${counts.workouts} workouts` }];
      });
      backoff.delete(uid);
      return { ok: true, ...counts };
    } catch (e) {
      if (e.code === 'rate') {
        backoff.set(uid, now() + (e.retryAfterMs || 60_000));
        store.update(uid, rec.id, r => { r.log = [...r.log, { at: now(), ev: 'sync', ok: false, msg: 'Whoop rate limit; trying again later.' }]; });
        return { ok: false, code: 'rate', retryAfterMs: e.retryAfterMs || 60_000 };
      }
      if (e.code === 'reauth') return { ok: false, code: 'reauth' };
      // Network trouble, a 5xx: logged, retried next run. A run of failures flags the card.
      const n = (store.get(uid, rec.id)?.failures || 0) + 1;
      store.update(uid, rec.id, r => {
        r.failures = n; r.lastError = { at: now(), msg: e.message || 'Sync failed.', code: e.code || 'error' };
        if (n >= 5) r.status = 'attention';
        r.log = [...r.log, { at: now(), ev: 'sync', ok: false, msg: e.message || 'Sync failed.' }];
      });
      return { ok: false, code: e.code || 'error', msg: e.message };
    } finally { syncing.delete(uid); }
  }

  async function syncAll({ pause = 500 } = {}) {
    let n = 0;
    for (const uid of store.uids()) {
      if (!conn(uid)) continue;
      try { await sync(uid, { scheduled: true }); n++; } catch (e) { log.error('whoop: sync failed for', uid, e.message); }
      if (pause) await new Promise(r => setTimeout(r, pause));
    }
    return n;
  }

  function disconnect(uid) { const r = conn(uid); if (r) { mem.delete(r.id); backoff.delete(uid); } data.clear(uid); }

  return { authorize, callback, sync, syncAll, summary: uid => data.summary(uid), disconnect, accessToken, _mem: mem, _pending: pending };
}
