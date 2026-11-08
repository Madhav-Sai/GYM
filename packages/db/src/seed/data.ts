// Spec §4 seed data, transcribed as-is. Anything converted/assumed is called out in `notes`.

export const BODY = {
  measuredAt: "2026-10-02", source: "inbody",
  weightKg: 72.9, bodyFatPct: 30.5, bodyFatMassKg: 22.2, skeletalMuscleKg: 28.4, leanBodyMassKg: 50.7,
  visceralFatLevel: 10, waistHipRatio: 1.03, bmrKcal: 1465, bmi: 24.6, inbodyScore: 63,
  totalBodyWaterL: 37.2, proteinKg: 10.1, mineralKg: 3.41,
  segmentalLeanLa: 3.03, segmentalLeanRa: 2.99, segmentalLeanTrunk: 24.8, segmentalLeanLl: 7.93, segmentalLeanRl: 7.92,
  segmentalFlags: { la: "normal", ra: "normal", trunk: "normal", ll: "under", rl: "under" },
  targets: { weight: 65.0, fat_control: -12.5, muscle_control: 4.6 },
};

// [key, value, unit, refLow, refHigh, flag]
type M = [string, number, string, number | null, number | null, "low" | "normal" | "high"];
export const LAB_DATE = "2026-08-12";
export const LAB_NAME = "Orange Health Labs";
export const LABS: M[] = [
  ["total_chol", 207, "mg/dL", null, 200, "high"], ["tg", 125, "mg/dL", null, 150, "normal"], ["hdl", 33, "mg/dL", 50, null, "low"],
  ["ldl", 149, "mg/dL", null, 100, "high"], ["vldl", 25, "mg/dL", null, 30, "normal"], ["non_hdl", 174, "mg/dL", null, 130, "high"],
  ["chol_hdl_ratio", 6.0, "", 3.3, 4.4, "high"], ["ldl_hdl_ratio", 4.5, "", 0.5, 3, "high"],
  ["vitamin_d", 11.8, "ng/mL", 20, null, "low"], ["b12", 389, "pg/mL", 187, 883, "normal"],
  ["hba1c", 5.3, "%", null, 5.7, "normal"], ["random_glucose", 89, "mg/dL", 70, 140, "normal"], ["mean_glucose", 105, "mg/dL", null, null, "normal"],
  ["ast", 22, "", null, null, "normal"], ["alt", 18, "", null, null, "normal"], ["alp", 97, "", null, null, "normal"], ["ggt", 21, "", null, null, "normal"],
  ["bilirubin_total", 0.73, "", null, null, "normal"], ["albumin", 4.8, "", null, null, "normal"],
  ["creatinine", 0.69, "", null, null, "normal"], ["egfr", 132, "", null, null, "normal"], ["urea", 17, "mg/dL", 19, 43, "low"], ["uric_acid", 6.8, "", null, null, "normal"],
  ["sodium", 138, "", null, null, "normal"], ["potassium", 4.11, "", null, null, "normal"], ["chloride", 106, "", null, null, "normal"],
  ["calcium", 9.8, "mg/dL", null, null, "normal"], ["phosphorus", 3.9, "", null, null, "normal"],
  ["tsh", 1.1457, "", null, null, "normal"], ["t3", 0.93, "", null, null, "normal"], ["t4", 7.56, "", null, null, "normal"],
  ["hb", 15.5, "", null, null, "normal"], ["rbc", 5.35, "", null, null, "normal"], ["hct", 47.3, "", null, null, "normal"], ["mcv", 88.4, "", null, null, "normal"],
  ["wbc", 7010, "", null, null, "normal"], ["platelets", 247, "", null, null, "normal"], ["esr", 2, "", null, null, "normal"],
];
export const TRACKED_MARKERS = ["vitamin_d", "hdl", "ldl", "total_chol", "non_hdl", "chol_hdl_ratio", "ldl_hdl_ratio"];

