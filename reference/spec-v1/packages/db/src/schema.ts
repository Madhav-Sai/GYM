import { sql } from "drizzle-orm";
import {
  pgTable, serial, integer, text, boolean, timestamp, date, doublePrecision as dbl, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const d = (name: string) => date(name, { mode: "string" });

// ───────── Users ─────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"), // 'admin'
  heightCm: dbl("height_cm"),
  sex: text("sex"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ───────── Body ─────────
export const bodyMeasurements = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  measuredAt: d("measured_at").notNull(),
  weightKg: dbl("weight_kg"),
  bodyFatPct: dbl("body_fat_pct"),
  skeletalMuscleKg: dbl("skeletal_muscle_kg"),
  leanBodyMassKg: dbl("lean_body_mass_kg"),
  visceralFatLevel: dbl("visceral_fat_level"),
  waistCm: dbl("waist_cm"),
  hipCm: dbl("hip_cm"),
  bmrKcal: dbl("bmr_kcal"),
  segmentalLeanLa: dbl("segmental_lean_la"),
  segmentalLeanRa: dbl("segmental_lean_ra"),
  segmentalLeanTrunk: dbl("segmental_lean_trunk"),
  segmentalLeanLl: dbl("segmental_lean_ll"),
  segmentalLeanRl: dbl("segmental_lean_rl"),
  source: text("source").notNull(), // 'inbody'|'manual'|'whoop'
  // Additions beyond §3 — needed to store the InBody sheet in §4 without loss:
  bodyFatMassKg: dbl("body_fat_mass_kg"),
  waistHipRatio: dbl("waist_hip_ratio"),
  bmi: dbl("bmi"),
  inbodyScore: dbl("inbody_score"),
  totalBodyWaterL: dbl("total_body_water_l"),
  proteinKg: dbl("protein_kg"),
  mineralKg: dbl("mineral_kg"),
  segmentalFlags: jsonb("segmental_flags"),
  targets: jsonb("targets"),
}, (t) => [index("body_user_date").on(t.userId, t.measuredAt)]);

// ───────── Bloods ─────────
export const labResults = pgTable("lab_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  testedAt: d("tested_at").notNull(),
  labName: text("lab_name"),
  pdfUrl: text("pdf_url"),
});
export const labMarkers = pgTable("lab_markers", {
  id: serial("id").primaryKey(),
  labResultId: integer("lab_result_id").notNull().references(() => labResults.id, { onDelete: "cascade" }),
  markerKey: text("marker_key").notNull(),
  value: dbl("value").notNull(),
  unit: text("unit"),
  refLow: dbl("ref_low"),
  refHigh: dbl("ref_high"),
  flag: text("flag").notNull(), // 'low'|'normal'|'high'
  tracked: boolean("tracked").notNull().default(false), // addition: "actively tracked" markers (§4)
}, (t) => [index("marker_key").on(t.markerKey)]);

// ───────── Training ─────────
export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  muscleGroup: text("muscle_group").notNull(),
  equipment: text("equipment").notNull(), // 'machine'|'cable'|'dumbbell'|'assisted'|'bodyweight'
  isUnilateral: boolean("is_unilateral").notNull().default(false),
  defaultSets: integer("default_sets").notNull().default(3),
  defaultReps: integer("default_reps").notNull().default(10),
  notes: text("notes"),
  incrementKg: dbl("increment_kg"), // addition: progression step (assisted: assist reduction)
});
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dayLabel: text("day_label").notNull(), // 'Mon'..'Sun'
  orderIndex: integer("order_index").notNull().default(0),
  isPriority: boolean("is_priority").notNull().default(false), // addition: Lower days
});
export const workoutTemplateExercises = pgTable("workout_template_exercises", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => workoutTemplates.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercises.id),
  orderIndex: integer("order_index").notNull(),
  targetSets: integer("target_sets").notNull(),
  targetReps: integer("target_reps").notNull(),
  startWeightKg: dbl("start_weight_kg"), // null = bodyweight
  restSeconds: integer("rest_seconds").notNull().default(90),
  lastProgressedAt: ts("last_progressed_at"), // addition: enforces one increment / week / exercise
});
export const workoutSessions = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => workoutTemplates.id, { onDelete: "set null" }),
  name: text("name"), // addition: label for free-form sessions
  startedAt: ts("started_at").notNull().defaultNow(),
  endedAt: ts("ended_at"),
  notes: text("notes"),
  whoopWorkoutId: text("whoop_workout_id"),
  perceivedEffort: integer("perceived_effort"),
}, (t) => [index("sessions_user_started").on(t.userId, t.startedAt)]);
export const setLogs = pgTable("set_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercises.id),
  setNumber: integer("set_number").notNull(),
  weightKg: dbl("weight_kg"),
  reps: integer("reps").notNull(),
  rpe: dbl("rpe"),
  isWarmup: boolean("is_warmup").notNull().default(false),
  completedAt: ts("completed_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("set_unique").on(t.sessionId, t.exerciseId, t.setNumber), index("sets_exercise").on(t.exerciseId)]);

// ───────── Cardio ─────────
export const cardioSessions = pgTable("cardio_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionDate: d("session_date").notNull(),
  type: text("type").notNull(), // 'steady'|'intervals'|'post_lift'
  machine: text("machine"),
  durationMin: dbl("duration_min"),
  avgHr: integer("avg_hr"), maxHr: integer("max_hr"),
  zone1Min: dbl("zone1_min"), zone2Min: dbl("zone2_min"), zone3Min: dbl("zone3_min"), zone4Min: dbl("zone4_min"), zone5Min: dbl("zone5_min"),
  inclinePct: dbl("incline_pct"), speedKmh: dbl("speed_kmh"), resistanceLevel: dbl("resistance_level"),
  whoopWorkoutId: text("whoop_workout_id"),
  strain: dbl("strain"),
});

// ───────── Whoop ─────────
export const whoopTokens = pgTable("whoop_tokens", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(), // single-use, rotates on every refresh
  expiresAt: ts("expires_at").notNull(),
  scopes: text("scopes"),
});
export const whoopRecovery = pgTable("whoop_recovery", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: d("date").notNull(), recoveryScore: dbl("recovery_score"), hrvMs: dbl("hrv_ms"), rhrBpm: dbl("rhr_bpm"), spo2: dbl("spo2"), skinTemp: dbl("skin_temp"),
}, (t) => [uniqueIndex("whoop_recovery_u").on(t.userId, t.date)]);
export const whoopSleep = pgTable("whoop_sleep", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: d("date").notNull(), sleepStart: ts("sleep_start"), sleepEnd: ts("sleep_end"),
  totalSleepMin: dbl("total_sleep_min"), sleepEfficiency: dbl("sleep_efficiency"), sleepConsistencyPct: dbl("sleep_consistency_pct"),
  remMin: dbl("rem_min"), deepMin: dbl("deep_min"), lightMin: dbl("light_min"), awakeMin: dbl("awake_min"), sleepDebtMin: dbl("sleep_debt_min"),
}, (t) => [uniqueIndex("whoop_sleep_u").on(t.userId, t.date)]);
export const whoopCycles = pgTable("whoop_cycles", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: d("date").notNull(), dayStrain: dbl("day_strain"), avgHr: integer("avg_hr"), maxHr: integer("max_hr"), kilojoules: dbl("kilojoules"),
}, (t) => [uniqueIndex("whoop_cycles_u").on(t.userId, t.date)]);
export const whoopWorkouts = pgTable("whoop_workouts", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  whoopId: text("whoop_id").notNull(), sportName: text("sport_name"), start: ts("start").notNull(), end: ts("end").notNull(),
  strain: dbl("strain"), avgHr: integer("avg_hr"), maxHr: integer("max_hr"), zoneDurationsJson: jsonb("zone_durations_json"),
}, (t) => [uniqueIndex("whoop_workouts_u").on(t.userId, t.whoopId)]);
export const dailySteps = pgTable("daily_steps", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: d("date").notNull(), steps: integer("steps").notNull(), source: text("source").notNull(), // 'whoop'|'healthkit'
}, (t) => [uniqueIndex("daily_steps_u").on(t.userId, t.date)]);

