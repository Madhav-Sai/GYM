/* Whoop (our addition, not upstream openGym): an inbound OAuth 2.0 provider. Unlike the webhook it
 * never sends anything out; the server pulls the profile's own recovery, sleep, cycles (strain,
 * and `step_count`) and workouts and keeps them in DATA_DIR/whoop/ (whoop-data.js).
 *
 * Everything below was checked against developer.whoop.com on 2026-11-08, not recalled:
 *   authorize  https://api.prod.whoop.com/oauth/oauth2/auth   (state: at least 8 characters)
 *   token      https://api.prod.whoop.com/oauth/oauth2/token  (also the refresh endpoint)
 *   `offline` must be among the scopes, or no refresh token comes back.
 *   Refresh tokens ROTATE: the one in a refresh response replaces the old one, and when two
 *   refreshes race the second fails. whoop-service.js serialises them and saves the new token
 *   before anything else happens.
 *   API v2 under https://api.prod.whoop.com/developer: /v2/cycle, /v2/recovery,
 *   /v2/activity/sleep, /v2/activity/workout, /v2/user/profile/basic, /v2/user/measurement/body.
 *   Collections: `limit` (max 25), `start`, `end`, `nextToken`; the answer has `records` and
 *   `next_token`. Rate limit: 100 requests a minute, 10 000 a day (X-RateLimit-* headers).
 *
 * NOT verified against a live account (no credentials in the build sandbox): that the token
 * endpoint takes client_id/client_secret in the form body (the docs' sample puts them there), and
 * that `step_count` is present for every device (the docs show it only in the cycle sample), so
 * it is read as optional and a missing one is null, never 0. */

export const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
export const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
export const API_BASE = 'https://api.prod.whoop.com/developer';
export const SCOPES = ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement'];
export const PAGE_LIMIT = 25;
export const MAX_PAGES = 40;
export const TIMEOUT_MS = 15_000;
const BODY_MAX = 2 * 1024 * 1024;

/** A refusal the caller can act on: code is 'reauth' | 'rate' | 'unauthorized' | 'http' | 'network'. */
export class WhoopError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'WhoopError'; this.code = code; Object.assign(this, extra); }
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = 60) => (typeof v === 'string' ? v.slice(0, max) : null);
const min = ms => (num(ms) == null ? null : Math.round(ms / 60000));
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** "-05:00" / "+05:30" / "Z" -> minutes east of UTC; anything else counts as UTC. */
export function offsetMin(s) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(s || ''));
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
}
/** The calendar date (YYYY-MM-DD) that instant `ms` falls on in a zone `off` minutes east of UTC. */
export const localDay = (ms, off = 0) => new Date(ms + off * 60000).toISOString().slice(0, 10);

/* Which calendar day does a physiological cycle belong to? A cycle runs from one sleep onset to the
   next, so its start can be the evening before (a 23:00 sleeper) or the small hours of the same day
   (a night-shift worker asleep 01:30-09:30). Half a day after the start is the day it mostly covers
   in both cases. */
export const cycleDay = (startMs, off) => localDay(startMs + 12 * 3600_000, off);

export function mapCycle(r) {
  const start = Date.parse(r?.start);
  if (!Number.isFinite(r?.id) || !Number.isFinite(start)) return null;
  const off = offsetMin(r.timezone_offset);
  const end = Date.parse(r.end);
  const sc = r.score || {};
  return {
    id: r.id, start: iso(r.start), end: Number.isFinite(end) ? iso(r.end) : null, tz: str(r.timezone_offset, 10),
    day: cycleDay(start, off), state: str(r.score_state, 20),
    strain: num(sc.strain), kj: num(sc.kilojoule), avgHr: num(sc.average_heart_rate), maxHr: num(sc.max_heart_rate),
    steps: num(r.step_count), // optional: null when Whoop does not send it
  };
}

export function mapRecovery(r) {
  if (!Number.isFinite(r?.cycle_id)) return null;
  const sc = r.score || {};
  return {
    cycleId: r.cycle_id, sleepId: str(r.sleep_id, 60), state: str(r.score_state, 20), calibrating: sc.user_calibrating === true,
    score: num(sc.recovery_score), hrv: num(sc.hrv_rmssd_milli), rhr: num(sc.resting_heart_rate),
    spo2: num(sc.spo2_percentage), skinTemp: num(sc.skin_temp_celsius), at: iso(r.updated_at),
  };
}

export function mapSleep(r) {
  const id = str(r?.id, 60);
  if (!id || !Number.isFinite(Date.parse(r.start))) return null;
  const sc = r.score || {}, st = sc.stage_summary || {}, need = sc.sleep_needed || {};
  const light = num(st.total_light_sleep_time_milli), deep = num(st.total_slow_wave_sleep_time_milli), rem = num(st.total_rem_sleep_time_milli);
  const asleep = [light, deep, rem].every(v => v != null) ? min(light + deep + rem) : null;
  return {
    id, cycleId: num(r.cycle_id), start: iso(r.start), end: iso(r.end), tz: str(r.timezone_offset, 10), nap: r.nap === true,
    state: str(r.score_state, 20),
    asleepMin: asleep, inBedMin: min(st.total_in_bed_time_milli), awakeMin: min(st.total_awake_time_milli),
    lightMin: min(light), deepMin: min(deep), remMin: min(rem), disturbances: num(st.disturbance_count),
    efficiency: num(sc.sleep_efficiency_percentage), consistency: num(sc.sleep_consistency_percentage),
    performance: num(sc.sleep_performance_percentage), respRate: num(sc.respiratory_rate),
    neededMin: [need.baseline_milli, need.need_from_sleep_debt_milli, need.need_from_recent_strain_milli, need.need_from_recent_nap_milli].every(v => num(v) != null)
      ? min(need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli + need.need_from_recent_nap_milli) : null,
    debtMin: min(need.need_from_sleep_debt_milli),
  };
}

