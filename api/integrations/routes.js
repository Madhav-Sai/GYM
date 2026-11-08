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

    // A browser navigation, not a fetch: it answers with a redirect back into the app, never JSON.
    'GET /api/integrations/oauth/callback': async (req, res) => {
      const user = readSession(req);
      if (!user) return back(res, 'signin');
      let result = 'error';
      try {
        const whoop = whoopOr404();
        const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
        await whoop.callback(user.id, { code: q.code, state: q.state, error: q.error });
        audit(req, 'integration.connect', { user, msg: 'whoop' });
        whoop.sync(user.id, { force: true }).catch(() => {}); // the first pull runs while the browser returns
        result = 'ok';
      } catch (e) {
        if (!e?.status) console.error('whoop callback', e);
        result = e?.code === 'denied' ? 'denied' : 'error';
      }
      back(res, result);
    },

    'POST /api/integrations/whoop/sync': guard(async (req, res, user) => {
      json(res, 200, await whoopOr404().sync(user.id, { force: true }));
    }),

    'GET /api/whoop/summary': guard(async (req, res, user) => {
      json(res, 200, whoopOr404().summary(user.id));
    }),

    'GET /api/integrations/log': guard(async (req, res, user) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      json(res, 200, hub.log(user.id, id ? id.slice(0, 40) : null));
    }),
  };
}