// ───────── Diet ─────────
export const foods = pgTable("foods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), nameLocal: text("name_local"), category: text("category").notNull(),
  isVeg: boolean("is_veg").notNull(),
  kcalPer100g: dbl("kcal_per_100g").notNull(), proteinG: dbl("protein_g").notNull(), carbsG: dbl("carbs_g").notNull(), fatG: dbl("fat_g").notNull(),
  fiberG: dbl("fiber_g"), saturatedFatG: dbl("saturated_fat_g"), omega3Mg: dbl("omega3_mg"),
  vegAlternativeFoodId: integer("veg_alternative_food_id"), // addition: §5.4 (mirrors meal_slot_items.veg_alternative_food_id)
  servingG: dbl("serving_g"), notes: text("notes"), // additions: unit normalisation
});
export const mealPlans = pgTable("meal_plans", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), dayType: text("day_type").notNull(), isActive: boolean("is_active").notNull().default(true),
});
export const mealSlots = pgTable("meal_slots", {
  id: serial("id").primaryKey(), mealPlanId: integer("meal_plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  slotName: text("slot_name").notNull(), timeOfDay: text("time_of_day").notNull(), orderIndex: integer("order_index").notNull(),
});
export const mealSlotItems = pgTable("meal_slot_items", {
  id: serial("id").primaryKey(), slotId: integer("slot_id").notNull().references(() => mealSlots.id, { onDelete: "cascade" }),
  foodId: integer("food_id").notNull().references(() => foods.id), quantityG: dbl("quantity_g").notNull(),
  isOptional: boolean("is_optional").notNull().default(false), vegAlternativeFoodId: integer("veg_alternative_food_id").references(() => foods.id),
});
export const mealLogs = pgTable("meal_logs", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loggedAt: ts("logged_at").notNull().defaultNow(), slotId: integer("slot_id").references(() => mealSlots.id),
  foodId: integer("food_id").notNull().references(() => foods.id), quantityG: dbl("quantity_g").notNull(), wasSubstituted: boolean("was_substituted").notNull().default(false),
});

// ───────── Supplements ─────────
export const supplements = pgTable("supplements", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), dose: text("dose").notNull(), unit: text("unit"), frequency: text("frequency").notNull(), // daily|weekly|monthly
  scheduleJson: jsonb("schedule_json"), requiresFat: boolean("requires_fat").notNull().default(false), notes: text("notes"),
  active: boolean("active").notNull().default(true), startDate: d("start_date"), endDate: d("end_date"),
});
export const supplementLogs = pgTable("supplement_logs", {
  id: serial("id").primaryKey(), supplementId: integer("supplement_id").notNull().references(() => supplements.id, { onDelete: "cascade" }),
  takenAt: ts("taken_at").notNull().defaultNow(), skipped: boolean("skipped").notNull().default(false), skipReason: text("skip_reason"),
});

// ───────── Goals ─────────
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(), userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(), targetValue: dbl("target_value").notNull(), targetDate: d("target_date"),
  createdAt: ts("created_at").notNull().defaultNow(), achievedAt: ts("achieved_at"),
  // additions: needed to draw "current / target" bars honestly (§5.7)
  startValue: dbl("start_value"), direction: text("direction").notNull().default("up"), // 'up'|'down'
  note: text("note"),
});

export { sql };