// metricKey, start, target, direction, date, note
export const GOALS: [string, number, number, "up" | "down", string, string | null][] = [
  ["vitamin_d", 11.8, 30, "up", "2026-12-25", "30+"],
  ["hdl", 33, 45, "up", "2027-04-01", "45+"],
  ["ldl", 149, 100, "down", "2027-04-01", "<100"],
  ["body_fat_pct", 30.5, 20, "down", "2027-04-01", "18-20"],
  ["skeletal_muscle_kg", 28.4, 33, "up", "2027-04-01", null],
  ["waist_hip_ratio", 1.03, 0.9, "down", "2027-04-01", "<0.90"],
  ["weight_kg", 72.9, 68, "down", "2027-04-01", "66-68"],
];

// name, group, equipment, incrementKg, notes
export const EXERCISES: [string, string, string, number | null, string | null][] = [
  ["Machine chest press", "chest", "machine", 2.5, null],
  ["Lat pulldown front", "back", "machine", 2.5, null],
  ["Machine shoulder press", "shoulders", "machine", 2.5, null],
  ["Seated cable row", "back", "cable", 2.5, null],
  ["Machine chest fly", "chest", "machine", 2.5, null],
  ["Tricep rope pushdown", "triceps", "cable", 2.5, null],
  ["Leg press", "quads", "machine", 5, null],
  ["Seated leg curl", "hamstrings", "machine", 2.5, null],
  ["Leg extension", "quads", "machine", 2.5, null],
  ["Standing calf raise", "calves", "machine", 2.5, null],
  ["Cable face pull", "rear delts", "cable", 2.5, null],
  ["Lat pulldown narrow", "back", "machine", 2.5, null],
  ["Assisted pullup", "back", "assisted", 5, "Weight is ASSIST — it goes DOWN as you get stronger."],
  ["Cable lateral raise", "shoulders", "cable", 2.5, null],
  ["Cable bicep curl", "biceps", "cable", 2.5, null],
  ["Rear delt fly", "rear delts", "machine", 2.5, null],
  ["Goblet squat", "quads", "dumbbell", null, "Progresses to the next dumbbell size."],
  ["Seated calf raise", "calves", "machine", 2.5, null],
  ["Plank", "core", "bodyweight", null, "Reps column = SECONDS held."],
];

// [exercise, sets, reps, startKg|null]
type TX = [string, number, number, number | null];
export const TEMPLATES: { name: string; day: string; priority: boolean; items: TX[] }[] = [
  { name: "Upper A", day: "Mon", priority: false, items: [
    ["Machine chest press", 3, 10, 25], ["Lat pulldown front", 3, 10, 35], ["Machine shoulder press", 3, 10, 22.7],
    ["Seated cable row", 3, 10, 38.6], ["Machine chest fly", 3, 12, 31.8], ["Tricep rope pushdown", 3, 12, 10]] },
  { name: "Lower A", day: "Tue", priority: true, items: [
    ["Leg press", 3, 12, 30], ["Seated leg curl", 3, 12, 15], ["Leg extension", 3, 12, 15],
    ["Standing calf raise", 3, 15, 15], ["Cable face pull", 3, 15, 10]] },
  { name: "Upper B", day: "Thu", priority: false, items: [
    ["Lat pulldown narrow", 3, 10, 32], ["Machine chest press", 3, 10, 25], ["Assisted pullup", 3, 8, 65],
    ["Cable lateral raise", 3, 12, 2.5], ["Cable bicep curl", 3, 12, 10], ["Rear delt fly", 3, 15, 15]] },
  { name: "Lower B", day: "Fri", priority: true, items: [
    ["Leg press", 3, 12, 30], ["Goblet squat", 3, 10, 8], ["Seated leg curl", 3, 12, 15],
    ["Seated calf raise", 3, 20, 15], ["Plank", 3, 30, null]] },
];

