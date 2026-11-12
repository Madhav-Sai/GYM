// The default diet plan (our addition): the owner's triglyceride plan of November 2026 (carbs under
// 130 g, unsaturated fat, protein high) on his 6 am gym day (Daily-Plan-6am: wake 05:15, gym 06:00 to
// 07:15, sleep 08:30 to 13:00, shift 14:00 to 22:00, dinner at home 23:00, sleep 00:30). Two tracks:
// A non-veg and B pure veg (no eggs, fish or chicken). The meals are the plan's own, item by item;
// the rotations (fish, veg protein, dal, vegetables) pick the day's foods by weekday.
//
// Portions (November 2026, trimmed so every day lands on the targets; the foods, meal times and
// rotations are the plan's own). Exact grams per item are in dayPlan below; in short:
//   rice                  50 g cooked non-veg, 30 g veg (the plan's 1/3 cup, kept small)
//   dal                   ONE bowl a day, at lunch: 100 g cooked non-veg, 50 g veg
//   curd                  2 x 100 g non-veg (lunch, snack 2), 1 x 100 g veg (lunch)
//   2 vegetables          2 x 100 g at lunch and at dinner
//   raw salad             50 g cucumber + 50 g lettuce at dinner
//   1 fruit               100 g guava or apple, never banana
//   nuts                  ONCE a day, at breakfast: 20 g almonds + 12 g walnuts, + 10 g pumpkin seeds
//   chapati               1 at dinner
//   cooking oil           1 tsp (4.5 g) mustard oil per cooked meal (lunch and dinner)
//   eggs (non-veg)        2 at breakfast, 2 at snack 2 on chicken days
//   chicken / fish        MEAT_ROTATION: lunch 100 g chicken, or the day's fish; dinner chicken
//   veg protein           VEG_PROTEIN_ROTATION: paneer at most 150 g a day, soya once a day, tofu and
//                         Greek yogurt (450 g a day) carry the rest, to keep saturated fat down
//   black coffee          200 ml, counted as 0 kcal
//   1 tsp methi seeds     4 g
//
// Whey: 2 scoops every day, one right after the gym (07:15, logged with the 07:30 breakfast) and one
// at 23:45. Nothing but black coffee before the gym.
//
// The real totals of every weekday and track are in diet-plan.test.js. Non-veg lands on 1910 to
// 1950 kcal, carbs 120 to 128 g, fat 77 to 80 g and protein 182 to 194 g (protein is above 165 g
// because with carbs and fat at their ceilings the only way to reach 1900 kcal is protein). Veg
// reaches 162 to 174 g protein with carbs under 130 g and fat under 80 g, but NOT 1900 kcal: it lands
// on 1784 to 1848 kcal. Every veg protein food but paneer carries carbs (Greek yogurt, soya, tofu,
// dal), so once carbs are at 130 g and fat at 80 g there is nothing left to add energy with.
import { foodById, sumMacros } from './diet-foods.js'
import { vegItem } from './diet-swap.js'
import { weekdayOf } from './ist.js'

// The same targets for both tracks and every day type. Carbs are a CEILING (the triglyceride lever),
// fat is mostly unsaturated, saturated fat stays under 10 % of energy.
export const TARGETS = Object.freeze({
  kcal: 2000, protein: 165, carbs: 130, fat: 80, fiber: 35,
  carbsMax: true,
  satFatMax: 20,
  waterMin: 2500, waterMax: 3000,
})

// Flags (diet-flags.js) look at these by 20:00 India time.
export const FLAG_AT = '20:00'

