// India time (Asia/Kolkata, UTC+5:30, no daylight saving) for the Diet and Supplements screens
// (our addition). The owner works 2pm to 11pm and goes to bed after midnight, so a "health day"
// runs from 04:00 to 04:00: the 00:45 magnesium and a late snack still count for the evening before.

export const IST_OFFSET_MIN = 330
export const DAY_ROLLOVER_MIN = 4 * 60
const MIN = 60000

const pad = n => String(n).padStart(2, '0')
const isoUTC = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** India wall-clock fields of an instant. */
export function istParts(now = new Date()) {
  const d = new Date(+now + IST_OFFSET_MIN * MIN)
  return { day: isoUTC(d), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() }
}

/** The health day ('YYYY-MM-DD') an instant belongs to, with the 04:00 rollover. */
export function healthDay(now = new Date()) {
  return istParts(new Date(+now - DAY_ROLLOVER_MIN * MIN)).day
}

/** Minutes since midnight of the health day: 00:45 the night after reads as 24:45 (1485). */
export function healthMinutes(now = new Date()) {
  const { minutes } = istParts(now)
  return minutes < DAY_ROLLOVER_MIN ? minutes + 1440 : minutes
}

/** Weekday (0 Sunday) of a 'YYYY-MM-DD'. */
export const weekdayOf = day => new Date(day + 'T00:00:00Z').getUTCDay()

/** 'YYYY-MM-DD' plus n days. */
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoUTC(d)
}

/** Whole days from a to b ('YYYY-MM-DD'). */
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

/** The instant of an India wall-clock time on a day: atIST('2026-11-08', '20:30'). */
export function atIST(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.parse(day + 'T00:00:00Z') + (h * 60 + m - IST_OFFSET_MIN) * MIN)
}

export const minutesOf = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }
