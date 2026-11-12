// The default diet plan (our addition): the owner's triglyceride plan of November 2026 (carbs under
// 130 g, unsaturated fat, protein high) on his 6 am gym day (Daily-Plan-6am: wake 05:15, gym 06:00 to
// 07:15, sleep 08:30 to 13:00, shift 14:00 to 22:00, dinner at home 23:00, sleep 00:30). Two tracks:
// A non-veg and B pure veg (no eggs, fish or chicken). The meals are the plan's own, item by item;
// the rotations (fish, veg protein, dal, vegetables) pick the day's foods by weekday.
//
// Portions where the plan names a household measure (our assumptions, stated once here):
//   1/3 cup rice          about 60 g cooked (a cup of cooked rice is about 158 g, USDA)
//   1 bowl dal            150 g cooked
//   1 bowl curd           150 g plain curd
//   2 vegetables          2 x 100 g
//   raw salad             50 g cucumber + 50 g lettuce
//   1 fruit               150 g guava or apple, never banana
//   32 g nuts             20 g almonds + 12 g walnuts
//   2 / 3 boiled eggs     100 g / 150 g
//   black coffee          200 ml, counted as 0 kcal
//   cooking oil           2 tsp (9 g) mustard oil at lunch and at dinner, as the plan's oil rule says
//   1 tsp methi seeds     4 g
// Where the plan offers "A or B" and no rotation decides, the first option is used (and the other is
// shown as a note on the item).
//
// Whey: 2 scoops every day, one right after the gym (logged with the 07:30 breakfast) and one at
// 23:45. Nothing but black coffee before the gym. The 6 am plan has the bedtime whey on every day,
// and the owner asked for 2 scoops a day, so the 7-day file's "no bedtime whey on cardio days" no
// longer applies.
//
// The plan's meals do NOT land on its own targets: with these portions every day is well over
// 2000 kcal and 130 g carbs (two 150 g bowls of dal alone carry 50 to 80 g carbs, and the nuts come
// twice). We keep the plan's meals as written; diet-plan.test.js records the real totals of every
// weekday and track. Protein and fibre are over target on every day.
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
// Track A: fish on Tue, Thu, Sat (mackerel or sardine, the omega-3 fish), chicken the other days.
export const FISH_ROTATION = ['chicken', 'chicken', 'mackerel', 'chicken', 'sardine', 'chicken', 'mackerel']
// Track B: lunch and dinner protein. Soya is 60 g dry, paneer 200 g at lunch, paneer or tofu 150 g at
// dinner (the plan's amounts). Thursday's "rajma + paneer" makes the lunch dal bowl rajma; Saturday's
// "chana + paneer" is the day's kabuli chana. Sunday's dinner is the 60 g soya portion.
export const VEG_PROTEIN_ROTATION = [
  { lunch: ['paneer', 200, 'Paneer'], dinner: ['soya', 60, 'Soya chunks'] },
  { lunch: ['soya', 60, 'Soya chunks'], dinner: ['paneer', 150, 'Paneer bhurji'] },
  { lunch: ['paneer', 200, 'Paneer curry'], dinner: ['tofu', 150, 'Tofu stir fry'] },
  { lunch: ['soya', 60, 'Soya chunks'], dinner: ['paneer', 150, 'Paneer tikka'] },
  { lunch: ['paneer', 200, 'Rajma + paneer'], dinner: ['tofu', 150, 'Tofu bhurji'], lunchDal: 'rajma' },
  { lunch: ['soya', 60, 'Soya chunks'], dinner: ['paneer', 150, 'Paneer curry'] },
  { lunch: ['paneer', 200, 'Chana + paneer'], dinner: ['tofu', 150, 'Tofu curry'] },
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

/** The plan of one day as { slot: [{ foodId, qty, note? }] }, before keys and swaps. */
function dayPlan(dayType, wd, track) {
  const dal = DAL_ROTATION[wd]
  const [v1, v2, v3, v4] = VEG_ROTATION[wd]
  const oil = it('mustard-oil', 9)
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
    out.post = [postWhey, it('paneer', 150, 'or 200 g Greek yogurt'), ...nuts, it('pumpkin-seeds', 20)]
    out.lunch = [it('rice', 60), it(rot.lunchDal || dal, 150), it(rot.lunch[0], rot.lunch[1], rot.lunch[2]), it(v1, 100), it(v2, 100), it('curd', 150), oil]
    out.snack1 = [it(fruitOf(wd), 150), it('roasted-chana', 30), it('greek-yogurt', 200)]
    out.snack2 = [it('curd', 150), it('paneer', 100), ...nuts]
    out.dinner = [it('chapati', 2), it(rot.dinner[0], rot.dinner[1], rot.dinner[2]), it(dal, 150), it(v3, 100), it(v4, 100), ...salad, oil]
  } else {
    const meat = FISH_ROTATION[wd]
    out.post = [postWhey, it('egg', 150), ...nuts, it('pumpkin-seeds', 20), it('curd', 150)]
    out.lunch = [it('rice', 60), it(dal, 150), it(meat, 150), it(v1, 100), it(v2, 100), it('curd', 150), oil]
    out.snack1 = [it(fruitOf(wd), 150), it('roasted-chana', 30)]
    out.snack2 = [it('curd', 150), it('egg', 100), ...nuts]
    out.dinner = [it('chapati', 2), it(meat, 150, 'or 3 eggs'), it(dal, 150), it(v3, 100), it(v4, 100), ...salad, oil]
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
 * rotations by its weekday. `veg` true is Track B, the pure veg plan. On Track A, `vegMeals` swaps
 * one meal's non-veg items for protein-matched veg ones (diet-swap.js).
 */
export function planFor(dayType, { veg = false, vegMeals = {}, day } = {}) {
  const type = DAY_TYPES.includes(dayType) ? dayType : 'training'
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
    { id: 'dal', label: '2 bowls dal', done: count(f => f.cat === 'dal') >= 2 },
    { id: 'veg', label: 'Vegetables x4 (2 at lunch, 2 at dinner)', done: count(f => f.cat === 'veg' && !salad(f)) >= 4 },
    { id: 'salad', label: 'Raw salad', done: count(salad) >= 1 },
    { id: 'nuts', label: '64 g almonds + walnuts (breakfast and snack 2)', done: sum(f => f.id === 'almonds' || f.id === 'walnuts') >= 64 },
    { id: 'curd', label: 'Curd at lunch and snack 2', done: count(f => f.id === 'curd' || f.id === 'sids-curd') >= 2 },
    ...(veg
      ? [{ id: 'vegprotein', label: 'Paneer, tofu or soya at lunch and dinner', done: count(f => VEG_PROTEIN.includes(f.id)) >= 2 }]
      : [
          { id: 'eggs', label: '5 eggs (3 at breakfast, 2 at snack 2)', done: sum(f => f.id === 'egg') >= 250 },
          { id: 'meat', label: '150 g chicken or fish', done: sum(f => MEAT.includes(f.id)) >= 150 },
        ]),
    { id: 'water', label: '3 L water (2.5 L minimum)', done: (water || 0) >= TARGETS.waterMin },
  ]
}