// `pill`: the slot carries one omega-3 capsule (display only; the checklist is on Supplements).
// The day runs 04:00 to 04:00 India time (ist.js), so 23:45 is still the same plan day.
export const SLOTS = [
  { id: 'wake', time: '05:15', title: 'Wake', note: '1 tsp soaked methi seeds + water' },
  { id: 'pre', time: '05:30', title: 'Pre-gym', note: 'Black coffee only, no food' },
  { id: 'post', time: '07:30', title: 'Breakfast (post-workout)', note: 'Whey right after the gym. Protein and fat, no carbs: you sleep after', pill: true },
  { id: 'lunch', time: '13:15', title: 'Lunch', note: 'Cook dinner now too', pill: true },
  { id: 'snack1', time: '17:00', title: 'Snack 1 (office)' },
  { id: 'snack2', time: '19:30', title: 'Snack 2 (office)' },
  { id: 'dinner', time: '23:00', title: 'Dinner at home', pill: true },
  { id: 'bed', time: '23:45', title: 'Isabgol + whey + magnesium' },
]

export const DAY_TYPES = ['training', 'cardio', 'rest']
export const TRACKS = ['nonveg', 'veg']
// Mon Tue Thu Fri training, Wed Sat cardio, Sun rest. Index 0 is Sunday.
const BY_WEEKDAY = ['rest', 'training', 'training', 'cardio', 'training', 'training', 'cardio']
// The weekday a day type is shown for when no day is given (Monday, Wednesday, Sunday).
const SAMPLE_WEEKDAY = { training: 1, cardio: 3, rest: 0 }

/** The day type of a day: the day's own override, else by weekday. */
export const dayTypeOf = (day, override) => (DAY_TYPES.includes(override) ? override : BY_WEEKDAY[weekdayOf(day)])

/* ---------- rotations, by weekday (0 Sunday) ---------- */

// Dal: Mon toor, Tue rajma, Wed chana dal, Thu moong, Fri toor (or sambar), Sat kabuli chana, Sun masoor.
export const DAL_ROTATION = ['masoor', 'toor', 'rajma', 'chana-dal', 'moong', 'toor', 'kabuli']
// Track A: fish on Tue, Thu, Sat (mackerel or sardine, the omega-3 fish) at lunch, chicken the other
// days; dinner is chicken every day. [lunch food, lunch g, dinner chicken g]: the fish is oily, so a
// fish day has less of it and more chicken at dinner (and no eggs at snack 2) to stay under 80 g fat.
export const FISH_ROTATION = ['chicken', 'chicken', 'mackerel', 'chicken', 'sardine', 'chicken', 'mackerel']
export const MEAT_ROTATION = [
  ['chicken', 100, 150], ['chicken', 100, 150], ['mackerel', 100, 200], ['chicken', 100, 150],
  ['sardine', 125, 200], ['chicken', 100, 150], ['mackerel', 75, 225],
]
// Track B: lunch and dinner protein, and the tofu in office box 2 (`tofu` g). Soya (dry) once a day,
// paneer at most 150 g a day. Thursday's "rajma + paneer" makes the lunch dal rajma; Saturday's
// "chana + paneer" is the day's kabuli chana.
export const VEG_PROTEIN_ROTATION = [
  { lunch: ['paneer', 125, 'Paneer'], dinner: ['soya', 25, 'Soya chunks'], tofu: 150 },
  { lunch: ['soya', 25, 'Soya chunks'], dinner: ['paneer', 125, 'Paneer bhurji'], tofu: 100 },
  { lunch: ['paneer', 75, 'Paneer curry'], dinner: ['tofu', 150, 'Tofu stir fry'], tofu: 200 },
  { lunch: ['soya', 30, 'Soya chunks'], dinner: ['paneer', 125, 'Paneer tikka'], tofu: 150 },
  { lunch: ['paneer', 75, 'Rajma + paneer'], dinner: ['tofu', 150, 'Tofu bhurji'], lunchDal: 'rajma', tofu: 200 },
  { lunch: ['soya', 25, 'Soya chunks'], dinner: ['paneer', 150, 'Paneer curry'] },
  { lunch: ['paneer', 75, 'Chana + paneer'], dinner: ['tofu', 150, 'Tofu curry'], tofu: 200 },
]
// Vegetables: the plan lists them without a rotation; this spreads its list over the week, two at
// lunch and two at dinner (our choice).
export const VEG_ROTATION = [
  ['palak', 'carrot', 'brinjal', 'tomato'],
  ['bhindi', 'cabbage', 'cauliflower', 'capsicum'],
  ['beans', 'carrot', 'bottle-gourd', 'tomato'],
  ['palak', 'cauliflower', 'ridge-gourd', 'capsicum'],
  ['bhindi', 'tomato', 'cabbage', 'beans'],
  ['brinjal', 'capsicum', 'palak', 'carrot'],
  ['bottle-gourd', 'beans', 'cauliflower', 'ridge-gourd'],
]
// Fruit: guava or apple, alternating (guava on Sun, Tue, Thu, Sat).
const fruitOf = wd => (wd % 2 === 0 ? 'guava' : 'apple')

