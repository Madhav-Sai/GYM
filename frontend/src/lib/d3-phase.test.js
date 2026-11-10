import { describe, expect, test } from 'vitest'
import { doseDays, nextDose, isDoseDay, d3Phase } from './d3-phase.js'
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
    expect(n.filter(x => x.title === 'Vitamin D3 tonight')).toEqual([])
    expect(n.some(x => x.title === 'Whey')).toBe(false)   // no reminder time
    const sunday = buildSupplementNotifications(LIST, {}, '2026-11-22', new Date('2026-11-22T04:00:00Z'))
    const d3 = sunday.find(x => x.title === 'Vitamin D3 tonight')
    expect(d3.schedule.at.toISOString()).toBe('2026-11-22T15:00:00.000Z')  // 20:30 IST
    expect(d3.body).toMatch(/fat/)
    expect(new Set(n.map(x => x.id)).size).toBe(n.length)
  })
})
