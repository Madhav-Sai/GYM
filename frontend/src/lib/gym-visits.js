// Manual gym check-in (this fork's addition). One tap on Home says "I was at the gym today": it
// counts towards the streak and shows on the calendar, whether or not a workout was logged (a Cult
// class, a session you did not log set by set). The QR membership codes stay where they were, on
// their own page.
//
// Stored per day, exactly the way day notes are (lib/day-notes.js):
//
//   S.gymVisits = { '2026-11-09': { on: true, _ts }, … }
//
// One entry per day with the time it was written, so two devices that each checked in on a
// different day keep both, and the same day keeps the later write (lib/sync-merge.js
// mergeStampedMap). Taking a check-in back is a stamped entry without `on`, not a deleted key: a
// delete would come straight back from the other device's copy on the next sync.
//
// Only today and the days before can be checked in: a check-in is a statement that you went.
import { todayISO } from './format.js'

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
  return { ...base, [iso]: on ? { on: true, _ts: now } : { _ts: now } }
}