const it = (foodId, qty, note) => (note ? { foodId, qty, note } : { foodId, qty })

/** The plan of one day as { slot: [{ foodId, qty, note? }] }, before keys and swaps. The veg track
 *  has no egg, fish or chicken anywhere, not even in a note. */
function dayPlan(dayType, wd, track) {
  const dal = DAL_ROTATION[wd]
  const [v1, v2, v3, v4] = VEG_ROTATION[wd]
  const oil = it('mustard-oil', 4.5)
  const salad = [it('cucumber', 50), it('lettuce', 50)]
  const nuts = [it('almonds', 20), it('walnuts', 12)]
  const whey = it('whey', 1)
  const postWhey = it('whey', 1, 'post-gym')
  const out = {
    wake: [it('methi-seeds', 4)],
    pre: [it('black-coffee', 200)],
  }
  if (track === 'veg') {
    const rot = VEG_PROTEIN_ROTATION[wd]
    out.post = [postWhey, it('greek-yogurt', 150), ...nuts, it('pumpkin-seeds', 10)]
    out.lunch = [it('rice', 30), it(rot.lunchDal || dal, 50), it(rot.lunch[0], rot.lunch[1], rot.lunch[2]), it(v1, 100), it(v2, 100), it('curd', 100), oil]
    out.snack1 = [it(fruitOf(wd), 100), it('roasted-chana', 10), it('greek-yogurt', 100)]
    out.snack2 = [it('greek-yogurt', 200), ...(rot.tofu ? [it('tofu', rot.tofu)] : [])]
    out.dinner = [it('chapati', 1), it(rot.dinner[0], rot.dinner[1], rot.dinner[2]), it(v3, 100), it(v4, 100), ...salad, oil]
  } else {
    const [meat, meatG, chickenG] = MEAT_ROTATION[wd]
    const fish = meat !== 'chicken'
    out.post = [postWhey, it('egg', 100), ...nuts, it('pumpkin-seeds', 10)]
    out.lunch = [it('rice', 50), it(dal, 100), it(meat, meatG), it(v1, 100), it(v2, 100), it('curd', 100), oil]
    out.snack1 = [it(fruitOf(wd), 100), it('roasted-chana', 20)]
    out.snack2 = fish ? [it('curd', 100)] : [it('curd', 100), it('egg', 100)]
    out.dinner = [it('chapati', 1), it('chicken', chickenG), it(v3, 100), it(v4, 100), ...salad, oil]
  }
  out.bed = [it('isabgol', 1), whey]
  return out
}

/** Energy and carbs by day type: the same for every day in this plan. Protein comes from body weight. */
export const DAY_TARGETS = Object.freeze({
  training: { kcal: 2000, carbs: 130 },
  cardio: { kcal: 2000, carbs: 130 },
  rest: { kcal: 2000, carbs: 130 },
})

/** The meal slots of a day type: same ids and times, named for the day. */
const SLOT_NAMES = {
  training: {},
  cardio: { pre: ['Pre-cardio', 'Black coffee only, no food'] },
  rest: { pre: ['Coffee', 'No gym today'], post: ['Breakfast', 'Protein and fat, no carbs'] },
}
export function slotsFor(dayType) {
  const names = SLOT_NAMES[dayType] || SLOT_NAMES.training
  return SLOTS.map(s => names[s.id] ? { ...s, title: names[s.id][0], note: names[s.id][1] } : s)
}

