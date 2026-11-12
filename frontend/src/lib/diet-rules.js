// The diet plan's rules and shopping list (our addition), from the owner's triglyceride plan of
// November 2026 (Diet-Plan-7-Days, with the office boxes of Daily-Plan-6am). Plain data for the
// Diet screen's Rules and Shopping sections; every text is an English i18n key.
// Shopping ticks live in this browser only (localStorage): a per-viewer convenience, not synced.
import { ALGAL_NOTE, B12_NOTE } from './diet-track.js'

export const RULES = [
  { title: 'Carbs under 130 g.', text: 'The triglyceride lever. Not fat, not cholesterol. Carbs.' },
  { title: 'Omega-3 at 3 capsules.', text: 'One with each main meal. Never on an empty stomach.' },
  { title: 'Zero alcohol.', text: 'It can double triglycerides alone. Six weeks minimum.' },
  { title: 'Zero added sugar.', text: 'No sweets, jaggery, juice, honey, sweetened anything.' },
]

export const NO_SUGAR_LINE = 'No added sugar: no sweets, jaggery, juice or honey.'

// Both tracks.
export const NEVER = [
  { food: 'Sweets, jaggery, dessert', why: 'Direct triglyceride driver' },
  { food: 'Juice, soft drinks, sweetened lassi', why: 'Liquid sugar' },
  { food: 'Alcohol', why: 'Can double triglycerides' },
  { food: 'White bread, maida, bakery', why: 'Refined carb' },
  { food: 'Biscuits, cake, puffs, rusk', why: 'Refined carb + trans fat' },
  { food: 'Fried snacks, samosa, pakoda, bajji', why: 'Trans fat, lowers HDL' },
  { food: 'Chips, packaged namkeen', why: 'Palm oil, refined carb' },
  { food: 'Butter, coconut oil, excess ghee', why: 'Saturated fat' },
  { food: 'Honey, "healthy" sugar', why: 'Still sugar' },
  { food: 'Potato', why: 'Treat it as rice' },
]

export const OIL_RULE = 'Cooking oil: mustard, groundnut or olive only. 1 tsp per meal.'

// Each track's list holds only its own foods: the veg one has no eggs, fish or chicken.
export const IF_HUNGRY = {
  both: ['Water first', 'More vegetables', '1 bowl plain curd', 'Green tea or black coffee (before 4 pm only)'],
  nonveg: ['2 boiled eggs'],
  veg: ['100 g tofu or 150 g Greek yogurt'],
  dont: 'Do not add: rice, chapati, fruit, anything sweet.',
}

// The 6 am day: dinner is cooked at 13:00 and eaten at home, so two boxes go to the office.
export const OFFICE_BOXES = {
  nonveg: ['Box 1: 100 g fruit + 20 g roasted chana', 'Box 2: 100 g curd + 2 boiled eggs (curd only on fish days)'],
  veg: ['Box 1: 100 g fruit + 10 g roasted chana + 100 g Greek yogurt', 'Box 2: 200 g Greek yogurt + tofu (100 to 200 g, by the day)'],
  both: ['1 omega-3 capsule in your pocket', 'Water bottle at your desk: 3 litres a day', 'Cook dinner at 1 pm with lunch and leave it ready.'],
}

export const VEG_WARNINGS = [
  { title: 'Paneer has saturated fat', text: '100 g paneer is 21 g fat, 13 g of it saturated. The plan keeps it to 150 g a day at most; tofu and Greek yogurt carry the rest. Use low-fat paneer where you can.' },
  { title: 'Soya chunks are carb-heavy', text: '25 to 30 g dry is 13 to 16 g protein and 8 to 10 g carbs. Once a day only, paneer or tofu for the other meal.' },
  { title: 'B12', text: B12_NOTE },
]
// The owner takes fish oil on both tracks (his choice); this is the one optional line about it.
export const VEG_OPTIONAL = [ALGAL_NOTE]

const items = (prefix, list) => list.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }))

