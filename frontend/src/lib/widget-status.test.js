import { describe, it, expect } from 'vitest'
import { osStatusText, fmtBytes, snapshotBlocks, widgetStatusView } from './widget-status.js'

const okStatus = { group: 'ABCDE12345.com.madhavsais.mygym.shared', groupSource: 'keychain', probe: 0, keychainWrite: 0, keychainRead: 0, appGroup: false, bytes: 2048, at: 1700000000000 }

describe('osStatusText', () => {
  it('names the Security codes a widget write or read ends with', () => {
    expect(osStatusText(0)).toBe('errSecSuccess (0)')
    expect(osStatusText(-25300)).toBe('errSecItemNotFound (-25300)')
    expect(osStatusText(-34018)).toBe('errSecMissingEntitlement (-34018)')
    expect(osStatusText(-1)).toBe('-1')
    expect(osStatusText(undefined)).toBe('–')
    expect(osStatusText(NaN)).toBe('–')
  })
})

describe('fmtBytes', () => {
  it('reads small and kilobyte sizes', () => {
    expect(fmtBytes(300)).toBe('300 B')
    expect(fmtBytes(2048)).toBe('2 KB')
    expect(fmtBytes(1300)).toBe('1.3 KB')
    expect(fmtBytes(0)).toBe('–')
    expect(fmtBytes(null)).toBe('–')
  })
})

describe('snapshotBlocks', () => {
  it('says which blocks a snapshot has', () => {
    expect(snapshotBlocks({ today: '2026-11-12', days: [{ iso: '2026-11-12' }], whoop: { recovery: 60 }, diet: null, day: { workout: null } }))
      .toEqual({ today: true, whoop: true, diet: false, supps: false, day: true })
  })
  it('has nothing for nothing', () => {
    expect(snapshotBlocks(null)).toEqual({ today: false, whoop: false, diet: false, supps: false, day: false })
    expect(snapshotBlocks({ today: '2026-11-12', days: [] }).today).toBe(false)
  })
})

describe('widgetStatusView', () => {
  const diag = { at: 1700000000000, bytes: 2048, blocks: { today: true, whoop: false, diet: true, supps: true, day: true }, error: null }

  it('is ok when written and readable, with the blocks split', () => {
    const v = widgetStatusView(okStatus, diag)
    expect(v.verdict).toBe('ok')
    expect(v.group).toBe(okStatus.group)
    expect(v.write).toBe('errSecSuccess (0)')
    expect(v.size).toBe('2 KB')
    expect(v.have).toEqual(['today', 'diet', 'supps', 'day'])
    expect(v.missing).toEqual(['whoop'])
  })
  it('has no plugin when status() did not answer', () => {
    expect(widgetStatusView(null, diag).verdict).toBe('no-plugin')
  })
  it('has no group without a keychain group or an App Group', () => {
    expect(widgetStatusView({ ...okStatus, group: undefined, appGroup: false }, diag).verdict).toBe('no-group')
  })
  it('an App Group alone is enough', () => {
    expect(widgetStatusView({ ...okStatus, group: undefined, appGroup: true, keychainRead: -50 }, diag).verdict).toBe('ok')
  })
  it('a keychain write that failed, or a plugin error', () => {
    expect(widgetStatusView({ ...okStatus, keychainWrite: -34018 }, diag).verdict).toBe('write-failed')
    expect(widgetStatusView(okStatus, { ...diag, error: 'could not write the widget data' }).verdict).toBe('write-failed')
  })
  it('never written', () => {
    expect(widgetStatusView({ ...okStatus, at: undefined, keychainWrite: undefined, keychainRead: -25300 }, { blocks: null }).verdict).toBe('never')
  })
  it('written but not readable back', () => {
    expect(widgetStatusView({ ...okStatus, keychainRead: -25300 }, diag).verdict).toBe('read-failed')
  })
  it('takes the page time and size when the plugin lost them (a restart)', () => {
    const v = widgetStatusView({ ...okStatus, at: undefined, bytes: 0 }, diag)
    expect(v.at).toBe(diag.at)
    expect(v.size).toBe('2 KB')
  })
})