/** The day's own notes: the rest day (Sunday) has the weigh-in and the D3. */
export function dayNotes(dayType) {
  if (dayType === 'rest') return ['Weigh in and measure waist this morning', 'D3 with dinner on the first Sunday of the month']
  return []
}

const weekdayFor = (dayType, day) => (typeof day === 'string' && day ? weekdayOf(day) : SAMPLE_WEEKDAY[dayType] ?? 1)

/**
 * The plan of a day type as { slot: [{ foodId, qty, key, note? }] }. `day` ('YYYY-MM-DD') picks the
 * rotations by its weekday. `track` 'veg' (or the older `veg` true) is Track B, the pure veg plan.
 * On Track A, `vegMeals` swaps one meal's non-veg items for protein-matched veg ones (diet-swap.js).
 */
export function planFor(dayType, { veg: vegFlag = false, track, vegMeals = {}, day } = {}) {
  const type = DAY_TYPES.includes(dayType) ? dayType : 'training'
  const veg = track ? track === 'veg' : !!vegFlag
  const plan = dayPlan(type, weekdayFor(type, day), veg ? 'veg' : 'nonveg')
  const out = {}
  for (const s of SLOTS) {
    const swap = !veg && vegMeals[s.id] === true
    out[s.id] = (plan[s.id] || []).map((x, i) => {
      const item = { ...x, key: `${s.id}:${i}` }
      return swap ? vegItem(item) : item
    })
  }
  return out
}

/** Totals of a plan (sumMacros over its items). */
export function planTotals(plan) {
  return sumMacros(Object.values(plan).flat().map(x => ({ food: foodById(x.foodId), qty: x.qty })))
}

const MEAT = ['chicken', 'mackerel', 'sardine', 'rohu', 'tilapia', 'prawns']
const VEG_PROTEIN = ['paneer', 'tofu', 'soya']

/** The non-negotiables of a track, checked against a day's entries. Water in ml. */
export function nonNegotiables(entries, water, { veg = false } = {}) {
  const sum = pred => (entries || []).filter(e => pred(foodById(e.foodId) || {}, e)).reduce((n, e) => n + (e.qty || 0), 0)
  const count = pred => (entries || []).filter(e => pred(foodById(e.foodId) || {}, e)).length
  const salad = f => f.id === 'cucumber' || f.id === 'lettuce'
  return [
    { id: 'dal', label: '1 bowl dal', done: count(f => f.cat === 'dal') >= 1 },
    { id: 'veg', label: 'Vegetables x4 (2 at lunch, 2 at dinner)', done: count(f => f.cat === 'veg' && !salad(f)) >= 4 },
    { id: 'salad', label: 'Raw salad', done: count(salad) >= 1 },
    { id: 'nuts', label: '32 g almonds + walnuts at breakfast', done: sum(f => f.id === 'almonds' || f.id === 'walnuts') >= 32 },
    ...(veg
      ? [
          { id: 'curd', label: 'Curd at lunch', done: count(f => f.id === 'curd' || f.id === 'sids-curd') >= 1 },
          { id: 'vegprotein', label: 'Paneer, tofu or soya at lunch and dinner', done: count(f => VEG_PROTEIN.includes(f.id)) >= 2 },
        ]
      : [
          { id: 'curd', label: 'Curd at lunch and snack 2', done: count(f => f.id === 'curd' || f.id === 'sids-curd') >= 2 },
          { id: 'meat', label: 'Chicken or fish at lunch and dinner', done: count(f => MEAT.includes(f.id)) >= 2 },
        ]),
    { id: 'water', label: '3 L water (2.5 L minimum)', done: (water || 0) >= TARGETS.waterMin },
  ]
}