// name, category, isVeg, kcal, p, c, f, fiber, omega3Mg?, opts
type F = [string, string, boolean, number, number, number, number, number, number?, { local?: string; servingG?: number; notes?: string }?];
export const FOODS: F[] = [
  // Non-veg
  ["Chicken breast, cooked", "non-veg", false, 165, 31, 0, 3.6, 0],
  ["Egg, whole, boiled", "non-veg", false, 155, 13, 1, 11, 0],
  ["Egg white", "non-veg", false, 52, 11, 0.7, 0.2, 0],
  ["Mackerel", "non-veg", false, 205, 19, 0, 14, 0, 2600, { local: "Bangda" }],
  ["Sardine", "non-veg", false, 208, 25, 0, 11, 0, 1480],
  ["Rohu", "non-veg", false, 97, 17, 0, 3, 0, 300],
  ["Tilapia", "non-veg", false, 129, 26, 0, 3, 0, 240],
  ["Prawns", "non-veg", false, 99, 24, 0.2, 0.3, 0],
  // Veg protein
  ["Paneer", "veg-protein", true, 265, 18, 1.2, 21, 0],
  ["Tofu", "veg-protein", true, 76, 8, 1.9, 4.8, 0.3],
  ["Soya chunks, dry", "veg-protein", true, 345, 52, 33, 0.5, 13],
  ["Rajma, cooked", "veg-protein", true, 127, 9, 23, 0.5, 6],
  ["Kabuli chana, cooked", "veg-protein", true, 164, 9, 27, 2.6, 8],
  ["Toor dal, cooked", "dal", true, 116, 7, 21, 0.4, 5],
  ["Moong dal, cooked", "dal", true, 105, 7, 19, 0.4, 8],
  ["Chana dal, cooked", "dal", true, 120, 8, 20, 2, 8],
  ["Masoor dal, cooked", "dal", true, 116, 9, 20, 0.4, 8],
  ["Greek yogurt, plain", "dairy", true, 59, 10, 3.6, 0.4, 0],
  ["Curd, plain", "dairy", true, 61, 3.5, 4.7, 3.3, 0],
  // Carbs
  ["Rice, cooked", "carb", true, 130, 2.7, 28, 0.3, 0.4],
  // Spec gives 104 kcal etc. PER CHAPATI (40 g). Normalised ×2.5 to per-100g.
  ["Chapati", "carb", true, 260, 7.5, 45, 6.25, 6.75, undefined, { servingG: 40, notes: "Spec: 104 kcal/3p/18c/2.5f/2.7fib per 40 g chapati; stored ×2.5 per 100 g." }],
  ["Rolled oats, dry", "carb", true, 389, 17, 66, 7, 10],
  // Spec gives 80 kcal etc. PER SLICE, slice weight not specified. ASSUMED 30 g → ×3.333.
  ["Multigrain bread", "carb", true, 266.7, 13.3, 43.3, 4, 6.7, undefined, { servingG: 30, notes: "Spec: 80 kcal/4p/13c/1.2f/2fib per slice. Slice weight NOT given — ASSUMED 30 g. Verify against the packet." }],
  // Fats & nuts
  ["Almonds", "nuts", true, 579, 21, 22, 50, 12],
  ["Walnuts", "nuts", true, 654, 15, 14, 65, 7, 9000],
  ["Pumpkin seeds", "nuts", true, 559, 30, 11, 49, 6],
  ["Peanut butter (Pintola)", "nuts", true, 588, 25, 20, 50, 6],
  ["Mustard oil", "oil", true, 884, 0, 0, 100, 0],
  ["Olive oil", "oil", true, 884, 0, 0, 100, 0],
  // Dairy (branded; spec gives per 100 ml for milk — 1 ml ≈ 1 g assumed)
  ["Sid's Farm HP Toned Milk", "dairy", true, 54, 4.4, 5, 3, 0, undefined, { notes: "Spec is per 100 ml; stored as per 100 g (1 ml ≈ 1 g)." }],
  ["Sid's Farm HP Curd", "dairy", true, 75, 6.3, 4, 3, 0],
  // Veg & fruit
  ["Palak (spinach)", "vegetable", true, 23, 2.9, 3.6, 0.4, 2.2],
  ["Beans", "vegetable", true, 31, 1.8, 7, 0.1, 3.4],
  ["Bhindi", "vegetable", true, 33, 1.9, 7, 0.2, 3.2],
  ["Cabbage", "vegetable", true, 25, 1.3, 6, 0.1, 2.5],
  ["Carrot", "vegetable", true, 41, 0.9, 10, 0.2, 2.8],
  ["Capsicum", "vegetable", true, 31, 1, 6, 0.3, 2.1],
  ["Cucumber", "vegetable", true, 15, 0.7, 3.6, 0.1, 0.5],
  ["Lettuce", "vegetable", true, 15, 1.4, 2.9, 0.2, 1.3],
  ["Banana", "fruit", true, 89, 1.1, 23, 0.3, 2.6],
  ["Apple", "fruit", true, 52, 0.3, 14, 0.2, 2.4],
  ["Guava", "fruit", true, 68, 2.6, 14, 1, 5.4],
  ["Orange", "fruit", true, 47, 0.9, 12, 0.1, 2.4],
  ["Roasted chana", "snack", true, 164, 9, 27, 2.6, 8],
  // Spec: 1 tsp (5 g) = ~0 kcal, 4 g fibre → 80 g fibre per 100 g.
  ["Isabgol (psyllium husk)", "fibre", true, 0, 0, 0, 0, 80, undefined, { servingG: 5, notes: "Spec: 1 tsp (5 g) ≈ 0 kcal, 4 g fibre → 80 g/100 g." }],
];

