import { and, eq, inArray, isNotNull, gte, workoutTemplateExercises, workoutTemplates, exercises, setLogs, type Db } from "@gym/db";
import { evaluateProgression, istWeekStart, type ProgressionKind } from "@gym/types";

export interface ProgressionItem {
  exerciseId: number; name: string; earned: boolean; applied: boolean;
  fromKg: number | null; toKg: number | null; reason: string;
}

const kindOf = (equipment: string): ProgressionKind =>
  equipment === "assisted" ? "assisted" : equipment === "dumbbell" ? "dumbbell" : equipment === "bodyweight" ? "bodyweight" : "machine";

/**
 * Evaluates every exercise of the session's template. With apply=true, writes the new start weight to
 * EVERY template row of that exercise (so Mon/Thu chest press stay in sync) and stamps last_progressed_at.
 * Only one increment per week per exercise (IST week, Monday start).
 */
export async function computeProgression(db: Db, userId: number, sessionId: number, templateId: number, apply: boolean): Promise<ProgressionItem[]> {
  const rows = await db
    .select({ row: workoutTemplateExercises, ex: exercises })
    .from(workoutTemplateExercises)
    .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
    .where(eq(workoutTemplateExercises.templateId, templateId))
    .orderBy(workoutTemplateExercises.orderIndex);
  if (!rows.length) return [];

  const logs = await db.select().from(setLogs).where(and(eq(setLogs.sessionId, sessionId), inArray(setLogs.exerciseId, rows.map((r) => r.ex.id))));
  const weekStart = new Date(`${istWeekStart()}T00:00:00+05:30`);

  // Exercises already progressed this week (any of the user's template rows).
  const done = await db
    .select({ exerciseId: workoutTemplateExercises.exerciseId })
    .from(workoutTemplateExercises)
    .innerJoin(workoutTemplates, eq(workoutTemplates.id, workoutTemplateExercises.templateId))
    .where(and(eq(workoutTemplates.userId, userId), isNotNull(workoutTemplateExercises.lastProgressedAt), gte(workoutTemplateExercises.lastProgressedAt, weekStart)));
  const doneThisWeek = new Set(done.map((d) => d.exerciseId));

  const out: ProgressionItem[] = [];
  for (const { row, ex } of rows) {
    const r = evaluateProgression({
      kind: kindOf(ex.equipment), incrementKg: ex.incrementKg, targetSets: row.targetSets, targetReps: row.targetReps,
      currentWeightKg: row.startWeightKg,
      sets: logs.filter((l) => l.exerciseId === ex.id).map((l) => ({ reps: l.reps, weightKg: l.weightKg, isWarmup: l.isWarmup })),
    });
    let applied = false, reason = r.reason;
    if (r.earned && doneThisWeek.has(ex.id)) reason = "Already progressed this week — one increment per week.";
    else if (r.earned && apply) {
      const mine = db.select({ id: workoutTemplates.id }).from(workoutTemplates).where(eq(workoutTemplates.userId, userId));
      await db.update(workoutTemplateExercises).set({ startWeightKg: r.nextWeightKg, lastProgressedAt: new Date() })
        .where(and(eq(workoutTemplateExercises.exerciseId, ex.id), inArray(workoutTemplateExercises.templateId, mine)));
      doneThisWeek.add(ex.id);
      applied = true;
    }
    out.push({ exerciseId: ex.id, name: ex.name, earned: r.earned && !(doneThisWeek.has(ex.id) && !applied), applied, fromKg: row.startWeightKg, toKg: r.earned ? r.nextWeightKg : row.startWeightKg, reason });
  }
  return out;
}
