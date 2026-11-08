// Whoop (our addition): the small pure rules the Whoop card, sheet and Home card share, so they are
// tested here and the components only draw. Strings returned here are English keys for t().
// The one rule above all: a value Whoop did not send is a dash, never 0.

export const DASH = '–' // an en dash: myGym's rule for every empty value (lib/empty-placeholder.test.js)

/** A number to `dp` places, or a dash. */
export const numOrDash = (v, dp = 0) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : DASH)

/** Whole minutes as "7h 36m", or a dash. */
export function fmtSleep(min) {
  if (typeof min !== 'number' || !Number.isFinite(min) || min < 0) return DASH
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

/** Steps with thousands separators, or a dash. A real 0 stays "0". */
export const fmtSteps = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : DASH)

export const BAND_INK = { green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)' }

/** The week's zone 4-5 minutes against the 20-25 target (warn above 30): words and ink. */
export function zoneLine(z) {
  if (!z) return null
  const m = z.minutes
  switch (z.status) {
    case 'over': return { key: 'Zone 4-5 is over {0} minutes this week. Ease off.', args: [z.warnAbove], ink: 'var(--red)', m }
    case 'high': return { key: 'Zone 4-5 is above the target this week.', args: [], ink: 'var(--yellow)', m }
    case 'on-target': return { key: 'Zone 4-5 is on target this week.', args: [], ink: 'var(--green)', m }
    default: return { key: 'Zone 4-5 is still building this week.', args: [], ink: 'var(--grey)', m }
  }
}

/** What the sync button's answer means, as a toast key (null: nothing to say). */
export function syncMessage(res) {
  if (res?.ok) return 'Synced'
  if (res?.skipped === 'busy') return 'Already syncing'
  if (res?.code === 'rate') return 'Whoop asked us to wait a little. Try again soon.'
  if (res?.code === 'reauth') return 'Whoop needs to be connected again.'
  if (res?.skipped) return 'Not syncing right now'
  return 'Sync failed'
}

/** "?whoop=ok" in the hash route (or the real query) after Whoop sends the browser back. */
export function whoopReturn(hash = '', search = '') {
  const q = (hash.includes('?') ? hash.slice(hash.indexOf('?')) : '') || search
  const v = new URLSearchParams(q).get('whoop')
  return ['ok', 'denied', 'signin', 'expired', 'error'].includes(v) ? v : null
}

export const RETURN_MESSAGE = {
  ok: 'Whoop connected. Your first sync is running.',
  denied: 'Whoop sign-in was cancelled.',
  signin: 'Sign in to myGym first, then connect Whoop.',
  expired: 'That Whoop sign-in link expired. Tap Connect again.',
  error: 'Could not connect Whoop. Try again.',
}
