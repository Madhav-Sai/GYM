/* /api/health (our addition): the Diet and Supplements screens talk to these. Handed the session
 * helpers by server.js like integrations/routes.js, so the module holds no closure over db or SECRET.
 * Every route needs a signed-in profile (a session cookie, or a paired phone's bearer token) and only
 * ever reads or writes that profile's own file. Documented in api/openapi.yaml (tag health). */
import { validDay, KEEP_DAYS } from './store.js';
import { addEntry, removeEntry, addWater, setDay, setPrefs, dayView, blankDay } from './diet.js';
import { saveSupplement, markSupplement } from './supplements.js';
import { saveFood, hideFood } from './foods.js';
import { saveMeal, deleteMeal, mealsOf, MAX_MEAL_ITEMS } from './meals.js';

const DAY = 86400_000;

export function healthRoutes({ json, readBody, readSession, requireAdmin, store, foods, barcode = null, audit = () => {}, now = Date.now }) {
  // `who` resolves the caller and answers 401 (or 403) itself when it returns nothing.
  const guarded = who => fn => async (req, res) => {
    const user = who(req, res);
    if (!user) return;
    try { await fn(req, res, user); }
    catch (e) {
      if (!e?.status) throw e;
      json(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) });
    }
  };
  const guard = guarded((req, res) => {
    const user = readSession(req);
    if (!user) json(res, 401, { error: 'not signed in' });
    return user;
  });
  // The food database is one per instance: anyone signed in reads it, an admin changes it.
  const adminGuard = guarded((req, res) => requireAdmin(req, res));
  const foodsView = () => ({ ...foods.get(), at: Date.now() });
  const today = () => new Date(now()).toISOString().slice(0, 10);
  // The app sends its own (India time) day. Anything that is not a date, or is outside what the
  // file keeps (or more than two days ahead of the server's clock), is refused.
  const dayOf = v => {
    const d = validDay(v);
    const lo = new Date(now() - KEEP_DAYS * DAY).toISOString().slice(0, 10);
    const hi = new Date(now() + 2 * DAY).toISOString().slice(0, 10);
    if (!d || d < lo || d > hi) throw Object.assign(new Error('day must be YYYY-MM-DD within the kept range'), { status: 400, code: 'day' });
    return d;
  };
  const query = req => new URL(req.url, 'http://x').searchParams;
  const dietDay = (doc, d) => (doc.diet.days[d] ||= blankDay());
  const suppView = doc => ({ list: doc.supplements.list || [], log: doc.supplements.log || {} });

  return {
    'GET /api/health/diet': guard(async (req, res, user) => {
      const d = dayOf(query(req).get('day') || today());
      json(res, 200, dayView(store.get(user.id), d));
    }),

    'POST /api/health/diet/log': guard(async (req, res, user) => {
      const body = await readBody(req);
      const d = dayOf(body.day);
      const at = new Date(now()).toISOString();
      // `entries` (a saved meal, or yesterday's lunch copied) logs several at once: all or none.
      if (Array.isArray(body.entries)) {
        if (!body.entries.length || body.entries.length > MAX_MEAL_ITEMS) throw Object.assign(new Error(`entries must hold 1 to ${MAX_MEAL_ITEMS} items`), { status: 400, code: 'entries' });
        json(res, 200, store.change(user.id, doc => { const day = dietDay(doc, d); const entries = body.entries.map(e => addEntry(day, e, at)); return { entries, ...dayView(doc, d) }; }));
        return;
      }
      const out = store.change(user.id, doc => { const entry = addEntry(dietDay(doc, d), body.entry, at); return { entry, ...dayView(doc, d) }; });
      json(res, 200, out);
    }),

    'POST /api/health/diet/unlog': guard(async (req, res, user) => {
      const body = await readBody(req);
      const d = dayOf(body.day);
      const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
      json(res, 200, store.change(user.id, doc => { removeEntry(dietDay(doc, d), id); return dayView(doc, d); }));
    }),

    'POST /api/health/diet/water': guard(async (req, res, user) => {
      const body = await readBody(req);
      const d = dayOf(body.day);
      json(res, 200, store.change(user.id, doc => { addWater(dietDay(doc, d), body.ml); return dayView(doc, d); }));
    }),

    'POST /api/health/diet/day': guard(async (req, res, user) => {
      const body = await readBody(req);
      const d = dayOf(body.day);
      json(res, 200, store.change(user.id, doc => { setDay(dietDay(doc, d), body); return dayView(doc, d); }));
    }),

    'POST /api/health/diet/prefs': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, { prefs: store.change(user.id, doc => setPrefs(doc, body)) });
    }),

    // Saved meals (meals.js): this profile's own, logged again through diet/log with `entries`.
    'GET /api/health/meals': guard(async (req, res, user) => {
      json(res, 200, { meals: mealsOf(store.get(user.id)) });
    }),

    'POST /api/health/meals/save': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, store.change(user.id, doc => { const meal = saveMeal(doc, body.meal, new Date(now()).toISOString()); return { meal, meals: mealsOf(doc) }; }));
    }),

    'POST /api/health/meals/delete': guard(async (req, res, user) => {
      const body = await readBody(req);
      const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
      json(res, 200, store.change(user.id, doc => { deleteMeal(doc, id); return { meals: mealsOf(doc) }; }));
    }),

    'GET /api/health/foods': guard(async (req, res) => {
      json(res, 200, foodsView());
    }),

    // A packaged food by its barcode (health/barcode.js): Open Food Facts through this server, cached.
    'GET /api/health/foods/barcode': guard(async (req, res) => {
      if (!barcode) { json(res, 503, { error: 'barcode lookup is not set up', code: 'off' }); return; }
      const code = String(query(req).get('code') || '').trim();
      const { food, cached } = await barcode(code);
      if (!food) { json(res, 404, { error: 'not found', code: 'not-found', barcode: code }); return; }
      json(res, 200, { food, cached });
    }),

    'POST /api/admin/foods/save': adminGuard(async (req, res, user) => {
      const body = await readBody(req);
      const food = foods.change(doc => saveFood(doc, { food: body.food, builtin: body.builtin === true }));
      audit(req, 'admin.foods.save', { user, msg: food.id });
      json(res, 200, { food, ...foodsView() });
    }),

    'POST /api/admin/foods/delete': adminGuard(async (req, res, user) => {
      const body = await readBody(req);
      foods.change(doc => hideFood(doc, { id: body.id, restore: body.restore === true, reset: body.reset === true }));
      audit(req, 'admin.foods.delete', { user, msg: String(body.id || '').slice(0, 40) });
      json(res, 200, foodsView());
    }),

    'GET /api/health/supplements': guard(async (req, res, user) => {
      json(res, 200, suppView(store.get(user.id)));
    }),

    'POST /api/health/supplements/save': guard(async (req, res, user) => {
      const body = await readBody(req);
      json(res, 200, store.change(user.id, doc => { const supplement = saveSupplement(doc, body.supplement, today()); return { supplement, ...suppView(doc) }; }));
    }),

    'POST /api/health/supplements/mark': guard(async (req, res, user) => {
      const body = await readBody(req);
      const d = dayOf(body.day);
      const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
      const status = body.status === undefined ? 'taken' : body.status;
      json(res, 200, store.change(user.id, doc => { markSupplement(doc, { day: d, id, status, reason: body.reason }, new Date(now()).toISOString()); return suppView(doc); }));
    }),
  };
}
