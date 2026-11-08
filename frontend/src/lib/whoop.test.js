import { describe, it, expect } from 'vitest'
import { DASH, numOrDash, fmtSleep, fmtSteps, zoneLine, syncMessage, whoopReturn, RETURN_MESSAGE } from './whoop.js'
import { cardState, CARD, CARDS } from './integrations.js'

describe('missing data is a dash, never 0', () => {
  it('numbers', () => {
    expect(numOrDash(null)).toBe(DASH); expect(numOrDash(undefined)).toBe(DASH); expect(numOrDash(NaN)).toBe(DASH)
    expect(numOrDash(0)).toBe('0'); expect(numOrDash(31.81, 1)).toBe('31.8')
  })
  it('steps keep a real zero and separators', () => {
    expect(fmtSteps(null)).toBe(DASH); expect(fmtSteps(0)).toBe('0'); expect(fmtSteps(8234)).toBe('8,234')
  })
  it('sleep', () => {
    expect(fmtSleep(null)).toBe(DASH); expect(fmtSleep(457)).toBe('7h 37m'); expect(fmtSleep(60)).toBe('1h 00m'); expect(fmtSleep(-1)).toBe(DASH)
  })
})

describe('zone 4-5 line', () => {
  it('maps every status', () => {
    expect(zoneLine(null)).toBeNull()
    expect(zoneLine({ status: 'building', minutes: 5 }).ink).toBe('var(--grey)')
    expect(zoneLine({ status: 'on-target', minutes: 22 }).ink).toBe('var(--green)')
    expect(zoneLine({ status: 'high', minutes: 28 }).ink).toBe('var(--yellow)')
    const over = zoneLine({ status: 'over', minutes: 40, warnAbove: 30 })
    expect(over.ink).toBe('var(--red)'); expect(over.args).toEqual([30])
  })
})

describe('sync answers and the return from Whoop', () => {
  it('says what happened', () => {
    expect(syncMessage({ ok: true })).toBe('Synced')
    expect(syncMessage({ ok: false, code: 'rate' })).toMatch(/wait/)
    expect(syncMessage({ ok: false, code: 'reauth' })).toMatch(/connected again/)
    expect(syncMessage({ ok: false, skipped: 'busy' })).toBe('Already syncing')
    expect(syncMessage({ ok: false, code: 'network' })).toBe('Sync failed')
  })
  it('reads ?whoop= from the hash route, and ignores anything else', () => {
    expect(whoopReturn('#/settings/integrations?whoop=ok')).toBe('ok')
    expect(whoopReturn('#/settings/integrations?whoop=denied')).toBe('denied')
    expect(whoopReturn('', '?whoop=error')).toBe('error')
    expect(whoopReturn('#/settings/integrations?whoop=<script>')).toBeNull()
    expect(whoopReturn('#/settings/integrations')).toBeNull()
    for (const k of ['ok', 'denied', 'signin', 'error']) expect(RETURN_MESSAGE[k]).toBeTruthy()
  })
})

describe('the Whoop card in the directory', () => {
  const base = { mobile: false, platform: null, user: { id: 'u' }, demo: false, admin: false, health: null, offered: ['webhook', 'whoop'], server: { connections: [] } }
  it('exists in Health & devices', () => { expect(CARD.whoop.cat).toBe('health'); expect(CARDS.filter(c => c.id === 'whoop')).toHaveLength(1) })
  it('needs a server, so a demo or signed-out device is told so', () => {
    expect(cardState('whoop', { ...base, demo: true })).toEqual({ status: 'server', action: null })
    expect(cardState('whoop', { ...base, user: null })).toEqual({ status: 'server', action: null })
  })
  it('hidden from everyone but an admin when the server did not switch it on', () => {
    expect(cardState('whoop', { ...base, offered: ['webhook'] })).toBeNull()
    expect(cardState('whoop', { ...base, offered: ['webhook'], admin: true })).toEqual({ status: 'off', action: 'open' })
  })
  it('connect -> connected -> attention -> paused', () => {
    expect(cardState('whoop', base)).toEqual({ status: 'off', action: 'connect' })
    const conn = o => ({ ...base, server: { connections: [{ provider: 'whoop', status: 'connected', paused: false, ...o }] } })
    expect(cardState('whoop', conn({}))).toEqual({ status: 'connected', action: 'manage' })
    expect(cardState('whoop', conn({ status: 'attention' }))).toEqual({ status: 'attention', action: 'manage' })
    expect(cardState('whoop', conn({ paused: true }))).toEqual({ status: 'off', action: 'manage' })
  })
})
