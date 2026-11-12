// The diet plan's rules and shopping list (our addition), from the owner's triglyceride plan of
// November 2026 (Diet-Plan-7-Days, with the office boxes of Daily-Plan-6am). Plain data for the
// Diet screen's Rules and Shopping sections; every text is an English i18n key.
// Shopping ticks live in this browser only (localStorage): a per-viewer convenience, not synced.

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

export const OIL_RULE = 'Cooking oil: mustard, groundnut or olive only. 2 tsp per meal.'

export const IF_HUNGRY = {
  both: ['Water first', 'More vegetables', '1 bowl plain curd', 'Green tea or black coffee (before 4 pm only)'],
  nonveg: ['2 boiled eggs'],
  veg: ['100 g paneer or 150 g Greek yogurt'],
  dont: 'Do not add: rice, chapati, fruit, anything sweet.',
}

// The 6 am day: dinner is cooked at 13:00 and eaten at home, so two boxes go to the office.
export const OFFICE_BOXES = {
  nonveg: ['Box 1: fruit + roasted chana', 'Box 2: curd + 2 boiled eggs + 32 g nuts'],
  veg: ['Box 1: fruit + roasted chana + Greek yogurt', 'Box 2: curd + 100 g paneer + 32 g nuts'],
  both: ['1 omega-3 capsule in your pocket', 'Water bottle at your desk: 3 litres a day', 'Cook dinner at 1 pm with lunch and leave it ready.'],
}

export const VEG_WARNINGS = [
  { title: 'Paneer has saturated fat', text: '100 g paneer is 21 g fat, much of it saturated. Use low-fat paneer where you can, or split it with tofu. Tofu is the better choice when you have it.' },
  { title: 'Soya chunks are carb-heavy', text: '60 g dry is 31 g protein but 20 g carbs, inside your 130 g budget. Keep soya to one meal a day, paneer or tofu for the other.' },
  { title: 'Fish oil is not vegetarian', text: 'On the veg track take algal omega-3, for the same 2 to 3 g EPA + DHA. Flax and chia are not a substitute.' },
  { title: 'B12', text: 'It was 403 on a mixed diet and will fall on pure veg. Retest in 3 months; under 250, add 1500 mcg B12 weekly.' },
]

const items = (prefix, list) => list.map((text, i) => ({ id: `${prefix}-${i + 1}`, text }))

export const SHOPPING = {
  weekly: {
    nonveg: items('wn', [
      'Eggs, 3 dozen',
      'Chicken, 1.5 kg',
      'Fish, 750 g (mackerel or sardine)',
      "Sid's Farm HP toned milk, daily",
      "Sid's Farm HP curd, 5 tubs",
      'Fruit: guava, apple, orange',
      'Vegetables (a wide mix)',
    ]),
    veg: items('wv', [
      'Paneer, 1.5 kg (low-fat if available)',
      'Tofu, 750 g',
      'Greek yogurt, 1.5 kg',
      "Sid's Farm HP curd, 5 tubs",
      "Sid's Farm HP toned milk, daily",
      'Fruit: guava, apple, orange',
      'Vegetables (a wide mix)',
    ]),
  },
  monthly: items('m', [
    'Almonds, 500 g',
    'Walnuts, 250 g',
    'Pumpkin seeds, 500 g',
    'Toor, moong, chana and masoor dal',
    'Rajma, kabuli chana',
    'Soya chunks (veg track: 2 kg)',
    'Methi seeds',
    'Mustard or groundnut oil',
    'Roasted chana',
    'Isabgol',
    'Omega-3 (fish oil, or algal on the veg track)',
    'Magnesium glycinate',
  ]),
}

/** The shopping lists of a track: weekly for that track, then the monthly one. */
export function shoppingFor(veg) {
  return [
    { id: 'weekly', title: veg ? 'Weekly, pure veg' : 'Weekly, non-veg', items: SHOPPING.weekly[veg ? 'veg' : 'nonveg'] },
    { id: 'monthly', title: 'Monthly, both tracks', items: SHOPPING.monthly },
  ]
}

export const TICKS_KEY = 'mygym_shop_ticks_v1'

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
    ...VEG_WARNINGS.flatMap(w => [w.title, w.text]),
    ...shoppingFor(false).concat(shoppingFor(true)).flatMap(s => [s.title, ...s.items.map(i => i.text)]),
  ]
}
