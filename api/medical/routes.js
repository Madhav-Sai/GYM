/* /api/medical (this fork): blood tests, InBody scans and goals, for the app's Medical screens.
 * Handed the session helpers by server.js, like integrations/routes.js. Every route needs a signed-in
 * profile and only ever reads or writes that profile's own file; an id from another profile is simply
 * "no such entry". Every write answers with the whole record, so the app redraws from one answer.
 * Documented in api/openapi.yaml (tag medical). */
import { TYPE_OF_EXT } from './files.js';

// The header form of a file name: plain ASCII in filename=, the real one in filename*.
const disposition = name => {
  const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}`;
};

export function medicalRoutes({ json, readBody, readSession, store, files = null }) {
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
    // Deleting a result deletes its report file too.
    'POST /api/medical/labs/delete': write((uid, body) => {
      const old = store.lab(uid, idOf(body))?.file;
      const doc = store.deleteLab(uid, idOf(body));
      if (old && files) files.remove(uid, old.id);
      return doc;
    }),
    'POST /api/medical/inbody/save': write((uid, body) => store.saveInbody(uid, body)),
    'POST /api/medical/inbody/delete': write((uid, body) => store.deleteInbody(uid, idOf(body))),
    'POST /api/medical/goals/save': write((uid, body) => store.saveGoal(uid, body)),
    'POST /api/medical/goals/delete': write((uid, body) => store.deleteGoal(uid, idOf(body))),
    /* A lab result's report (files.js): a PDF, JPEG or PNG of up to 10 MB, as base64 in one or more
       pieces. Each answer before the last is { upload, received, size }; the last is the whole record
       with the file attached, replacing (and deleting) the one it had. */
    'POST /api/medical/labs/file': guard(async (req, res, user) => {
      if (!files) return json(res, 404, { error: 'report files are not stored on this server', code: 'off' });
      const body = await readBody(req);
      const labId = idOf({ id: body.labId });
      // The result must be this profile's, before a byte is kept and again once the file is whole.
      if (body.upload === undefined && !store.lab(user.id, labId)) return json(res, 404, { error: 'no such entry', code: 'missing' });
      const r = files.receive(user.id, { ...body, labId });
      if (!r.done) return json(res, 200, { upload: r.upload, received: r.received, size: r.size });
      let out;
      try { out = store.setLabFile(user.id, r.labId, r.file); }
      catch (e) { files.remove(user.id, r.file.id); throw e; }
      if (out.old && out.old.id !== r.file.id) files.remove(user.id, out.old.id);
      json(res, 200, { ...out.doc, file: r.file });
    }),

    // The file back, to its owner only: it has to be named by one of this profile's own results.
    'GET /api/medical/labs/file': guard(async (req, res, user) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
      const meta = files && store.get(user.id).labs.map(l => l.file).find(f => f && f.id === id);
      const buf = meta ? files.read(user.id, id) : null;
      if (!buf) return json(res, 404, { error: 'no such file', code: 'missing' });
      const ext = id.split('.').pop();
      res.writeHead(200, {
        'Content-Type': TYPE_OF_EXT[ext],
        'Content-Length': String(buf.length),
        'Content-Disposition': disposition(meta.name),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Access-Control-Expose-Headers': 'Content-Length',
      });
      res.end(buf);
    }),

    'POST /api/medical/labs/file/delete': write((uid, body) => {
      const { doc, old } = store.setLabFile(uid, idOf({ id: body?.labId }), null);
      if (old && files) files.remove(uid, old.id);
      return doc;
    }),

    'POST /api/medical/tracked': write((uid, body) => store.setTracked(uid, body?.keys)),
    // The next tests to book: tick one done (on `day`, today when left out) or take the tick off.
    'POST /api/medical/tests/done': write((uid, body) => store.setTestDone(uid, idOf(body), body?.done !== false, typeof body?.day === 'string' ? body.day : null)),
  };
}
