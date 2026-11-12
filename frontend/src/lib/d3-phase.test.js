import { describe, expect, test } from 'vitest'
import { doseDays, nextDose, isDoseDay, d3Phase, firstDowOfMonth } from './d3-phase.js'
import { checklist, adherence, dueOn, doseFor, pendingCount, phaseOf } from './supplements.js'
import { buildSupplementNotifications } from './supp-reminders.js'

const SCH = { kind: 'phase', start: '2026-09-06', weeklyDoses: 8, everyDays: 28, dow: 0 }
const WEEKLY = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']

describe('D3 phase', () => {
  test('8 weekly Sundays from 2026-09-06, then every 28 days on Sunday', () => {
    expect(doseDays(SCH, '2026-10-25')).toEqual(WEEKLY)
    expect(doseDays(SCH, '2027-01-20')).toEqual([...WEEKLY, '2026-11-22', '2026-12-20', '2027-01-17'])
    expect(doseDays(SCH, '2026-09-05')).toEqual([])
    for (const d of doseDays(SCH, '2027-06-01')) expect(new Date(d + 'T00:00:00Z').getUTCDay()).toBe(0)
  })

  test('the next dose, and which days are dose days', () => {
    expect(nextDose(SCH, '2026-09-01')).toBe('2026-09-06')
    expect(nextDose(SCH, '2026-09-07')).toBe('2026-09-13')
    expect(nextDose(SCH, '2026-10-25')).toBe('2026-10-25')
    expect(nextDose(SCH, '2026-10-26')).toBe('2026-11-22')
    expect(nextDose(SCH, '2026-11-08')).toBe('2026-11-22')
    expect(isDoseDay(SCH, '2026-11-22')).toBe(true)
    expect(isDoseDay(SCH, '2026-11-08')).toBe(false)
    expect(isDoseDay(SCH, '2026-11-01')).toBe(false)
  })

  test('mid-phase: which weekly doses are done, missed, due and still to come', () => {
    const log = { '2026-09-06': { status: 'taken' }, '2026-09-13': { status: 'taken' }, '2026-09-27': { status: 'skipped' } }
    const p = d3Phase(SCH, log, '2026-10-04')
    expect(p.phase).toBe('weekly')
    expect(p.weekly.map(w => w.status)).toEqual(['taken', 'taken', 'missed', 'skipped', 'due', 'upcoming', 'upcoming', 'upcoming'])
    expect(p.taken).toBe(2)
    expect(p.dueToday).toBe(true)
    expect(p.missedLast).toBeNull()   // the one before was skipped on purpose, not missed
  })

  test('a missed dose is never moved: the next date stays where it was', () => {
    const p = d3Phase(SCH, {}, '2026-09-14')
    expect(p.missedLast).toBe('2026-09-13')
    expect(p.next).toBe('2026-09-20')
    expect(p.dueToday).toBe(false)
  })

  test('after the 8th dose it switches to monthly on its own', () => {
    const log = Object.fromEntries(WEEKLY.map(d => [d, { status: 'taken' }]))
    const p = d3Phase(SCH, log, '2026-11-08')
    expect(p.phase).toBe('monthly')
    expect(p.taken).toBe(8)
    expect(p.next).toBe('2026-11-22')
    expect(d3Phase(SCH, log, '2026-11-22')).toMatchObject({ dueToday: true, monthly: [{ day: '2026-11-22', status: 'due' }] })
  })
})

const LIST = [
  { id: 'd3', name: 'Uprise-D3 60K', dose: '1 capsule', schedule: SCH, requiresFat: true, remind: '20:30', active: true, createdDay: '2026-11-08' },
  { id: 'omega3', name: 'Omega 3', dose: '1 capsule', schedule: { kind: 'daily' }, requiresFat: true, remind: '10:15', active: true, createdDay: '2026-11-01' },
  { id: 'whey', name: 'Whey', dose: '1 scoop', schedule: { kind: 'daily' }, doseByDayType: { training: '2 scoops (post-gym + bedtime)', rest: '1 scoop' }, active: true, createdDay: '2026-11-01' },
  { id: 'magnesium', name: 'Magnesium', dose: '1 tablet', schedule: { kind: 'daily' }, remind: '00:45', active: true, createdDay: '2026-11-01' },
  { id: 'old', name: 'Old', dose: '1', schedule: { kind: 'daily' }, active: false, createdDay: '2026-01-01' },
]

