// Manual gym check-in (this fork's addition). One tap on Home says "I was at the gym today": it
// counts towards the streak and shows on the calendar, whether or not a workout was logged (a Cult
// class, a session you did not log set by set). The QR membership codes stay where they were, on
// their own page.
//
// Stored per day, exactly the way day notes are (lib/day-notes.js):
//
//   S.gymVisits = { '2026-11-09': { on: true, _ts, centre?, note? }, … }
//
// `centre` is which gym (a Cult centre's name, free text) and `note` a line about the visit; both
// optional, both kept when the same day is checked in again, both go when it is taken back.
//
// One entry per day with the time it was written, so two devices that each checked in on a
// different day keep both, and the same day keeps the later write (lib/sync-merge.js
// mergeStampedMap). Taking a check-in back is a stamped entry without `on`, not a deleted key: a
// delete would come straight back from the other device's copy on the next sync.
//
// Only today and the days before can be checked in: a check-in is a statement that you went. A
// missed day is checked in afterwards from the calendar (the day sheet's check-in row).
//
// Which day "today" is: the owner trains late and goes to bed after midnight, so the check-in day
// rolls over at 04:00 phone time (checkInDay), the same 04:00 the Diet and Schedule screens use.
import { todayISO, isoOf } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Whether `iso` can hold a check-in at all: a real date, today or earlier. */
export const canCheckIn = (iso, today = todayISO()) => ISO.test(String(iso || '')) && iso <= today

/** Whether you checked in on `iso`. */
export const visitOn = (S, iso) => isMap(S?.gymVisits) && isMap(S.gymVisits[iso]) && S.gymVisits[iso].on === true

/** Every checked-in day, oldest first. Junk keys and cleared entries are left out. */
export const visitDays = S => (isMap(S?.gymVisits) ? Object.keys(S.gymVisits) : []).filter(d => ISO.test(d) && visitOn(S, d)).sort()

/**
 * S.gymVisits with `iso` checked in (`on` true) or taken back (false), stamped `now`. Anything that
 * is not an allowed day is returned unchanged.
 */
export function withVisit(map, iso, on, now = Date.now(), today = todayISO()) {
  const base = isMap(map) ? map : {}
  if (!canCheckIn(iso, today)) return base
  const had = isMap(base[iso]) && base[iso].on === true ? base[iso] : null
  return { ...base, [iso]: on ? { ...detailsOf(had), on: true, _ts: now } : { _ts: now } }
}

export const CENTRE_MAX = 60
export const VISIT_NOTE_MAX = 200
const detailsOf = e => {
  const out = {}
  const c = typeof e?.centre === 'string' ? e.centre.trim().slice(0, CENTRE_MAX) : ''
  const n = typeof e?.note === 'string' ? e.note.trim().slice(0, VISIT_NOTE_MAX) : ''
  if (c) out.centre = c
  if (n) out.note = n
  return out
}

/** The check-in entry of a day ({ on, centre?, note? }), or null when you did not check in. */
export const visitOf = (S, iso) => (visitOn(S, iso) ? { on: true, ...detailsOf(S.gymVisits[iso]) } : null)

/**
 * S.gymVisits with `iso` checked in and its centre and note set (empty text clears one). Saving
 * details is a check-in too: you only name the centre of a visit you made.
 */
export function withVisitDetails(map, iso, { centre, note } = {}, now = Date.now(), today = todayISO()) {
  const base = isMap(map) ? map : {}
  if (!canCheckIn(iso, today)) return base
  return { ...base, [iso]: { ...detailsOf({ centre, note }), on: true, _ts: now } }
}

/** The day a check-in made at `now` belongs to: phone-local date, rolling over at 04:00. */
export function checkInDay(now = new Date()) {
  return isoOf(new Date(+now - 4 * 3600000))
}

/**
 * Days at the gym in the month of `today` ('YYYY-MM-DD'): checked-in days and days with a logged
 * workout, each day once. { days, checkIns } — "14 visits this month" counts `days`.
 */
export function monthVisits(S, today = todayISO()) {
  const ym = String(today).slice(0, 7)
  const inMonth = d => typeof d === 'string' && d.slice(0, 7) === ym && d <= today
  const checks = visitDays(S).filter(inMonth)
  const days = new Set(checks)
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) if (inMonth(w?.d)) days.add(w.d)
  return { days: days.size, checkIns: checks.length }
}

/** The centres you checked in at, most recent first, each once: suggestions for the next one. */
export function recentCentres(S, max = 6) {
  const out = []
  for (const d of visitDays(S).reverse()) {
    const c = visitOf(S, d)?.centre
    if (c && !out.some(x => x.toLowerCase() === c.toLowerCase())) out.push(c)
    if (out.length >= max) break
  }
  return out
}
