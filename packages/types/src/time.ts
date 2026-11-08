// All dates in the product are Asia/Kolkata (spec §9).
export const TZ = "Asia/Kolkata";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type DayLabel = (typeof DAYS)[number];

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
/** YYYY-MM-DD in IST */
export function istDate(d: Date = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}
export function istDayLabel(d: Date = new Date()): DayLabel {
  return parts(d).weekday as DayLabel;
}
/** Start (YYYY-MM-DD, Monday) of the IST week containing d */
export function istWeekStart(d: Date = new Date()): string {
  const [y, m, day] = istDate(d).split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, day));
  const dow = (utc.getUTCDay() + 6) % 7; // Mon=0
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}
export const isSameIstWeek = (a: Date, b: Date = new Date()) => istWeekStart(a) === istWeekStart(b);