describe('supplements checklist and adherence', () => {
  test('due on a day: active only, from createdDay, D3 on its dose days', () => {
    expect(checklist(LIST, {}, '2026-11-08', 'rest').map(i => i.s.id)).toEqual(['omega3', 'whey', 'magnesium'])
    expect(checklist(LIST, {}, '2026-11-22', 'rest').map(i => i.s.id)).toEqual(['d3', 'omega3', 'whey', 'magnesium'])
    expect(dueOn(LIST[1], '2026-10-31')).toBe(false)
    expect(dueOn({ schedule: { kind: 'weekly', dow: 3 } }, '2026-11-11')).toBe(true)
    expect(dueOn({ schedule: { kind: 'weekly', dow: 3 } }, '2026-11-12')).toBe(false)
  })

  test('whey: 2 scoops on a training day, 1 otherwise', () => {
    expect(doseFor(LIST[2], 'training')).toBe('2 scoops (post-gym + bedtime)')
    expect(doseFor(LIST[2], 'cardio')).toBe('1 scoop')
  })

  test('status from the log, pending count', () => {
    const log = { '2026-11-08': { omega3: { status: 'taken' }, whey: { status: 'skipped', reason: 'Out of stock' } } }
    const items = checklist(LIST, log, '2026-11-08', 'rest')
    expect(items.map(i => i.status)).toEqual(['taken', 'skipped', 'pending'])
    expect(items[1].reason).toBe('Out of stock')
    expect(pendingCount(items)).toBe(1)
  })

  test('30-day adherence: taken over due, today only once marked, a skip is not taken', () => {
    // omega3 due from 2026-11-01: 8 days to 2026-11-08
    const log = { '2026-11-01': { omega3: { status: 'taken' } }, '2026-11-02': { omega3: { status: 'taken' } }, '2026-11-03': { omega3: { status: 'skipped' } } }
    expect(adherence(LIST[1], log, '2026-11-08')).toEqual({ due: 7, taken: 2, pct: 29 })
    log['2026-11-08'] = { omega3: { status: 'taken' } }
    expect(adherence(LIST[1], log, '2026-11-08')).toEqual({ due: 8, taken: 3, pct: 38 })
    expect(adherence(LIST[1], {}, '2026-11-01')).toBeNull()
  })

  test('the phase of the D3 on the list', () => {
    expect(phaseOf(LIST, {}, '2026-11-08')).toMatchObject({ phase: 'monthly', next: '2026-11-22' })
    expect(phaseOf(LIST.slice(1), {}, '2026-11-08')).toBeNull()
  })
})

describe('supplement reminders', () => {
  test('India times; D3 only on its Sunday; magnesium the night after; marked ones skipped', () => {
    const now = new Date('2026-11-08T04:00:00Z')   // 09:30 in India
    const log = { '2026-11-09': { omega3: { status: 'taken' } } }
    const n = buildSupplementNotifications(LIST, log, '2026-11-08', now)
    const at = id => n.filter(x => x.title === id).map(x => x.schedule.at.toISOString())
    expect(at('Omega 3')[0]).toBe('2026-11-08T04:45:00.000Z')   // 10:15 IST
    expect(at('Omega 3')).not.toContain('2026-11-09T04:45:00.000Z')
    expect(at('Magnesium')[0]).toBe('2026-11-08T19:15:00.000Z')  // 00:45 IST on the 9th
    // not due this week, but its next Sunday is queued ahead even though the daily window is two days
    expect(at('Vitamin D3 tonight')).toEqual(['2026-11-22T15:00:00.000Z'])
    expect(n.some(x => x.title === 'Whey')).toBe(false)   // no reminder time
    const sunday = buildSupplementNotifications(LIST, {}, '2026-11-22', new Date('2026-11-22T04:00:00Z'))
    const d3 = sunday.find(x => x.title === 'Vitamin D3 tonight')
    expect(d3.schedule.at.toISOString()).toBe('2026-11-22T15:00:00.000Z')  // 20:30 IST
    expect(d3.body).toMatch(/fat/)
    expect(new Set(n.map(x => x.id)).size).toBe(n.length)
  })
})

