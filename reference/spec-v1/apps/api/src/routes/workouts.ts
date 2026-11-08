import type { FastifyInstance } from "fastify";
import {
  and, asc, desc, eq, inArray, isNull, sql,
  workoutTemplates, workoutTemplateExercises, workoutSessions, setLogs, exercises,
} from "@gym/db";
import { CARDIO_PLANS, WEEK_PLAN, istDayLabel, patchSessionSchema, setLogSchema, startSessionSchema } from "@gym/types";
import { requireAuth } from "../auth";
import { computeProgression } from "../progress";

const idParam = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  const db = app.db;

  async function templateWithExercises(userId: number, templateId: number) {
    const [tpl] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, userId)));
    if (!tpl) return null;
    const rows = await db
      .select({ row: workoutTemplateExercises, ex: exercises })
      .from(workoutTemplateExercises)
      .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
      .where(eq(workoutTemplateExercises.templateId, templateId))
      .orderBy(asc(workoutTemplateExercises.orderIndex));
    // Last COMPLETED session per exercise — shown prominently while logging (spec §5.1).
    const ids = rows.map((r) => r.ex.id);
    const hist = ids.length
      ? await db.select({ exerciseId: setLogs.exerciseId, sessionId: setLogs.sessionId, setNumber: setLogs.setNumber, reps: setLogs.reps, weightKg: setLogs.weightKg, startedAt: workoutSessions.startedAt })
          .from(setLogs).innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
          .where(and(eq(workoutSessions.userId, userId), inArray(setLogs.exerciseId, ids), eq(setLogs.isWarmup, false), sql`${workoutSessions.endedAt} is not null`))
          .orderBy(desc(workoutSessions.startedAt), asc(setLogs.setNumber))
      : [];
    const last = new Map<number, { date: string; sets: { reps: number; weightKg: number | null }[] }>();
    const seenSession = new Map<number, number>();
    for (const h of hist) {
      if (!seenSession.has(h.exerciseId)) { seenSession.set(h.exerciseId, h.sessionId); last.set(h.exerciseId, { date: h.startedAt.toISOString(), sets: [] }); }
      if (seenSession.get(h.exerciseId) === h.sessionId) last.get(h.exerciseId)!.sets.push({ reps: h.reps, weightKg: h.weightKg });
    }
    return {
      ...tpl,
      exercises: rows.map(({ row, ex }) => ({
        templateExerciseId: row.id, exerciseId: ex.id, name: ex.name, muscleGroup: ex.muscleGroup, equipment: ex.equipment, notes: ex.notes,
        incrementKg: ex.incrementKg, targetSets: row.targetSets, targetReps: row.targetReps, startWeightKg: row.startWeightKg,
        restSeconds: row.restSeconds, last: last.get(ex.id) ?? null,
      })),
    };
  }

  app.get("/workouts/today", async (req) => {
    const day = istDayLabel();
    const plan = WEEK_PLAN[day] ?? {};
    const [tpl] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.userId, req.uid), eq(workoutTemplates.dayLabel, day)));
    const template = tpl ? await templateWithExercises(req.uid, tpl.id) : null;
    const [open] = tpl
      ? await db.select().from(workoutSessions).where(and(eq(workoutSessions.userId, req.uid), eq(workoutSessions.templateId, tpl.id), isNull(workoutSessions.endedAt))).orderBy(desc(workoutSessions.startedAt)).limit(1)
      : [];
    return {
      day, rest: !!plan.rest, template,
      cardio: plan.cardio ? CARDIO_PLANS[plan.cardio] : null,
      openSessionId: open?.id ?? null,
      recovery: null, // Whoop not connected yet — UI renders a dash, never a made-up score.
    };
  });

  app.get("/workouts/templates", async (req) => {
    const tpls = await db.select().from(workoutTemplates).where(eq(workoutTemplates.userId, req.uid)).orderBy(asc(workoutTemplates.orderIndex));
    return Promise.all(tpls.map((t) => templateWithExercises(req.uid, t.id)));
  });

  app.post("/workouts/sessions", async (req, reply) => {
    const b = startSessionSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "Invalid input" });
    const templateId = b.data.templateId ?? null;
    if (templateId) {
      const [t] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.userId, req.uid)));
      if (!t) return reply.code(404).send({ error: "Template not found" });
      const [open] = await db.select().from(workoutSessions).where(and(eq(workoutSessions.userId, req.uid), eq(workoutSessions.templateId, templateId), isNull(workoutSessions.endedAt))).limit(1);
      if (open) return open; // resume instead of duplicating
    }
    const [s] = await db.insert(workoutSessions).values({ userId: req.uid, templateId, name: b.data.name ?? null }).returning();
    return reply.code(201).send(s);
  });

  async function ownSession(userId: number, id: number | null) {
    if (!id) return null;
    const [s] = await db.select().from(workoutSessions).where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)));
    return s ?? null;
  }

  app.get<{ Params: { id: string } }>("/workouts/sessions/:id", async (req, reply) => {
    const s = await ownSession(req.uid, idParam(req.params.id));
    if (!s) return reply.code(404).send({ error: "Not found" });
    const sets = await db.select().from(setLogs).where(eq(setLogs.sessionId, s.id)).orderBy(asc(setLogs.exerciseId), asc(setLogs.setNumber));
    return { ...s, sets };
  });

  app.post<{ Params: { id: string } }>("/workouts/sessions/:id/sets", async (req, reply) => {
    const s = await ownSession(req.uid, idParam(req.params.id));
    if (!s) return reply.code(404).send({ error: "Not found" });
    if (s.endedAt) return reply.code(409).send({ error: "Session already finished" });
    const b = setLogSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? "Invalid input" });
    const [ex] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, b.data.exerciseId));
    if (!ex) return reply.code(404).send({ error: "Unknown exercise" });
    const v = { sessionId: s.id, exerciseId: b.data.exerciseId, setNumber: b.data.setNumber, weightKg: b.data.weightKg, reps: b.data.reps, rpe: b.data.rpe ?? null, isWarmup: b.data.isWarmup, completedAt: new Date() };
    const [row] = await db.insert(setLogs).values(v)
      .onConflictDoUpdate({ target: [setLogs.sessionId, setLogs.exerciseId, setLogs.setNumber], set: v }).returning();
    return reply.code(201).send(row);
  });

  app.delete<{ Params: { id: string }; Querystring: { exerciseId?: string; setNumber?: string } }>("/workouts/sessions/:id/sets", async (req, reply) => {
    const s = await ownSession(req.uid, idParam(req.params.id));
    const exerciseId = idParam(req.query.exerciseId), setNumber = idParam(req.query.setNumber);
    if (!s || !exerciseId || !setNumber) return reply.code(404).send({ error: "Not found" });
    if (s.endedAt) return reply.code(409).send({ error: "Session already finished" });
    await db.delete(setLogs).where(and(eq(setLogs.sessionId, s.id), eq(setLogs.exerciseId, exerciseId), eq(setLogs.setNumber, setNumber)));
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>("/workouts/sessions/:id", async (req, reply) => {
    const s = await ownSession(req.uid, idParam(req.params.id));
    if (!s) return reply.code(404).send({ error: "Not found" });
    const b = patchSessionSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "Invalid input" });
    const finishing = !!b.data.end && !s.endedAt;
    const changes = {
      ...(b.data.notes !== undefined && { notes: b.data.notes }),
      ...(b.data.perceivedEffort !== undefined && { perceivedEffort: b.data.perceivedEffort }),
      ...(finishing && { endedAt: new Date() }),
    };
    // Re-sending "finish" (double tap / retry) is a no-op, not an error.
    const [updated] = Object.keys(changes).length
      ? await db.update(workoutSessions).set(changes).where(eq(workoutSessions.id, s.id)).returning()
      : [s];
    // Progression is applied exactly once, on the transition to finished.
    const progressions = finishing && s.templateId ? await computeProgression(db, req.uid, s.id, s.templateId, true) : [];
    return { session: updated, progressions };
  });

  // Preview only — meaningful BEFORE the session is finished (afterwards weights have already moved).
  app.get<{ Params: { id: string } }>("/workouts/sessions/:id/progression", async (req, reply) => {
    const s = await ownSession(req.uid, idParam(req.params.id));
    if (!s) return reply.code(404).send({ error: "Not found" });
    if (!s.templateId) return { progressions: [] };
    return { progressions: await computeProgression(db, req.uid, s.id, s.templateId, false), preview: !s.endedAt };
  });

  app.get("/exercises", async () => db.select().from(exercises).orderBy(asc(exercises.name)));

  app.get<{ Params: { id: string } }>("/exercises/:id/history", async (req, reply) => {
    const id = idParam(req.params.id);
    if (!id) return reply.code(404).send({ error: "Not found" });
    const rows = await db.select({ sessionId: setLogs.sessionId, startedAt: workoutSessions.startedAt, reps: setLogs.reps, weightKg: setLogs.weightKg, setNumber: setLogs.setNumber })
      .from(setLogs).innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
      .where(and(eq(workoutSessions.userId, req.uid), eq(setLogs.exerciseId, id), eq(setLogs.isWarmup, false)))
      .orderBy(asc(workoutSessions.startedAt), asc(setLogs.setNumber));
    const by = new Map<number, { date: string; topWeightKg: number | null; volume: number; sets: { reps: number; weightKg: number | null }[] }>();
    for (const r of rows) {
      const e = by.get(r.sessionId) ?? { date: r.startedAt.toISOString(), topWeightKg: null, volume: 0, sets: [] };
      e.sets.push({ reps: r.reps, weightKg: r.weightKg });
      e.volume += r.reps * (r.weightKg ?? 0);
      if (r.weightKg != null) e.topWeightKg = Math.max(e.topWeightKg ?? 0, r.weightKg);
      by.set(r.sessionId, e);
    }
    const [ex] = await db.select().from(exercises).where(eq(exercises.id, id));
    return { exercise: ex ?? null, history: [...by.values()].slice(-60) };
  });
}
