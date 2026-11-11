import { describe, expect, it } from 'vitest'
import { bodyReminders, lastPhotoDay, lastInbodyDay, lastWaistDay, buildBodyReminderNotifications, BODY_ID_BASE, BODY_ID_COUNT, WAIST_NOTE } from './body-reminders.js'

const H = n => String(n).repeat(64).slice(0, 64)
const photo = h => ({ kind: 'image', hash: h, mime: 'image/webp', size: 1000, width: 800, height: 600, at: 1 })
const video = h => ({ kind: 'video', hash: h, mime: 'video/mp4', size: 1000, width: 800, height: 600, at: 1, dur: 3 })
const TODAY = '2026-11-11'

describe('what is due', () => {
  it('a fresh profile: photo and waist due, InBody only once the record is known', () => {
    const S = { workouts: [], measurements: [] }
    expect(bodyReminders({ S, today: TODAY }).map(r => r.id)).toEqual(['photo', 'waist'])
    const all = bodyReminders({ S, inbody: [], today: TODAY })
    expect(all.map(r => r.id)).toEqual(['photo', 'inbody', 'waist'])
    expect(all.map(r => r.to)).toEqual(['/progress-photos', '/medical/inbody', '/measurements'])
    expect(all[0].days).toBe(null)
    expect(all[2].note).toBe(WAIST_NOTE)
  })

  it('progress photo: a workout still or a day photo inside 30 days is enough, a video is not', () => {
    const recent = { workouts: [{ d: '2026-10-20', media: [photo(H(1))] }] }
    expect(lastPhotoDay(recent)).toBe('2026-10-20')
    expect(bodyReminders({ S: recent, today: TODAY }).some(r => r.id === 'photo')).toBe(false)
    const onlyVideo = { workouts: [{ d: '2026-11-10', media: [video(H(2))] }] }
    expect(lastPhotoDay(onlyVideo)).toBe(null)
    const dayPhoto = { workouts: [], dayPhotos: { [H(3)]: { d: '2026-11-01', m: photo(H(3)), _ts: 1 } } }
    expect(lastPhotoDay(dayPhoto)).toBe('2026-11-01')
    const old = { workouts: [{ d: '2026-10-12', media: [photo(H(4))] }] }
    const due = bodyReminders({ S: old, today: TODAY }).find(r => r.id === 'photo')
    expect(due.days).toBe(30)
    expect(due.last).toBe('2026-10-12')
  })

  it('InBody: due when the newest scan is 30 days old or more', () => {
    const S = { workouts: [], measurements: [{ d: '2026-11-05', waist: 82 }] }
    expect(lastInbodyDay([{ date: '2026-09-01' }, { date: '2026-10-20' }, { date: 'junk' }])).toBe('2026-10-20')
    expect(bodyReminders({ S, inbody: [{ date: '2026-10-20' }], today: TODAY }).map(r => r.id)).toEqual(['photo'])
    expect(bodyReminders({ S, inbody: [{ date: '2026-10-12' }], today: TODAY }).map(r => r.id)).toEqual(['photo', 'inbody'])
  })

  it('waist: due after 14 days; another measurement without the waist does not count', () => {
    const S = { workouts: [], measurements: [{ d: '2026-10-20', waist: 83 }, { d: '2026-11-08', chest: 100 }] }
    expect(lastWaistDay(S)).toBe('2026-10-20')
    const w = bodyReminders({ S, today: TODAY }).find(r => r.id === 'waist')
    expect(w.days).toBe(22)
    expect(bodyReminders({ S: { ...S, measurements: [{ d: '2026-10-29', waist: 83 }] }, today: TODAY }).some(r => r.id === 'waist')).toBe(false)
    expect(bodyReminders({ S: { ...S, measurements: [{ d: '2026-10-28', waist: 83 }] }, today: TODAY }).some(r => r.id === 'waist')).toBe(true)
  })
})

describe('the phone notification', () => {
  it('the 1st of each month at 10:30 India time, on ids 6000 up', () => {
    const n = buildBodyReminderNotifications(new Date('2026-11-11T00:00:00Z'))
    expect(n).toHaveLength(12)
    expect(n[0].schedule.at.toISOString()).toBe('2026-12-01T05:00:00.000Z')
    expect(n[1].schedule.at.toISOString()).toBe('2027-01-01T05:00:00.000Z')
    expect(n[11].schedule.at.toISOString()).toBe('2027-11-01T05:00:00.000Z')
    expect(n.map(x => x.id)).toEqual(Array.from({ length: 12 }, (_, k) => BODY_ID_BASE + k))
    expect(n.every(x => x.id >= 6000 && x.id < 6000 + BODY_ID_COUNT)).toBe(true)
    expect(n[0].body).toContain('Waist + weight')
  })
  it('on the 1st before 10:30 India time, today counts', () => {
    const n = buildBodyReminderNotifications(new Date('2026-12-01T04:00:00Z'), 2)
    expect(n.map(x => x.schedule.at.toISOString())).toEqual(['2026-12-01T05:00:00.000Z', '2027-01-01T05:00:00.000Z'])
  })
})