export function mapWorkout(r) {
  const id = str(r?.id, 60), start = Date.parse(r?.start);
  if (!id || !Number.isFinite(start)) return null;
  const sc = r.score || {}, z = sc.zone_durations || {};
  const end = Date.parse(r.end);
  return {
    id, start: iso(r.start), end: Number.isFinite(end) ? iso(r.end) : null, tz: str(r.timezone_offset, 10),
    day: localDay(start, offsetMin(r.timezone_offset)), sport: str(r.sport_name, 60), state: str(r.score_state, 20),
    strain: num(sc.strain), avgHr: num(sc.average_heart_rate), maxHr: num(sc.max_heart_rate), kj: num(sc.kilojoule),
    distanceM: num(sc.distance_meter),
    zonesMin: ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].map(k => min(z[k])),
  };
}

export const MAPPERS = { cycle: mapCycle, recovery: mapRecovery, sleep: mapSleep, workout: mapWorkout };
export const PATHS = { cycle: '/v2/cycle', recovery: '/v2/recovery', sleep: '/v2/activity/sleep', workout: '/v2/activity/workout' };

export function whoopProvider({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const clientId = () => String(env.WHOOP_CLIENT_ID || '');
  const clientSecret = () => String(env.WHOOP_CLIENT_SECRET || '');
  const redirectUri = () => String(env.WHOOP_REDIRECT_URI || '');

  async function call(url, init) {
    let res;
    try { res = await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch (e) { throw new WhoopError('network', e?.name === 'TimeoutError' ? 'Whoop did not answer in time.' : 'Could not reach Whoop.'); }
    const text = (await res.text().catch(() => '')).slice(0, BODY_MAX);
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body, headers: res.headers };
  }

  /** Seconds to wait from X-RateLimit-Reset (a delta in seconds, per the docs), else Retry-After, else 60. */
  const waitMs = h => {
    const v = Number(h?.get?.('x-ratelimit-reset') ?? h?.get?.('retry-after'));
    return Math.min(Number.isFinite(v) && v > 0 ? v * 1000 : 60_000, 3600_000);
  };

  async function token(form) {
    const r = await call(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...form, client_id: clientId(), client_secret: clientSecret() }).toString(),
    });
    if (r.status === 200 && typeof r.body?.access_token === 'string') {
      const sec = num(r.body.expires_in);
      return {
        access_token: r.body.access_token,
        refresh_token: typeof r.body.refresh_token === 'string' ? r.body.refresh_token : null,
        expires_at: now() + (sec != null && sec > 0 ? sec : 3600) * 1000,
        scope: str(r.body.scope, 400),
      };
    }
    if (r.status === 429) throw new WhoopError('rate', 'Whoop is rate limiting this app.', { retryAfterMs: waitMs(r.headers) });
    // invalid_grant / invalid_client / 400 / 401: this grant is finished, the person has to connect again.
    if (r.status === 400 || r.status === 401) throw new WhoopError('reauth', 'Whoop refused the sign-in. Connect it again.', { oauth: str(r.body?.error, 40) });
    throw new WhoopError('http', `Whoop answered ${r.status}.`, { status: r.status });
  }

  return {
    id: 'whoop', kind: 'oauth', category: 'wearables', events: [], max: 1,
    env: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI'],
    configured: e => ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI'].every(k => String((e || env)[k] || '').trim()),

    authorizeUrl(state) {
      if (String(state).length < 8) throw new Error('whoop: state must be at least 8 characters');
      const u = new URL(AUTH_URL);
      u.search = new URLSearchParams({ response_type: 'code', client_id: clientId(), redirect_uri: redirectUri(), scope: SCOPES.join(' '), state }).toString();
      return u.toString();
    },
    exchange: code => token({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri() }),
    refresh: refreshToken => token({ grant_type: 'refresh_token', refresh_token: String(refreshToken), scope: 'offline' }),

    /** One GET. 401 -> 'unauthorized' (refresh and retry once), 429 -> 'rate'. */
    async get(accessToken, path, query = {}) {
      const u = new URL(API_BASE + path);
      for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, String(v));
      const r = await call(u.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (r.status === 200) return r.body;
      if (r.status === 401) throw new WhoopError('unauthorized', 'Whoop rejected the access token.');
      if (r.status === 429) throw new WhoopError('rate', 'Whoop is rate limiting this app.', { retryAfterMs: waitMs(r.headers) });
      if (r.status === 404) return null;
      throw new WhoopError('http', `Whoop answered ${r.status}.`, { status: r.status });
    },

    /** DELETE /v2/user/access: ends the grant on Whoop's side when the person disconnects. Best effort. */
    async revoke(accessToken) {
      const r = await call(API_BASE + '/v2/user/access', { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
      return r.status >= 200 && r.status < 300;
    },

    /** Every record of a collection since `start` (ISO), newest first, following next_token. */
    async collect(accessToken, kind, { start, end } = {}) {
      const out = [];
      let nextToken = '';
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = await this.get(accessToken, PATHS[kind], { limit: PAGE_LIMIT, start, end, nextToken });
        for (const rec of Array.isArray(body?.records) ? body.records : []) {
          const m = MAPPERS[kind](rec);
          if (m) out.push(m);
        }
        nextToken = typeof body?.next_token === 'string' ? body.next_token : '';
        if (!nextToken) break;
      }
      return out;
    },
  };
}