export const SHOPPING = {
  weekly: {
    // A week of the plan: 22 eggs, 1.6 kg chicken, 300 g fish, 1.4 kg curd.
    nonveg: items('wn', [
      'Eggs, 2 dozen',
      'Chicken, 1.7 kg',
      'Fish, 300 g (mackerel or sardine)',
      'Curd, 1.5 kg',
      'Fruit: guava, apple',
      'Vegetables (a wide mix)',
    ]),
    // A week of the plan: 750 g paneer, 1.45 kg tofu, 3.15 kg Greek yogurt, 700 g curd.
    veg: items('wv', [
      'Paneer, 750 g (low-fat if available)',
      'Tofu, 1.5 kg',
      'Greek yogurt, 3.2 kg',
      'Curd, 750 g',
      'Fruit: guava, apple',
      'Vegetables (a wide mix)',
    ]),
  },
  monthly: items('m', [
    'Almonds, 600 g',
    'Walnuts, 400 g',
    'Pumpkin seeds, 300 g',
    'Toor, moong, chana and masoor dal',
    'Rajma, kabuli chana',
    'Soya chunks (veg track: 750 g)',
    'Methi seeds',
    'Mustard or groundnut oil',
    'Roasted chana',
    'Isabgol',
    'Omega-3 (fish oil)',
    'Magnesium glycinate',
  ]),
}

/** The shopping lists of a track ('veg' / 'nonveg', or true for veg): weekly for it, then monthly. */
export function shoppingFor(track) {
  const veg = track === true || track === 'veg'
  return [
    { id: 'weekly', title: veg ? 'Weekly, pure veg' : 'Weekly, non-veg', items: SHOPPING.weekly[veg ? 'veg' : 'nonveg'] },
    { id: 'monthly', title: 'Monthly, both tracks', items: SHOPPING.monthly },
  ]
}

/** What the Rules card shows on a track: only that track's foods. */
export function rulesFor(track) {
  const veg = track === true || track === 'veg'
  return {
    ifHungry: [...IF_HUNGRY.both, ...(veg ? IF_HUNGRY.veg : IF_HUNGRY.nonveg)],
    officeBoxes: [...(veg ? OFFICE_BOXES.veg : OFFICE_BOXES.nonveg), ...OFFICE_BOXES.both],
    warnings: veg ? VEG_WARNINGS : [],
    optional: veg ? VEG_OPTIONAL : [],
  }
}

export const TICKS_KEY ='mygym_shop_ticks_v1'

/** Ticks with one id flipped (a new object; ids not ticked are left out). */
export function toggleTick(ticks, id) {
  const next = { ...(ticks || {}) }
  if (next[id]) delete next[id]
  else next[id] = true
  return next
}

/** Ticks with every item of `list` cleared. */
export const clearTicks = (ticks, list) => {
  const next = { ...(ticks || {}) }
  for (const x of list || []) delete next[x.id]
  return next
}

/** The stored ticks, {} when there are none or storage is unavailable. */
export function readTicks(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(TICKS_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

export function writeTicks(ticks, storage = globalThis.localStorage) {
  try { storage?.setItem(TICKS_KEY, JSON.stringify(ticks || {})) } catch { /* private window: ticks just do not persist */ }
}

/** Every English text in this file, for the locale packs. */
export function allRuleTexts() {
  return [
    ...RULES.flatMap(r => [r.title, r.text]), NO_SUGAR_LINE, ...NEVER.flatMap(n => [n.food, n.why]), OIL_RULE,
    ...IF_HUNGRY.both, ...IF_HUNGRY.nonveg, ...IF_HUNGRY.veg, IF_HUNGRY.dont,
    ...OFFICE_BOXES.nonveg, ...OFFICE_BOXES.veg, ...OFFICE_BOXES.both,
    ...VEG_WARNINGS.flatMap(w => [w.title, w.text]), ...VEG_OPTIONAL,
    ...shoppingFor(false).concat(shoppingFor(true)).flatMap(s => [s.title, ...s.items.map(i => i.text)]),
  ]
}
