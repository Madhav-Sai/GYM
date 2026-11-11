// myGym: the iPhone widgets' buttons (+250 ml on Macros, Taken on Supplements), the page's side.
// A widget has no session and cannot reach the server, so a tap is queued in the shared keychain
// (WidgetActionQueue in ios/App/App/WorkoutActivity.swift, added by the intents in
// ios/App/OpenGymWidgets/MyGymWidgets.swift). Each time the app opens or comes back,
// startWidgetSync (lib/widgets.js) drains that queue through WidgetBridge.drainActions and this
// module sends each action with the same calls the Diet and Supplements screens make.
//
// The native queue is cleared by the drain, so what is drained is kept here (localStorage) until
// the server took it: a failed post stays for the next try. Every action carries its own id and the
// ids already sent are remembered, so a tap that comes back twice (the widget and the app are two
// processes writing one keychain item) is sent once. A refusal that will never change (a
// supplement since deleted, a bad amount) drops the action instead of retrying it forever.
//
// An action: { id, kind: 'water', amount: ml, day, at } or { id, kind: 'supp', suppId, day, at },
// `day` the health day (lib/ist.js) the tap was made on, `at` ms since 1970.
import { healthDay } from './ist.js'

export const WIDGET_ACTIONS_KEY = 'gym_widget_actions_v1'
// The server takes a water change of at most 2000 ml (api/health/diet.js addWater).
export const WIDGET_WATER_MAX_ML = 2000
// How many sent ids are remembered against a duplicate.
export const WIDGET_APPLIED_MAX = 300
// How many unsent actions are kept: the newest ones.
export const WIDGET_PENDING_MAX = 100

const DAY = /^\d{4}-\d{2}-\d{2}$/
const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 80

/** The action as this module uses it, or null when it is not one. */
export function cleanAction (a) {
  if (!a || typeof a !== 'object' || !isId(a.id)) return null
  const at = typeof a.at === 'number' && Number.isFinite(a.at) ? a.at : null
  const day = typeof a.day === 'string' && DAY.test(a.day) ? a.day : at != null ? healthDay(new Date(at)) : null
  if (!day) return null
  if (a.kind === 'water') {
    const amount = Number(a.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > WIDGET_WATER_MAX_ML) return null
    return { id: a.id, kind: 'water', amount: Math.round(amount), day, at }
  }
  if (a.kind === 'supp') {
    if (!isId(a.suppId)) return null
    return { id: a.id, kind: 'supp', suppId: a.suppId.slice(0, 40), day, at }
  }
  return null
}

/** What WidgetBridge.drainActions answered ({ json: '[...]' }, or the array itself), as clean actions. */
export function parseDrained (answer) {
  let list = answer
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) list = answer.json ?? answer.actions
  if (typeof list === 'string') { try { list = JSON.parse(list) } catch { return [] } }
  return Array.isArray(list) ? list.map(cleanAction).filter(Boolean) : []
}

