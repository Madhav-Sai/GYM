import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { hash } from "@node-rs/argon2";
import { eq, users, exercises, workoutTemplates, workoutTemplateExercises } from "@gym/db";
import { buildApp } from "./app";

process.env.NODE_ENV = "test";
const EMAIL = "apitest@example.test", PW = "test-password-12345";
let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = "";
let tplA = 0, tplB = 0, chest = 0, legpress = 0;

const call = (method: string, url: string, payload?: unknown, ip = "10.0.0.1") =>
  app.inject({ method: method as any, url, payload: payload as any, remoteAddress: ip, headers: cookie ? { cookie } : {} });

before(async () => {
  app = await buildApp();
  await app.db.delete(users).where(eq(users.email, EMAIL));
  const [u] = await app.db.insert(users).values({ email: EMAIL, name: "T", role: "admin", passwordHash: await hash(PW) }).returning();
  const ex = await app.db.select().from(exercises);
  chest = ex.find((e) => e.name === "Machine chest press")!.id;
  legpress = ex.find((e) => e.name === "Leg press")!.id;
  // Two templates sharing "Machine chest press" (like Mon/Thu in the real plan).
  const [a] = await app.db.insert(workoutTemplates).values({ userId: u.id, name: "TA", dayLabel: "Mon" }).returning();
  const [b] = await app.db.insert(workoutTemplates).values({ userId: u.id, name: "TB", dayLabel: "Thu" }).returning();
  tplA = a.id; tplB = b.id;
  await app.db.insert(workoutTemplateExercises).values([
    { templateId: a.id, exerciseId: chest, orderIndex: 0, targetSets: 3, targetReps: 10, startWeightKg: 25 },
    { templateId: a.id, exerciseId: legpress, orderIndex: 1, targetSets: 3, targetReps: 12, startWeightKg: 30 },
    { templateId: b.id, exerciseId: chest, orderIndex: 0, targetSets: 3, targetReps: 10, startWeightKg: 25 },
  ]);
});
after(async () => { await app.db.delete(users).where(eq(users.email, EMAIL)); await app.close(); });

test("unauthenticated requests are 401", async () => {
  assert.equal((await call("GET", "/workouts/today")).statusCode, 401);
  assert.equal((await call("GET", "/dashboard/summary")).statusCode, 401);
});

test("no signup route exists — plain 404 for every variant", async () => {
  for (const p of ["/auth/register", "/auth/signup", "/register", "/signup", "/users"]) {
    for (const m of ["GET", "POST"]) {
      const r = await call(m, p, { email: "x@y.z", password: "whatever12345" });
      assert.equal(r.statusCode, 404, `${m} ${p}`);
    }
  }
});

test("wrong password 401, right password sets httpOnly cookie", async () => {
  assert.equal((await call("POST", "/auth/login", { email: EMAIL, password: "nope" })).statusCode, 401);
  const r = await call("POST", "/auth/login", { email: EMAIL, password: PW });
  assert.equal(r.statusCode, 200);
  const sc = String(r.headers["set-cookie"]);
  assert.match(sc, /gym_session=/); assert.match(sc, /HttpOnly/i);
  cookie = sc.split(";")[0];
  assert.equal((await call("GET", "/auth/me")).json().email, EMAIL);
});

test("login is rate limited to 5 attempts / 15 min / IP", async () => {
  const codes: number[] = [];
  for (let i = 0; i < 7; i++) codes.push((await call("POST", "/auth/login", { email: EMAIL, password: "bad" }, "10.9.9.9")).statusCode);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 429, 429]);
});

async function runSession(templateId: number, sets: { exerciseId: number; reps: number[]; weight: number }[], finish = true) {
  const s = (await call("POST", "/workouts/sessions", { templateId })).json();
  for (const e of sets) for (let i = 0; i < e.reps.length; i++) {
    const r = await call("POST", `/workouts/sessions/${s.id}/sets`, { exerciseId: e.exerciseId, setNumber: i + 1, weightKg: e.weight, reps: e.reps[i], isWarmup: false });
    assert.equal(r.statusCode, 201);
  }
  return { id: s.id as number, end: () => call("PATCH", `/workouts/sessions/${s.id}`, { end: true }) };
}
const weightOf = async (tpl: number, ex: number) =>
  (await app.db.select().from(workoutTemplateExercises).where(eq(workoutTemplateExercises.templateId, tpl))).find((r) => r.exerciseId === ex)!.startWeightKg;

