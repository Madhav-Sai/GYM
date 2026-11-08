import type { FastifyInstance } from "fastify";
import { and, desc, eq, labMarkers, labResults, bodyMeasurements, goals, workoutTemplates, workoutTemplateExercises, sql } from "@gym/db";
import { WEEK_PLAN, CARDIO_PLANS, istDayLabel } from "@gym/types";
import { requireAuth } from "../auth";

// Where each goal's "current" value comes from.
const BODY_COL: Record<string, keyof typeof bodyMeasurements.$inferSelect> = {
  weight_kg: "weightKg", body_fat_pct: "bodyFatPct", skeletal_muscle_kg: "skeletalMuscleKg", waist_hip_ratio: "waistHipRatio",
};

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);
  const db = app.db;

  app.get("/dashboard/summary", async (req) => {
    const day = istDayLabel(), plan = WEEK_PLAN[day] ?? {};
    const [tpl] = await db.select().from(workoutTemplates).where(and(eq(workoutTemplates.userId, req.uid), eq(workoutTemplates.dayLabel, day)));
    const [n] = tpl ? await db.select({ c: sql<number>`count(*)::int` }).from(workoutTemplateExercises).where(eq(workoutTemplateExercises.templateId, tpl.id)) : [{ c: 0 }];

    const gs = await db.select().from(goals).where(eq(goals.userId, req.uid));
    const [body] = await db.select().from(bodyMeasurements).where(eq(bodyMeasurements.userId, req.uid)).orderBy(desc(bodyMeasurements.measuredAt)).limit(1);
    const goalOut = await Promise.all(gs.map(async (g) => {
      let current: number | null = null, asOf: string | null = null;
      const col = BODY_COL[g.metricKey];
      if (col && body) { current = (body[col] as number | null) ?? null; asOf = body.measuredAt; }
      else if (!col) {
        const [m] = await db.select({ v: labMarkers.value, d: labResults.testedAt }).from(labMarkers)
          .innerJoin(labResults, eq(labResults.id, labMarkers.labResultId))
          .where(and(eq(labResults.userId, req.uid), eq(labMarkers.markerKey, g.metricKey))).orderBy(desc(labResults.testedAt)).limit(1);
        if (m) { current = m.v; asOf = m.d; }
      }
      const start = g.startValue, span = start != null ? g.targetValue - start : 0;
      const progress = current != null && start != null && span !== 0 ? Math.max(0, Math.min(1, (current - start) / span)) : null;
      return { metricKey: g.metricKey, start, current, target: g.targetValue, direction: g.direction, targetDate: g.targetDate, note: g.note, asOf, progress };
    }));

    return {
      day, rest: !!plan.rest,
      workout: tpl ? { id: tpl.id, name: tpl.name, isPriority: tpl.isPriority, exerciseCount: n.c } : null,
      cardio: plan.cardio ? { key: plan.cardio, title: CARDIO_PLANS[plan.cardio].title, durationMin: CARDIO_PLANS[plan.cardio].durationMin } : null,
      goals: goalOut,
      // Not wired until Whoop (build step 6). null => UI shows "—".
      recovery: null, steps: null, sleep: null,
    };
  });
}