/** The pending list with the drained ones added: one per id, none already sent, oldest first. */
export function mergePending (pending, drained, applied = []) {
  const sent = new Set(applied)
  const seen = new Set()
  const out = []
  for (const a of [...(pending || []), ...(drained || [])]) {
    const c = cleanAction(a)
    if (!c || sent.has(c.id) || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  out.sort((x, y) => (x.at ?? 0) - (y.at ?? 0))
  return out.slice(-WIDGET_PENDING_MAX)
}

/** The server call an action makes: the Diet screen's water tap, the Supplements screen's Taken. */
export function requestOf (a) {
  if (a.kind === 'water') return { path: '/api/health/diet/water', body: { day: a.day, ml: a.amount } }
  return { path: '/api/health/supplements/mark', body: { day: a.day, id: a.suppId, status: 'taken' } }
}

// A refusal that will be the same next time: the request itself is wrong (400) or what it points
// at is gone (404). Anything else (offline, timeout, signed out, the server down) is tried again.
const permanent = e => e && (e.status === 400 || e.status === 404 || e.status === 422)

/**
 * Sends each action once, oldest first. `post(path, body)` is the api() POST. Answers the ids the
 * server took, the ids dropped for good, and the actions to keep for the next try.
 */
export async function sendActions (actions, post) {
  const done = [], dropped = [], keep = []
  for (const a of actions) {
    const { path, body } = requestOf(a)
    try {
      await post(path, body)
      done.push(a.id)
    } catch (e) {
      if (permanent(e)) dropped.push(a.id)
      else keep.push(a)
    }
  }
  return { done, dropped, keep }
}

/** The ids remembered as sent: the newest ones, without repeats. */
export function rememberApplied (applied, ids, max = WIDGET_APPLIED_MAX) {
  const out = [...(applied || [])].filter(id => !ids.includes(id))
  out.push(...ids)
  return out.slice(-max)
}

/**
 * The widget snapshot with the actions not sent yet drawn in, the way the widget drew them when
 * tapped: water added to the day's total, a supplement ticked. Only for the day the block is about,
 * so an action from another day never moves today's numbers. The input is not changed.
 */
export function overlayPending (snap, pending) {
  if (!snap || !Array.isArray(pending) || !pending.length) return snap
  const out = { ...snap }
  const diet = snap.diet
  if (diet && typeof diet === 'object') {
    const ml = pending.filter(a => a.kind === 'water' && a.day === diet.day).reduce((n, a) => n + a.amount, 0)
    if (ml > 0) out.diet = { ...diet, water: (typeof diet.water === 'number' && Number.isFinite(diet.water) ? diet.water : 0) + ml }
  }
  const supps = snap.supps
  if (supps && typeof supps === 'object' && Array.isArray(supps.items)) {
    const ids = new Set(pending.filter(a => a.kind === 'supp' && a.day === supps.day).map(a => a.suppId))
    if (ids.size) {
      let ticked = 0, d3 = false
      const items = supps.items.map(i => {
        if (!i || !ids.has(i.id) || i.taken) return i
        if (!i.skipped) ticked++
        if (i.d3) d3 = true
        return { ...i, taken: true, skipped: false }
      })
      if (ticked || d3) {
        out.supps = {
          ...supps,
          items,
          pending: typeof supps.pending === 'number' ? Math.max(0, supps.pending - ticked) : supps.pending,
          ...(d3 ? { d3Taken: true } : {}),
        }
      }
    }
  }
  return out
}

/* ---------- what is kept between runs ---------- */

const defaultStorage = () => { try { return globalThis.localStorage || null } catch { return null } }

export function loadActionState (storage = defaultStorage()) {
  try {
    const raw = storage && storage.getItem(WIDGET_ACTIONS_KEY)
    const v = raw ? JSON.parse(raw) : null
    return {
      pending: Array.isArray(v?.pending) ? v.pending.map(cleanAction).filter(Boolean) : [],
      applied: Array.isArray(v?.applied) ? v.applied.filter(isId) : [],
    }
  } catch { return { pending: [], applied: [] } }
}

export function saveActionState (state, storage = defaultStorage()) {
  try { if (storage) storage.setItem(WIDGET_ACTIONS_KEY, JSON.stringify({ pending: state.pending, applied: state.applied })) } catch { /* private mode: the next drain has nothing of these then */ }
}

let running = null

/**
 * One run: drain the widget queue into the kept list, send what is there, keep what failed.
 * `bridge` is the WidgetBridge plugin, `post(path, body)` the server POST. Answers how many the
 * server took (the caller then fetches the new numbers) and the actions still pending.
 * Runs one at a time: a second call while one runs gets the same answer.
 */
export function flushWidgetActions ({ bridge, post, storage = defaultStorage() }) {
  if (running) return running
  running = (async () => {
    let drained = []
    try { if (bridge && typeof bridge.drainActions === 'function') drained = parseDrained(await bridge.drainActions()) } catch { drained = [] }
    const state = loadActionState(storage)
    state.pending = mergePending(state.pending, drained, state.applied)
    // Kept before anything is sent: the native queue is empty now.
    saveActionState(state, storage)
    if (!state.pending.length) return { sent: 0, pending: [] }
    const { done, dropped, keep } = await sendActions(state.pending, post)
    const after = loadActionState(storage)
    after.applied = rememberApplied(after.applied, [...done, ...dropped])
    after.pending = mergePending(keep, after.pending.filter(a => !state.pending.some(p => p.id === a.id)), after.applied)
    saveActionState(after, storage)
    return { sent: done.length, pending: after.pending }
  })().finally(() => { running = null })
  return running
}

/** The actions kept and not sent yet (what overlayPending draws in). */
export const pendingWidgetActions = (storage = defaultStorage()) => loadActionState(storage).pending
