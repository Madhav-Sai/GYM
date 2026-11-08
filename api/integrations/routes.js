/* /api/integrations: the app's Settings → Integrations page talks to these. Handed the session
 * helpers by server.js, like coach/routes.js, so this module holds no closure over db or SECRET.
 * Every route needs a signed-in profile and only ever sees that profile's connections; ids are
 * looked up in the caller's own file, so another profile's id is simply "no such connection".
 * Documented in api/openapi.yaml (tag Integrations). */

export function integrationRoutes({ json, readBody, readSession, hub, audit = () => {}, origin = '' }) {
  // A refusal the hub throws ({ status, code, message }) is the caller's to read, never a 500.
  const guard = fn => async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    try { await fn(req, res, user); }
    catch (e) {
      if (!e?.status) throw e;
      json(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) },
        e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : undefined);
    }
  };
  const whoopOr404 = () => {
    if (!hub.whoop) throw Object.assign(new Error('Whoop is off on this server'), { status: 404, code: 'off' });
    return hub.whoop;
  };
  // Where the browser lands after Whoop: the app's own Integrations page (it is a HashRouter).
  const back = (res, result) => {
    res.writeHead(302, { Location: `${origin}/#/settings/integrations?whoop=${result}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end();
  };
  const PAGE = {
    ok: ['Whoop connected', 'Go back to the myGym app. Your first sync is already running.'],
    denied: ['Whoop sign-in cancelled', 'Nothing was connected. Go back to the myGym app to try again.'],
    expired: ['That sign-in link expired', 'Go back to the myGym app and tap Connect again.'],
    error: ['Could not connect Whoop', 'Go back to the myGym app and try again.'],
  };
  const resultPage = (res, result) => {
    const [h, p] = PAGE[result] || PAGE.error;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>myGym</title><style>body{font:17px/1.5 -apple-system,Helvetica,Arial,sans-serif;background:#0c0e12;color:#fafafa;text-align:center;padding:18vh 24px 0}h1{font-size:24px}p{color:#a1a1aa}a{display:inline-block;margin-top:20px;padding:14px 26px;border-radius:14px;background:#ff9f0a;color:#0c0e12;font-weight:700;text-decoration:none}</style></head><body><h1>${h}</h1><p>${p}</p><a href="opengym://home">Open myGym</a></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end(html);
  };
  const idOf = body => (typeof body?.id === 'string' ? body.id.slice(0, 40) : null);

  return {
    'GET /api/integrations': guard(async (req, res, user) => {
      json(res, 200, hub.describe(user.id));
    }),

    'POST /api/integrations/connect': guard(async (req, res, user) => {
      const body = await readBody(req);
      const provider = typeof body.provider === 'string' ? body.provider.slice(0, 40) : '';
      const out = hub.connect(user.id, provider, body);
      audit(req, 'integration.connect', { user, msg: `${provider}: ${out.connection.label}` });
      json(res, 200, out);
    }),

    'POST /api/integrations/update': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, hub.update(user.id, idOf(body), body));
    }),

    'POST /api/integrations/disconnect': guard(async (req, res, user) => {
      const body = await readBody(req);
      const gone = hub.disconnect(user.id, idOf(body));
      audit(req, 'integration.disconnect', { user, msg: `${gone.provider}: ${gone.label}` });
      json(res, 200, { ok: true });
    }),

    'POST /api/integrations/test': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, await hub.test(user.id, idOf(body), typeof body.type === 'string' ? body.type : null));
    }),

    'POST /api/integrations/retry': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, await hub.retry(user.id, idOf(body)));
    }),

    // ---- Whoop (our addition) ----
    // The app asks for the Whoop sign-in URL and navigates there; Whoop sends the browser back to
    // WHOOP_REDIRECT_URI (= this server's /api/integrations/oauth/callback).
    'GET /api/integrations/whoop/authorize': guard(async (req, res, user) => {
      json(res, 200, whoopOr404().authorize(user.id));
    }),

    // A browser navigation, not a fetch. With a session cookie (the website) it redirects back into the app. Without
    // one (the phone app, whose sign-in is a token and whose Whoop page opened in the phone's own browser) the
    // one-time state says whose account this is, and the answer is a small page with a button back into the app.
    'GET /api/integrations/oauth/callback': async (req, res) => {
      const session = readSession(req);
      const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      const whoop = hub.whoop;
      const owner = whoop ? whoop.stateOwner(q.state) : null;
      const uid = session ? session.id : owner;
      const reply = result => (session ? back(res, result) : resultPage(res, result));
      if (!uid) return reply(whoop ? 'expired' : 'error');
      let result = 'error';
      try {
        await whoopOr404().callback(uid, { code: q.code, state: q.state, error: q.error });
        audit(req, 'integration.connect', session ? { user: session, msg: 'whoop' } : { uid, msg: 'whoop' });
        whoop.sync(uid, { force: true }).catch(() => {}); // the first pull runs while the browser returns
        result = 'ok';
      } catch (e) {
        if (!e?.status) console.error('whoop callback', e);
        result = e?.code === 'denied' ? 'denied' : e?.code === 'state' ? 'expired' : 'error';
      }
      reply(result);
    },

    'POST /api/integrations/whoop/sync': guard(async (req, res, user) => {
      json(res, 200, await whoopOr404().sync(user.id, { force: true }));
    }),

    'GET /api/whoop/summary': guard(async (req, res, user) => {
      const conn = hub.describe(user.id).connections.find(c => c.provider === 'whoop');
      // `connected` tells "never connected" from "connected, first sync still running".
      json(res, 200, { ...whoopOr404().summary(user.id), connected: !!conn, status: conn?.status || null, connectionId: conn?.id || null });
    }),

    'GET /api/integrations/log': guard(async (req, res, user) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      json(res, 200, hub.log(user.id, id ? id.slice(0, 40) : null));
    }),
  };
}
