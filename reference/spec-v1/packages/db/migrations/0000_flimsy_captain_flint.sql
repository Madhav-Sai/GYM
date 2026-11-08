CREATE TABLE "body_measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"measured_at" date NOT NULL,
	"weight_kg" double precision,
	"body_fat_pct" double precision,
	"skeletal_muscle_kg" double precision,
	"lean_body_mass_kg" double precision,
	"visceral_fat_level" double precision,
	"waist_cm" double precision,
	"hip_cm" double precision,
	"bmr_kcal" double precision,
	"segmental_lean_la" double precision,
	"segmental_lean_ra" double precision,
	"segmental_lean_trunk" double precision,
	"segmental_lean_ll" double precision,
	"segmental_lean_rl" double precision,
	"source" text NOT NULL,
	"body_fat_mass_kg" double precision,
	"waist_hip_ratio" double precision,
	"bmi" double precision,
	"inbody_score" double precision,
	"total_body_water_l" double precision,
	"protein_kg" double precision,
	"mineral_kg" double precision,
	"segmental_flags" jsonb,
	"targets" jsonb
);
--> statement-breakpoint
CREATE TABLE "cardio_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_date" date NOT NULL,
	"type" text NOT NULL,
	"machine" text,
	"duration_min" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"zone1_min" double precision,
	"zone2_min" double precision,
	"zone3_min" double precision,
	"zone4_min" double precision,
	"zone5_min" double precision,
	"incline_pct" double precision,
	"speed_kmh" double precision,
	"resistance_level" double precision,
	"whoop_workout_id" text,
	"strain" double precision
);
--> statement-breakpoint
CREATE TABLE "daily_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"steps" integer NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"muscle_group" text NOT NULL,
	"equipment" text NOT NULL,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"default_sets" integer DEFAULT 3 NOT NULL,
	"default_reps" integer DEFAULT 10 NOT NULL,
	"notes" text,
	"increment_kg" double precision,
	CONSTRAINT "exercises_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_local" text,
	"category" text NOT NULL,
	"is_veg" boolean NOT NULL,
	"kcal_per_100g" double precision NOT NULL,
	"protein_g" double precision NOT NULL,
	"carbs_g" double precision NOT NULL,
	"fat_g" double precision NOT NULL,
	"fiber_g" double precision,
	"saturated_fat_g" double precision,
	"omega3_mg" double precision,
	"veg_alternative_food_id" integer,
	"serving_g" double precision,
	"notes" text,
	CONSTRAINT "foods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"metric_key" text NOT NULL,
	"target_value" double precision NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"achieved_at" timestamp with time zone,
	"start_value" double precision,
	"direction" text DEFAULT 'up' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "lab_markers" (
	"id" serial PRIMARY KEY NOT NULL,
	"lab_result_id" integer NOT NULL,
	"marker_key" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"ref_low" double precision,
	"ref_high" double precision,
	"flag" text NOT NULL,
	"tracked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tested_at" date NOT NULL,
	"lab_name" text,
	"pdf_url" text
);
--> statement-breakpoint
CREATE TABLE "meal_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slot_id" integer,
	"food_id" integer NOT NULL,
	"quantity_g" double precision NOT NULL,
	"was_substituted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"day_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_slot_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"quantity_g" double precision NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"veg_alternative_food_id" integer
);
--> statement-breakpoint
CREATE TABLE "meal_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_plan_id" integer NOT NULL,
	"slot_name" text NOT NULL,
	"time_of_day" text NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"set_number" integer NOT NULL,
	"weight_kg" double precision,
	"reps" integer NOT NULL,
	"rpe" double precision,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplement_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplement_id" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"skip_reason" text
);
--> statement-breakpoint
CREATE TABLE "supplements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"dose" text NOT NULL,
	"unit" text,
	"frequency" text NOT NULL,
	"schedule_json" jsonb,
	"requires_fat" boolean DEFAULT false NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"start_date" date,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"height_cm" double precision,
	"sex" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "whoop_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"day_strain" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"kilojoules" double precision
);
--> statement-breakpoint
CREATE TABLE "whoop_recovery" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"recovery_score" double precision,
	"hrv_ms" double precision,
	"rhr_bpm" double precision,
	"spo2" double precision,
	"skin_temp" double precision
);
--> statement-breakpoint
CREATE TABLE "whoop_sleep" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"sleep_start" timestamp with time zone,
	"sleep_end" timestamp with time zone,
	"total_sleep_min" double precision,
	"sleep_efficiency" double precision,
	"sleep_consistency_pct" double precision,
	"rem_min" double precision,
	"deep_min" double precision,
	"light_min" double precision,
	"awake_min" double precision,
	"sleep_debt_min" double precision
);
--> statement-breakpoint
CREATE TABLE "whoop_tokens" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text
);
--> statement-breakpoint
CREATE TABLE "whoop_workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"whoop_id" text NOT NULL,
	"sport_name" text,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"strain" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"zone_durations_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer,
	"name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text,
	"whoop_workout_id" text,
	"perceived_effort" integer
);
--> statement-breakpoint
CREATE TABLE "workout_template_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" integer NOT NULL,
	"start_weight_kg" double precision,
	"rest_seconds" integer DEFAULT 90 NOT NULL,
	"last_progressed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"day_label" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cardio_sessions" ADD CONSTRAINT "cardio_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_steps" ADD CONSTRAINT "daily_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_markers" ADD CONSTRAINT "lab_markers_lab_result_id_lab_results_id_fk" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slot_items" ADD CONSTRAINT "meal_slot_items_slot_id_meal_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slot_items" ADD CONSTRAINT "meal_slot_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slot_items" ADD CONSTRAINT "meal_slot_items_veg_alternative_food_id_foods_id_fk" FOREIGN KEY ("veg_alternative_food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_supplement_id_supplements_id_fk" FOREIGN KEY ("supplement_id") REFERENCES "public"."supplements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whoop_cycles" ADD CONSTRAINT "whoop_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whoop_recovery" ADD CONSTRAINT "whoop_recovery_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whoop_sleep" ADD CONSTRAINT "whoop_sleep_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whoop_tokens" ADD CONSTRAINT "whoop_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whoop_workouts" ADD CONSTRAINT "whoop_workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_user_date" ON "body_measurements" USING btree ("user_id","measured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_steps_u" ON "daily_steps" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "marker_key" ON "lab_markers" USING btree ("marker_key");--> statement-breakpoint
CREATE UNIQUE INDEX "set_unique" ON "set_logs" USING btree ("session_id","exercise_id","set_number");--> statement-breakpoint
CREATE INDEX "sets_exercise" ON "set_logs" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whoop_cycles_u" ON "whoop_cycles" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "whoop_recovery_u" ON "whoop_recovery" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "whoop_sleep_u" ON "whoop_sleep" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "whoop_workouts_u" ON "whoop_workouts" USING btree ("user_id","whoop_id");--> statement-breakpoint
CREATE INDEX "sessions_user_started" ON "workout_sessions" USING btree ("user_id","started_at");