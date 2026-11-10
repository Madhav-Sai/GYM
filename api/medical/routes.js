/* /api/medical (this fork): blood tests, InBody scans and goals, for the app's Medical screens.
 * Handed the session helpers by server.js, like integrations/routes.js. Every route needs a signed-in
 * profile and only ever reads or writes that profile's own file; an id from another profile is simply
 * "no such entry". Every write answers with the whole record, so the app redraws from one answer.
 * Documented in api/openapi.yaml (tag medical). */

export function medicalRoutes({ json, readBody, readSession, store }) {
  const guard = fn => async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    try { await fn(req, res, user); }
    catch (e) {
      if (!e?.status || e.status >= 500) throw e;
      json(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
  };
  const idOf = body => (typeof body?.id === 'string' ? body.id.slice(0, 40) : '');
  const write = fn => guard(async (req, res, user) => json(res, 200, fn(user.id, await readBody(req))));

  return {
    'GET /api/medical': guard(async (req, res, user) => json(res, 200, store.get(user.id))),
    'POST /api/medical/labs/save': write((uid, body) => store.saveLab(uid, body)),
    'POST /api/medical/labs/delete': write((uid, body) => store.deleteLab(uid, idOf(body))),
    'POST /api/medical/inbody/save': write((uid, body) => store.saveInbody(uid, body)),
    'POST /api/medical/inbody/delete': write((uid, body) => store.deleteInbody(uid, idOf(body))),
    'POST /api/medical/goals/save': write((uid, body) => store.saveGoal(uid, body)),
    'POST /api/medical/goals/delete': write((uid, body) => store.deleteGoal(uid, idOf(body))),
    'POST /api/medical/tracked': write((uid, body) => store.setTracked(uid, body?.keys)),
  };
}