describe('D3 monthly on the first Sunday', () => {
  const FS = { ...SCH, monthly: 'firstSunday', monthlyFrom: '2026-11-11' }

  test('the first Sunday of a month', () => {
    expect(firstDowOfMonth('2026-11-20')).toBe('2026-11-01')
    expect(firstDowOfMonth('2026-12-31')).toBe('2026-12-06')
    expect(firstDowOfMonth('2027-01-15')).toBe('2027-01-03')
    expect(firstDowOfMonth('2027-02-01')).toBe('2027-02-07')
  })

  test('from 2026-11-11: the weekly history stays, then one dose on each first Sunday', () => {
    expect(doseDays(FS, '2027-03-01')).toEqual([...WEEKLY, '2026-12-06', '2027-01-03', '2027-02-07'])
    expect(nextDose(FS, '2026-11-11')).toBe('2026-12-06')
    expect(nextDose(FS, '2026-12-07')).toBe('2027-01-03')
    expect(nextDose(FS, '2026-12-27')).toBe('2027-01-03')
    expect(isDoseDay(FS, '2026-11-22')).toBe(false)   // the old every-28-days date is gone
    expect(isDoseDay(FS, '2026-12-06')).toBe(true)
    expect(isDoseDay(FS, '2026-11-01')).toBe(false)   // before monthlyFrom: never a dose day
    for (const d of doseDays(FS, '2028-01-01')) expect(new Date(d + 'T00:00:00Z').getUTCDay()).toBe(0)
    // a year of first Sundays: twelve doses from Dec 2026 to Nov 2027
    expect(doseDays(FS, '2027-11-30').filter(d => d > '2026-11-11')).toHaveLength(12)
  })

  test('the weekly doses stop at monthlyFrom, even mid-phase', () => {
    const long = { ...FS, weeklyDoses: 12 }   // weekly would run to 2026-11-22
    expect(doseDays(long, '2026-12-31')).toEqual([...WEEKLY, '2026-11-01', '2026-11-08', '2026-12-06'])
    const p = d3Phase(long, {}, '2026-11-11')
    expect(p.phase).toBe('monthly')
    expect(p.weekly).toHaveLength(10)
    expect(p.firstSunday).toBe(true)
    expect(p.next).toBe('2026-12-06')
  })

  test('without monthlyFrom it starts right after the weekly doses', () => {
    const plain = { ...SCH, monthly: 'firstSunday' }
    expect(doseDays(plain, '2026-12-31')).toEqual([...WEEKLY, '2026-11-01', '2026-12-06'])
  })

  test('a missed first-Sunday dose is not moved', () => {
    const p = d3Phase(FS, {}, '2026-12-08')
    expect(p.missedLast).toBe('2026-12-06')
    expect(p.next).toBe('2027-01-03')
    expect(p.monthly).toEqual([{ day: '2026-12-06', status: 'missed' }])
  })
})

describe('reminders on the 6 am plan (round 2 of the seeded list)', () => {
  const FS = { ...SCH, monthly: 'firstSunday', monthlyFrom: '2026-11-11' }
  const V2 = [
    { id: 'd3', name: 'Uprise-D3 60K', dose: '1 capsule', schedule: FS, requiresFat: true, remind: '23:00', active: true, createdDay: '2026-11-08' },
    { id: 'omega3', name: 'Omega-3 fish oil, breakfast', dose: '1 capsule', schedule: { kind: 'daily' }, requiresFat: true, remind: '07:30', active: true, createdDay: '2026-11-08' },
    { id: 'omega3-lunch', name: 'Omega-3 fish oil, lunch', dose: '1 capsule', schedule: { kind: 'daily' }, requiresFat: true, remind: '13:15', active: true, createdDay: '2026-11-11' },
    { id: 'omega3-dinner', name: 'Omega-3 fish oil, dinner', dose: '1 capsule', schedule: { kind: 'daily' }, requiresFat: true, remind: '23:00', active: true, createdDay: '2026-11-11' },
    { id: 'whey', name: 'Whey protein, after the gym', dose: '1 scoop', schedule: { kind: 'daily' }, remind: '07:15', active: true, createdDay: '2026-11-08' },
    { id: 'whey-night', name: 'Whey protein, night', dose: '1 scoop', schedule: { kind: 'daily' }, remind: null, active: true, createdDay: '2026-11-11' },
    { id: 'magnesium', name: 'Magnesium', dose: '1 tablet', schedule: { kind: 'daily' }, remind: '23:45', active: true, createdDay: '2026-11-08' },
  ]
  test('three omega-3 reminders a day, whey after the gym, D3 only on the first Sunday at 23:00', () => {
    const n = buildSupplementNotifications(V2, {}, '2026-12-01', new Date('2026-11-30T23:00:00Z'))
    const at = title => n.filter(x => x.title === title).map(x => x.schedule.at.toISOString())
    expect(at('Omega-3 fish oil, breakfast')[0]).toBe('2026-12-01T02:00:00.000Z')   // 07:30 IST
    expect(at('Omega-3 fish oil, lunch')[0]).toBe('2026-12-01T07:45:00.000Z')       // 13:15 IST
    expect(at('Omega-3 fish oil, dinner')[0]).toBe('2026-12-01T17:30:00.000Z')      // 23:00 IST
    expect(at('Whey protein, after the gym')[0]).toBe('2026-12-01T01:45:00.000Z')   // 07:15 IST
    expect(at('Magnesium')[0]).toBe('2026-12-01T18:15:00.000Z')                    // 23:45 IST, same day
    expect(at('Whey protein, night')).toEqual([])
    expect(at('Vitamin D3 tonight')).toEqual(['2026-12-06T17:30:00.000Z'])
    expect(checklist(V2, {}, '2026-12-06', 'rest').map(i => i.s.id)).toContain('d3')
    expect(checklist(V2, {}, '2026-11-22', 'rest').map(i => i.s.id)).not.toContain('d3')
    const ids = n.map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(4000)
    expect(Math.max(...ids)).toBeLessThan(4140)
  })
})