test("starting a session twice resumes the open one", async () => {
  const a = (await call("POST", "/workouts/sessions", { templateId: tplA })).json();
  const b = (await call("POST", "/workouts/sessions", { templateId: tplA })).json();
  assert.equal(a.id, b.id);
  await call("PATCH", `/workouts/sessions/${a.id}`, { end: true });
});

test("missed rep -> no progression; weights unchanged", async () => {
  const s = await runSession(tplA, [{ exerciseId: chest, reps: [10, 9, 10], weight: 25 }, { exerciseId: legpress, reps: [12, 12], weight: 30 }]);
  const r = (await s.end()).json();
  assert.equal(r.progressions.filter((p: any) => p.applied).length, 0);
  assert.equal(await weightOf(tplA, chest), 25);
});

test("all hit -> chest +2.5 and leg press +5, applied exactly once", async () => {
  const s = await runSession(tplA, [{ exerciseId: chest, reps: [10, 10, 11], weight: 25 }, { exerciseId: legpress, reps: [12, 12, 12], weight: 30 }]);
  const pre = (await call("GET", `/workouts/sessions/${s.id}/progression`)).json();
  assert.equal(pre.preview, true);
  const r = (await s.end()).json();
  const by = Object.fromEntries(r.progressions.map((p: any) => [p.name, p]));
  assert.equal(by["Machine chest press"].toKg, 27.5);
  assert.equal(by["Leg press"].toKg, 35);
  assert.equal(await weightOf(tplA, chest), 27.5);
  assert.equal(await weightOf(tplA, legpress), 35);
  // same exercise in the OTHER template is synced
  assert.equal(await weightOf(tplB, chest), 27.5);
  // ending again does not re-apply
  const againRes = await call("PATCH", `/workouts/sessions/${s.id}`, { end: true });
  assert.equal(againRes.statusCode, 200);
  const again = againRes.json();
  assert.deepEqual(again.progressions, []);
  assert.equal(await weightOf(tplA, chest), 27.5);
});

test("same exercise trained again the same week: earned but NOT incremented twice", async () => {
  const s = await runSession(tplB, [{ exerciseId: chest, reps: [10, 10, 10], weight: 27.5 }]);
  const r = (await s.end()).json();
  const p = r.progressions[0];
  assert.equal(p.applied, false);
  assert.match(p.reason, /one increment per week/i);
  assert.equal(await weightOf(tplB, chest), 27.5);
});

test("today's workout shows LAST session weights and never invents recovery", async () => {
  const t = (await call("GET", "/workouts/templates")).json();
  const ta = t.find((x: any) => x.id === tplA);
  const cp = ta.exercises.find((e: any) => e.name === "Machine chest press");
  assert.ok(cp.last, "last session present");
  assert.equal(cp.last.sets.length, 3);
  const today = (await call("GET", "/workouts/today")).json();
  assert.equal(today.recovery, null);
});

test("cannot log sets into a finished session or someone else's id", async () => {
  const s = await runSession(tplA, [], true);
  await s.end();
  assert.equal((await call("POST", `/workouts/sessions/${s.id}/sets`, { exerciseId: chest, setNumber: 1, weightKg: 1, reps: 1 })).statusCode, 409);
  assert.equal((await call("GET", "/workouts/sessions/999999")).statusCode, 404);
});

test("exercise history aggregates per session", async () => {
  const h = (await call("GET", `/exercises/${chest}/history`)).json();
  assert.ok(h.history.length >= 2);
  assert.ok(h.history.every((x: any) => x.topWeightKg != null));
});

test("dashboard goals use real data and never fake progress", async () => {
  const d = (await call("GET", "/dashboard/summary")).json();
  assert.equal(d.steps, null);
  for (const g of d.goals) if (g.current == null) assert.equal(g.progress, null);
});
