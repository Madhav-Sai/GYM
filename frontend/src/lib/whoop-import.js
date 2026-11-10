// Whoop workouts in History (our addition). A workout the Whoop band detected (a run, a walk, a
// Cult class it files as "functional fitness" or "hiit") lands in S.workouts as a logged workout
// of its own, so History, Stats, the streak and the calendar count it like any other.
//
// The shape is the app's own finished workout (lib/finish-workout.js buildCompletedWorkout), with
// no sets: nothing was ticked, so none are made up. What Whoop measured rides beside it:
//
//   { id: 'whoop-<id>', d, start, end, routineIds: [], routineId: null, name, bw: null,
//     entries: [], prs: [], source: 'whoop',
//     whoop: { id, sport, strain, avgHr, maxHr, kcal, distanceM, zonesMin: [z0..z5] }, _ts }
//
// Which Whoop workouts were dealt with is a synced map, one stamped entry per Whoop id, merged per
// key like S.gymVisits (lib/sync-merge.js STAMPED_MAPS):
//
//   S.whoopImported = { '<whoop id>': { s: '<workout id>' | 'skip', _ts }, … }
//
// `s` is the workout it became, the logged gym session it was linked to (that session carries
// `whoopId`), or 'skip' (deleted from History, or nothing to import). A Whoop id with an entry is
// never imported again, so a deleted workout does not come back on the next summary.
//
// The id is the Whoop id with a prefix, so two devices importing the same workout before they
// sync make one workout, not two (the merge unions workouts by id).
import { matchWhoopWorkout } from './whoop-match.js'
import { overCeiling } from './cardio-plans.js'
import { stampWorkout } from './sync-merge.js'
import { insertChronological } from './backfill.js'

export const IMPORT_DAYS = 90
export const MIN_IMPORT_MS = 5 * 60000
export const SKIP = 'skip'
const DAY_MS = 86400000
const ISO = /^\d{4}-\d{2}-\d{2}$/

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const ms = v => (typeof v === 'number' ? v : Date.parse(v))
const pad = n => String(n).padStart(2, '0')
const localIso = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }

/** Whether the Settings switch "Add Whoop workouts to History" is on (default on). */
export const whoopImportOn = S => S?.whoopAutoImport !== false

/** Whether a stored workout came from Whoop. */
export const isWhoopWorkout = w => w?.source === 'whoop' && isMap(w.whoop)

/** The workout id an imported Whoop workout gets. */
export const whoopSessionId = whoopId => 'whoop-' + String(whoopId)

