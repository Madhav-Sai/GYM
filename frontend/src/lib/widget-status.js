// myGym: Settings → Look & Home → Widgets (iPhone). What WidgetBridge.status() answered
// (ios/App/App/WidgetBridgePlugin.swift) and what lib/widgets.js last sent, read into one view:
// where the widget data breaks (no keychain group, a failed write, nothing to read back) and which
// blocks the last snapshot had. Pure, so the reading is tested (widget-status.test.js).

// The Security framework codes a widget write or read can end with. Apple's own names: a
// diagnostic, not a sentence, so they stay untranslated.
export const OS_STATUS = {
  0: 'errSecSuccess',
  '-25300': 'errSecItemNotFound',
  '-34018': 'errSecMissingEntitlement',
  '-25291': 'errSecNotAvailable',
  '-25308': 'errSecInteractionNotAllowed',
  '-25299': 'errSecDuplicateItem',
  '-25243': 'errSecNoAccessForItem',
  '-25293': 'errSecAuthFailed',
  '-50': 'errSecParam',
}

/** -25300 → "errSecItemNotFound (-25300)", 0 → "errSecSuccess (0)", nothing → "–". */
export function osStatusText (code) {
  if (typeof code !== 'number' || !Number.isFinite(code)) return '–'
  const name = OS_STATUS[code]
  return name ? `${name} (${code})` : String(code)
}

/** 1234 → "1.2 KB", 300 → "300 B", 0 or nothing → "–". */
export function fmtBytes (n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '–'
  if (n < 1024) return `${Math.round(n)} B`
  return `${Math.round(n / 102.4) / 10} KB`
}

// The blocks the widgets draw from, in the order the row lists them.
export const SNAPSHOT_BLOCKS = ['today', 'whoop', 'diet', 'supps', 'day']

/** Which of the blocks a snapshot carries (`today`: the plan days the workout widgets read). */
export function snapshotBlocks (snap) {
  const s = snap && typeof snap === 'object' ? snap : {}
  return {
    today: typeof s.today === 'string' && Array.isArray(s.days) && s.days.length > 0,
    whoop: !!s.whoop && typeof s.whoop === 'object',
    diet: !!s.diet && typeof s.diet === 'object',
    supps: !!s.supps && typeof s.supps === 'object',
    day: !!s.day && typeof s.day === 'object',
  }
}

/**
 * The verdict first, then the details:
 *   'no-plugin'    status() did not answer (no bridge, or a build from before it existed)
 *   'no-group'     no keychain group and no App Group: the widgets cannot share anything
 *   'write-failed' the last write was refused (by the plugin, or the keychain said no)
 *   'never'        nothing written yet
 *   'read-failed'  written, but reading it back fails, so the widgets cannot read it either
 *   'ok'           written and readable
 * `diag` is lib/widgets.js widgetSyncDiag(): { at, bytes, blocks, error }.
 */
export function widgetStatusView (status, diag) {
  const d = diag && typeof diag === 'object' ? diag : {}
  const st = status && typeof status === 'object' ? status : null
  const at = (st && typeof st.at === 'number' ? st.at : null) ?? (typeof d.at === 'number' ? d.at : null)
  const bytes = (st && st.bytes > 0 ? st.bytes : 0) || (d.bytes > 0 ? d.bytes : 0)
  const blocks = d.blocks && typeof d.blocks === 'object' ? d.blocks : null
  const view = {
    verdict: 'ok',
    group: st?.group || null,
    groupSource: st?.groupSource || null,
    probe: osStatusText(st?.probe),
    write: osStatusText(st?.keychainWrite),
    read: osStatusText(st?.keychainRead),
    appGroup: !!st?.appGroup,
    at,
    size: fmtBytes(bytes),
    error: typeof d.error === 'string' && d.error ? d.error : null,
    have: blocks ? SNAPSHOT_BLOCKS.filter(k => blocks[k]) : [],
    missing: blocks ? SNAPSHOT_BLOCKS.filter(k => !blocks[k]) : [],
  }
  if (!st) view.verdict = 'no-plugin'
  else if (!st.group && !st.appGroup) view.verdict = 'no-group'
  else if (view.error || (!st.appGroup && typeof st.keychainWrite === 'number' && st.keychainWrite !== 0)) view.verdict = 'write-failed'
  else if (at == null) view.verdict = 'never'
  else if (!st.appGroup && st.keychainRead !== 0) view.verdict = 'read-failed'
  return view
}
