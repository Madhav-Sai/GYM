import { eq } from "drizzle-orm";
import {
  createDb, users, bodyMeasurements, labResults, labMarkers, goals, exercises, workoutTemplates,
  workoutTemplateExercises, foods, mealPlans, mealSlots, supplements,
} from "../index";
import * as D from "./data";

// pnpm seed — idempotent per section; run after `pnpm seed:admin`.
const { db, client } = createDb(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
if (!admin) { console.error("No admin user. Run `pnpm seed:admin` first."); process.exit(1); }
const uid = admin.id;
const has = async (table: any) => (await db.select({ id: table.userId }).from(table).where(eq(table.userId, uid)).limit(1)).length > 0;

// Foods (global, upsert by name)
for (const [name, category, isVeg, kcal, p, c, f, fib, o3, opt] of D.FOODS) {
  const row = { name, nameLocal: opt?.local ?? null, category, isVeg, kcalPer100g: kcal, proteinG: p, carbsG: c, fatG: f, fiberG: fib, omega3Mg: o3 ?? null, servingG: opt?.servingG ?? null, notes: opt?.notes ?? null };
  await db.insert(foods).values(row).onConflictDoUpdate({ target: foods.name, set: row });
}
const foodRows = await db.select().from(foods);
const fid = new Map(foodRows.map((f) => [f.name, f.id]));
for (const [nonVeg, veg] of Object.entries(D.VEG_ALT)) {
  if (!fid.has(nonVeg) || !fid.has(veg)) throw new Error(`Bad VEG_ALT mapping ${nonVeg} -> ${veg}`);
  await db.update(foods).set({ vegAlternativeFoodId: fid.get(veg)! }).where(eq(foods.id, fid.get(nonVeg)!));
}
console.log(`foods: ${foodRows.length}`);

// Exercises (global, upsert by name)
for (const [name, group, equipment, inc, notes] of D.EXERCISES) {
  const row = { name, muscleGroup: group, equipment, incrementKg: inc, notes, isUnilateral: false };
  await db.insert(exercises).values(row).onConflictDoUpdate({ target: exercises.name, set: row });
}
const exRows = await db.select().from(exercises);
const eid = new Map(exRows.map((e) => [e.name, e.id]));

if (!(await has(workoutTemplates))) {
  let order = 0;
  for (const t of D.TEMPLATES) {
    const [tpl] = await db.insert(workoutTemplates).values({ userId: uid, name: t.name, dayLabel: t.day, isPriority: t.priority, orderIndex: order++ }).returning();
    await db.insert(workoutTemplateExercises).values(t.items.map(([n, sets, reps, kg], i) => {
      if (!eid.has(n)) throw new Error(`Unknown exercise ${n}`);
      return { templateId: tpl.id, exerciseId: eid.get(n)!, orderIndex: i, targetSets: sets, targetReps: reps, startWeightKg: kg };
    }));
  }
  console.log("templates: 4");
} else console.log("templates: exist, skipped");

if (!(await has(bodyMeasurements))) {
  await db.insert(bodyMeasurements).values({ userId: uid, ...D.BODY });
  console.log("body: InBody 2026-10-02");
}

if (!(await has(labResults))) {
  const [lab] = await db.insert(labResults).values({ userId: uid, testedAt: D.LAB_DATE, labName: D.LAB_NAME }).returning();
  await db.insert(labMarkers).values(D.LABS.map(([k, v, unit, lo, hi, flag]) => ({
    labResultId: lab.id, markerKey: k, value: v, unit, refLow: lo, refHigh: hi, flag, tracked: D.TRACKED_MARKERS.includes(k),
  })));
  console.log(`labs: ${D.LABS.length} markers`);
}

if (!(await has(goals))) {
  await db.insert(goals).values(D.GOALS.map(([k, start, target, dir, date, note]) => ({ userId: uid, metricKey: k, startValue: start, targetValue: target, direction: dir, targetDate: date, note })));
  console.log(`goals: ${D.GOALS.length}`);
}

if (!(await has(mealPlans))) {
  for (const dayType of D.DAY_TYPES) {
    const [plan] = await db.insert(mealPlans).values({ userId: uid, name: `${dayType[0].toUpperCase()}${dayType.slice(1)} day`, dayType }).returning();
    await db.insert(mealSlots).values(D.SLOTS.map(([slotName, timeOfDay], i) => ({ mealPlanId: plan.id, slotName, timeOfDay, orderIndex: i })));
  }
  console.log("meal plans: 3 (slots only — the spec gives no per-slot items)");
}

if (!(await has(supplements))) {
  await db.insert(supplements).values(D.SUPPLEMENTS.map((s) => ({ userId: uid, ...s, scheduleJson: s.scheduleJson as any })));
  console.log(`supplements: ${D.SUPPLEMENTS.length}`);
}
await client.end();
console.log("seed done");