// Whoop's sport names (v2 `sport_name`, lower case) as History shows them.
export const SPORT_LABEL = {
  'running': 'Running', 'walking': 'Walking', 'hiking': 'Hiking', 'cycling': 'Cycling', 'spin': 'Spin',
  'mountain biking': 'Mountain biking', 'functional fitness': 'Functional fitness', 'hiit': 'HIIT',
  'boxing': 'Boxing', 'kickboxing': 'Kickboxing', 'martial arts': 'Martial arts', 'yoga': 'Yoga',
  'hot yoga': 'Hot yoga', 'pilates': 'Pilates', 'dance': 'Dance', 'barre': 'Barre', 'swimming': 'Swimming',
  'rowing': 'Rowing', 'elliptical': 'Elliptical', 'stairmaster': 'Stair climber', 'jumping rope': 'Jump rope',
  'weightlifting': 'Weightlifting', 'powerlifting': 'Powerlifting', 'strength trainer': 'Strength training',
  'stretching': 'Stretching', 'meditation': 'Meditation', 'tennis': 'Tennis', 'badminton': 'Badminton',
  'squash': 'Squash', 'pickleball': 'Pickleball', 'table tennis': 'Table tennis', 'cricket': 'Cricket',
  'soccer': 'Football', 'football': 'Football', 'basketball': 'Basketball', 'volleyball': 'Volleyball',
  'climbing': 'Climbing', 'rock climbing': 'Climbing', 'golf': 'Golf', 'skiing': 'Skiing', 'surfing': 'Surfing',
  'activity': 'Activity', 'other': 'Activity',
}
const sportKey = s => String(s || '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The friendly name of a Whoop sport ("functional-fitness" → "Functional fitness"). */
export function sportLabel(sport) {
  const k = sportKey(sport)
  if (!k) return 'Activity'
  return SPORT_LABEL[k] || k.charAt(0).toUpperCase() + k.slice(1)
}
const isLifting = sport => ['weightlifting', 'powerlifting', 'strength trainer'].includes(sportKey(sport))

// The common Cult formats, for "Rename as Cult class" (Cult has no API; Whoop records the class).
export const CULT_CLASSES = ['HRX', 'Strength & Conditioning', 'Boxing Bag Workout', 'Dance Fitness', 'Yoga', 'Spin / Indoor Cycling', 'Burn', 'HIIT']
export const NAME_MAX = 80
/** "Cult: <class>", or null for an empty class. */
export function cultName(cls) {
  const c = String(cls ?? '').replace(/\s+/g, ' ').trim()
  return c ? ('Cult: ' + c).slice(0, NAME_MAX) : null
}

/** Why a Whoop workout cannot be imported now ('open', 'short', 'old', 'pending'), or null. */
export function notImportable(w, now = Date.now()) {
  const s = ms(w?.start), e = ms(w?.end)
  if (!w?.id || !Number.isFinite(s)) return 'open'
  if (!Number.isFinite(e)) return 'open'             // still going, or still being scored
  if (w.state === 'PENDING_SCORE') return 'pending'
  if (e - s < MIN_IMPORT_MS) return 'short'
  if (s < now - IMPORT_DAYS * DAY_MS) return 'old'
  return null
}

/** The workout History stores for Whoop workout `w` (pure; not stamped). */
export function whoopSessionOf(w) {
  const start = ms(w.start), end = ms(w.end)
  const kj = num(w.kj)
  const zones = Array.isArray(w.zonesMin) ? [0, 1, 2, 3, 4, 5].map(i => num(w.zonesMin[i])) : null
  return {
    id: whoopSessionId(w.id),
    d: ISO.test(String(w.day || '')) ? w.day : localIso(start),
    start, end,
    routineIds: [], routineId: null,
    name: isLifting(w.sport) ? 'Gym (from Whoop)' : sportLabel(w.sport),
    bw: null, entries: [], prs: [],
    source: 'whoop',
    whoop: {
      id: String(w.id), sport: w.sport || null,
      strain: num(w.strain), avgHr: num(w.avgHr), maxHr: num(w.maxHr),
      kcal: kj != null ? Math.round(kj / 4.184) : null,
      distanceM: num(w.distanceM),
      zonesMin: zones && zones.some(z => z != null) ? zones : null,
    },
  }
}

// The logged session (not from Whoop) Whoop workout `w` is, or null: the session whose best match
// it is (lib/whoop-match.js, as the session detail shows it), or one it shares most of its time with.
function loggedSessionFor(w, sessions, all) {
  const ws = ms(w.start), we = ms(w.end)
  for (const x of sessions) {
    if (matchWhoopWorkout(x, all)?.id === w.id) return x
    const xs = Number(x.start), xe = Number(x.end) >= xs ? Number(x.end) : xs
    const overlap = Math.min(we, xe) - Math.max(ws, xs)
    if (Number.isFinite(overlap) && overlap > (we - ws) / 2) return x
  }
  return null
}

/**
 * What to do with the summary's Whoop `workouts` against profile `S`, without touching it:
 * { add: [workout], link: [{ whoopId, sessionId }] }. A Whoop workout already in
 * S.whoopImported, still open, shorter than 5 minutes, older than 90 days, or overlapping the
 * workout in progress is left for later (or for good) and appears in neither list.
 */
export function planWhoopImport(S, workouts, { now = Date.now() } = {}) {
  const out = { add: [], link: [] }
  if (!Array.isArray(workouts) || !workouts.length) return out
  const done = isMap(S?.whoopImported) ? S.whoopImported : {}
  const stored = (Array.isArray(S?.workouts) ? S.workouts : []).filter(Boolean)
  const ids = new Set(stored.map(x => x.id))
  const removed = isMap(S?.deleted?.workouts) ? S.deleted.workouts : {}
  const logged = stored.filter(x => x.source !== 'whoop' && Number.isFinite(Number(x.start)))
  const linkedIds = new Set(logged.map(x => x.whoopId).filter(Boolean))
  const usable = workouts.filter(w => w && w.id != null && !notImportable(w, now))
  const active = S?.active && Number.isFinite(Number(S.active.start)) ? { start: Number(S.active.start), end: now } : null
  const seen = new Set()
  for (const w of usable) {
    const id = String(w.id)
    if (seen.has(id) || Object.hasOwn(done, id)) continue
    seen.add(id)
    if (ids.has(whoopSessionId(id)) || Number(removed[whoopSessionId(id)]) > 0) continue
    if (linkedIds.has(id)) continue
    const hit = loggedSessionFor(w, logged, usable)
    if (hit) { out.link.push({ whoopId: id, sessionId: hit.id ?? null }); continue }
    // A gym session in progress may be this one: decided once it is finished.
    if (active && matchWhoopWorkout(active, [w])) continue
    out.add.push(whoopSessionOf(w))
  }
  return out
}

/**
 * Files plan `p` (planWhoopImport) into `S` (mutated): the new workouts in day order, the linked
 * sessions' `whoopId`, and an S.whoopImported entry for each, stamped `now`. Returns how many
 * workouts were added.
 */
export function applyWhoopImport(S, p, now = Date.now()) {
  if (!p || (!p.add.length && !p.link.length)) return 0
  const map = { ...(isMap(S.whoopImported) ? S.whoopImported : {}) }
  let list = Array.isArray(S.workouts) ? S.workouts : []
  let added = 0
  for (const w of p.add) {
    if (list.some(x => x?.id === w.id)) { map[w.whoop.id] = { s: w.id, _ts: now }; continue }
    list = insertChronological(list, stampWorkout({ ...w }, now))
    map[w.whoop.id] = { s: w.id, _ts: now }
    added++
  }
  for (const { whoopId, sessionId } of p.link) {
    const i = sessionId != null ? list.findIndex(x => x?.id === sessionId) : -1
    if (i >= 0 && !list[i].whoopId) {
      list = list.slice()
      list[i] = stampWorkout({ ...list[i], whoopId }, now)
      map[whoopId] = { s: sessionId, _ts: now }
    } else map[whoopId] = { s: SKIP, _ts: now }
  }
  S.workouts = list
  S.whoopImported = map
  return added
}

/** S.whoopImported with `whoopId` marked as not to be imported again, stamped `now`. */
export function withWhoopSkip(map, whoopId, now = Date.now()) {
  const base = isMap(map) ? map : {}
  if (whoopId == null) return base
  return { ...base, [String(whoopId)]: { s: SKIP, _ts: now } }
}

/** `S` (mutated) with the workout `id` renamed; true when it changed. */
export function renameWorkout(S, id, name, now = Date.now()) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  if (!n || !Array.isArray(S.workouts)) return false
  const i = S.workouts.findIndex(x => x?.id === id)
  if (i < 0 || S.workouts[i].name === n) return false
  S.workouts = S.workouts.slice()
  S.workouts[i] = stampWorkout({ ...S.workouts[i], name: n }, now)
  return true
}

/** What History and the session detail show of an imported workout, or null. */
export function whoopSessionView(w) {
  if (!isWhoopWorkout(w)) return null
  const x = w.whoop
  const zones = Array.isArray(x.zonesMin) ? x.zonesMin.map(z => (num(z) != null && z > 0 ? z : 0)) : null
  const total = zones ? zones.reduce((a, b) => a + b, 0) : 0
  return {
    strain: num(x.strain), avgHr: num(x.avgHr), maxHr: num(x.maxHr), over: overCeiling(num(x.maxHr)),
    kcal: num(x.kcal), km: num(x.distanceM) != null && x.distanceM > 0 ? Math.round(x.distanceM / 100) / 10 : null,
    zones: total > 0 ? zones.map(m => ({ m, share: m / total })) : null,
    sport: x.sport || null,
  }
}