/**
 * Veg swaps for the veg/non-veg toggle. These are MY picks (spec doesn't name them) —
 * chicken→soya chunks/paneer is from the spec's own example; the rest are protein-sensible defaults.
 * Fish swaps lose omega-3 (the omega-3 capsule covers it). Editable via /admin later.
 */
export const VEG_ALT: Record<string, string> = {
  "Chicken breast, cooked": "Soya chunks, dry",
  "Egg, whole, boiled": "Paneer",
  "Egg white": "Greek yogurt, plain",
  Mackerel: "Tofu", Sardine: "Tofu", Rohu: "Tofu", Tilapia: "Tofu", Prawns: "Tofu",
};

export const SLOTS = [
  ["Pre-gym + coffee + omega-3", "10:15"], ["Post-gym protein", "12:30"], ["Lunch", "13:00"],
  ["Snack 1", "17:00"], ["Dinner (packed)", "20:00"], ["Snack 2", "22:00"], ["Isabgol + protein", "23:45"],
] as const;
export const DAY_TYPES = ["training", "cardio", "rest"] as const;

export const SUPPLEMENTS = [
  { name: "Uprise-D3 60K", dose: "60000", unit: "IU (1 capsule)", frequency: "weekly", requiresFat: true, startDate: "2026-09-06",
    scheduleJson: { day: "Sun", time: "after dinner", phase: "weekly_x8_then_monthly", weeklyDoses: 8 },
    notes: "Never double-dose to catch up; serum calcium was 9.8 (upper normal)." },
  { name: "Tata 1mg Triple Strength Omega 3", dose: "1", unit: "capsule (560 EPA + 400 DHA = 960 mg)", frequency: "daily", requiresFat: true,
    scheduleJson: { time: "with a fat-containing meal" }, notes: "Milk alone is NOT enough fat." },
  { name: "Isabgol (psyllium husk)", dose: "1", unit: "tsp in a full glass of water", frequency: "daily", requiresFat: false,
    scheduleJson: { time: "night" }, notes: "Keep a 2 hour gap from other medication." },
  { name: "Whey protein (AS-IT-IS ONE)", dose: "1-2", unit: "scoop", frequency: "daily", requiresFat: false,
    scheduleJson: { training: 2, cardio: 1, rest: 1, timing: "training days: post-gym + bedtime" }, notes: "Training days 2 scoops; cardio/rest days 1 scoop." },
  { name: "Magnesium glycinate (Tata 1mg Advanced)", dose: "1", unit: "tablet (~220 mg elemental)", frequency: "daily", requiresFat: false,
    scheduleJson: { time: "30-60 min before bed" }, notes: "For sleep consistency." },
] as const;
