// The phone app's Home Screen and Lock Screen widgets, the page's side. Native: on the iPhone
// ios/App/App/WidgetBridgePlugin.swift writes what this builds to the App Group, and the widget
// extension in ios/App/OpenGymWidgets reads it; on Android WidgetBridgePlugin.java keeps it in
// SharedPreferences and redraws the widgets (OpenGymWidgetProvider.java).
//
// A widget runs without the app, so the page hands it a small snapshot whenever something it shows
// changes: the plan for today and the coming week (so the widget can turn the page at midnight on
// its own), this week's progress, the streak, the last PR, and a workout that is running. Every
// word in it is already in the app's language, and the accent is the app's, so the widgets look
// and talk like the app. Text only: no exercise animations or pictures (Gym visual licence).
//
// Since v1.4.4 (v 2) it also carries one block per thing a configurable widget can show
// ("What to show": streak, weight goal, this week, next workout, records, volume), each with its
// words ready to draw, and `level`, kept null until points and levels exist (a later version):
// a widget that finds it null shows nothing of it.
//
// Since the monthly challenges (lib/challenges.js) the snapshot also has `challenges`: the month's
// three with their progress, as words, and "challenges" is one more thing a widget can show. Null
// when they are switched off.
//
// Phone app only. Nothing here runs on the web.
import { MOBILE, nativePlatform } from './mobile.js'
import { EXIDX } from './exercises.js'
import { t, tn, dateLocale } from './i18n.js'
import { effectiveRoutines, exLine, bestWeightForEntry, sessionVolume, lastBW } from './history.js'
import { streakInfo } from './streak.js'
import { challengesOn, monthChallenges, progressOf } from './challenges.js'
import { challengeTitle, challengeCount, doneLine } from './challenge-copy.js'
import { deriveSessionName } from './session-merge.js'
import { queueOf, weekTally } from './queue.js'
import { workoutsLeft } from './week-left.js'
import { todayISO, isoOf, fmtNum, weekStartOf, startOfWeek, weekKey, exerciseNameText } from './format.js'
import { accentPair, accentValue } from './accent.js'
import { speedUnitOf } from './speed.js'
import { isOn } from './modules.js'
import { viewTarget, exUnitOf, shownWeight } from './ex-unit.js'
import { TARGETS, DAY_TARGETS, dayTypeOf } from './diet-plan.js'
import { checklist } from './supplements.js'
import { healthDay, healthMinutes } from './ist.js'
import { DEMO } from './demo.js'
import { needsStepsFallback, withStepsFallback, stepsSourceOf } from './steps-source.js'
import { flushWidgetActions, overlayPending, pendingWidgetActions } from './widget-actions.js'
import { snapshotBlocks } from './widget-status.js'

export const WIDGET_SNAPSHOT_VERSION = 2
// What the weight goal's little curve draws: the last weigh-ins.
export const WIDGET_TREND_POINTS = 7
// What a configurable widget can show, in the order its menu lists them.
export const WIDGET_KINDS = ['streak', 'weight', 'week', 'next', 'records', 'volume', 'challenges']
// Today and the week after it: enough for "next workout" to still be right a few days on.
export const WIDGET_DAYS = 8
// What the large widget lists of today's plan.
export const WIDGET_EXERCISES_MAX = 8
const WRITE_DEBOUNCE_MS = 1000

// Title-cased as the app shows it; a widget has no CSS to do it (lib/format.js exerciseNameText).
const nameOfCfg = cfg => (EXIDX[cfg?.id] ? exerciseNameText(EXIDX[cfg.id]) : String(cfg?.name || cfg?.n || cfg?.id || ''))
const routineIdsOf = w => (Array.isArray(w?.routineIds) ? w.routineIds : w?.routineId ? [w.routineId] : [])
const shift = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return isoOf(d) }

// One day of the plan as the widget shows it. The exercises only for today: the other days are a
// name and a count, which is all a widget has room for.
function dayOf (S, iso, today) {
  let routines = []
  try { routines = effectiveRoutines(S, iso).filter(r => (r.ex || []).length) } catch { routines = [] }
  const weekday = new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long' })
  if (!routines.length) return { iso, weekday, name: null, count: 0 }
  const day = {
    iso,
    weekday,
    name: deriveSessionName(routines.map(r => r.name || '')) || '',
    ids: routines.map(r => r.id).filter(Boolean),
    count: routines.reduce((n, r) => n + (r.ex || []).length, 0),
  }
  if (iso === today) {
    const speed = speedUnitOf(S)
    day.exercises = routines.flatMap(r => r.ex || []).slice(0, WIDGET_EXERCISES_MAX).map(cfg => {
      let line = ''
      // In the exercise's own weight unit when it has one (#657).
      try { line = exLine(viewTarget(S, cfg.id, cfg), exUnitOf(S, cfg.id), speed) } catch { line = '' }
      return { name: nameOfCfg(cfg), line }
    })
    // Logged already (as the Home screen's today row says it): every routine of the day covered
    // by a workout from today. A coach-queue session is never covered that way.
    const queueIds = queueOf(S)?.ids || []
    const logged = (S.workouts || []).filter(w => w && w.d === today)
    day.done = routines.every(r => !queueIds.includes(r.id) && logged.some(w => routineIdsOf(w).includes(r.id)))
  }
  return day
}

// The newest workout with a PR in it, and that lift's best weight there.
function lastPrOf (S) {
  const ws = (S.workouts || []).filter(w => w && Array.isArray(w.prs) && w.prs.length)
  if (!ws.length) return null
  const w = ws.reduce((a, b) => ((b.d || '') > (a.d || '') || ((b.d || '') === (a.d || '') && (b.end || 0) > (a.end || 0)) ? b : a))
  const id = w.prs[0]
  const entry = (w.entries || []).find(e => e && e.id === id)
  const name = EXIDX[id] ? exerciseNameText(EXIDX[id]) : String(entry?.target?.name || entry?.name || id)
  let best = 0
  try { best = entry ? bestWeightForEntry(entry) : 0 } catch { best = 0 }
  return { name, value: best > 0 ? `${fmtNum(shownWeight(S, id, best))} ${exUnitOf(S, id)}` : '', d: w.d || null }
}

function activeOf (S) {
  const A = S.active
  if (!A || !Array.isArray(A.entries) || A.editingWorkoutId) return null
  let done = 0, total = 0
  for (const e of A.entries) for (const s of e?.sets || []) { total++; if (s?.done) done++ }
  return { id: A.id || null, name: A.name || '', start: typeof A.start === 'number' ? A.start : null, done, total }
}

const round1 = n => Math.round(n * 10) / 10
// 12400 → "12.4k", 980 → "980": a widget has room for four or five characters.
const compact = n => (n >= 10000 ? fmtNum(round1(n / 1000)) + 'k' : fmtNum(Math.round(n)))

function streakOf (S, today) {
  let info
  try { info = streakInfo(S, today) } catch { info = streakInfo({ workouts: [] }, today) }
  return {
    current: info.current,
    best: info.best,
    freezes: info.freezes,
    weekDone: info.thisWeekDone,
    next: info.next,
    line: t('{0} week streak', info.current),
    bestLine: t('Best: {0}', info.best),
  }
}

// The weight goal: the last weigh-in, the goal, how far to go, the last few weigh-ins.
function weightOf (S) {
  const last = lastBW(S)
  if (!last || !Number.isFinite(last.w)) return null
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const goal = Number.isFinite(S.targetW) && S.targetW > 0 ? S.targetW : null
  const toGo = goal == null ? null : round1(Math.abs(last.w - goal))
  const trend = S.bodyweight.slice(-WIDGET_TREND_POINTS).map(b => b?.w).filter(Number.isFinite)
  return {
    current: last.w,
    goal,
    toGo,
    unit,
    trend,
    currentText: `${fmtNum(last.w)} ${unit}`,
    goalText: goal == null ? null : `${fmtNum(goal)} ${unit}`,
    // Within a tenth of the unit counts as there: a scale shows no finer.
    line: goal == null ? t('No goal set') : toGo < 0.1 ? t('Goal reached') : t('{0} to go', `${fmtNum(toGo)} ${unit}`),
  }
}

// The next workout: today's when it is not done yet, else the next day with a plan.
function nextOf (days, today) {
  const d = days.find(x => x.name && !(x.iso === today && x.done))
  if (!d) return null
  return { name: d.name, iso: d.iso, weekday: d.weekday, today: d.iso === today, ids: d.ids || [], count: d.count || 0 }
}

// PRs this calendar month, and the last one.
function recordsOf (S, today) {
  const month = today.slice(0, 7)
  let n = 0
  for (const w of S.workouts) if (w && typeof w.d === 'string' && w.d.startsWith(month) && Array.isArray(w.prs)) n += w.prs.length
  return { month: n, monthLine: tn('{0} PR this month', '{0} PRs this month', n), last: lastPrOf(S) }
}

// Volume this week against all of last week, in the profile's unit, counted as Stats counts it.
function volumeOf (S, today) {
  const ws = weekStartOf(S)
  const cur = weekKey(today, ws), prev = weekKey(shift(cur, -7), ws)
  let now = 0, before = 0
  for (const w of S.workouts) {
    if (!w || typeof w.d !== 'string') continue
    const k = weekKey(w.d, ws)
    if (k !== cur && k !== prev) continue
    let v = 0
    try { v = sessionVolume(w, S) } catch { v = 0 }
    if (k === cur) now += v; else before += v
  }
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const pct = before > 0 ? Math.round((now - before) / before * 100) : null
  return {
    now: Math.round(now),
    prev: Math.round(before),
    unit,
    pct,
    nowText: `${compact(now)} ${unit}`,
    prevText: `${compact(before)} ${unit}`,
    line: pct == null ? t('Last week: {0}', `${compact(before)} ${unit}`) : t('{0} vs last week', (pct > 0 ? '+' : '') + pct + '%'),
  }
}

// The month's challenges: how many are done, each with its words and how far, and the first one
// still open as the line a small widget has room for.
function challengesOfWidget (S, today) {
  if (!challengesOn(S) || !(S.workouts || []).length) return null
  try {
    const month = monthChallenges(S, today.slice(0, 7))
    const unit = S.unit === 'lb' ? 'lb' : 'kg'
    const items = progressOf(S, month).map(p => ({ id: p.id, title: challengeTitle(p, unit), count: challengeCount(p, unit), pct: Math.round(p.pct * 100), done: p.done }))
    if (!items.length) return null
    const done = items.filter(i => i.done).length
    const open = items.find(i => !i.done)
    return {
      month: month.key,
      done,
      total: items.length,
      items,
      line: doneLine(done, items.length),
      next: open ? `${open.title} · ${open.count}` : t('Gold month. Take a bow.'),
    }
  } catch { return null }
}

/** Everything the widgets show, as plain JSON (the `today` argument pins the clock for tests). */
export function buildWidgetSnapshot (S, { today = todayISO() } = {}) {
  const st = { ...S, routines: S?.routines || [], week: S?.week || {}, dayPlan: S?.dayPlan || {}, workouts: S?.workouts || [], bodyweight: Array.isArray(S?.bodyweight) ? S.bodyweight : [] }
  const days = []
  for (let i = 0; i < WIDGET_DAYS; i++) days.push(dayOf(st, shift(today, i), today))
  let week = { done: 0, planned: 0 }
  try { week = weekTally(st, today) } catch { /* the widget shows no fraction then */ }
  const streakX = streakOf(st, today)
  const streak = streakX.current
  const ws = weekStartOf(st)
  const weekFrom = isoOf(startOfWeek(today, ws))
  const pair = accentPair(accentValue(st))
  return {
    v: WIDGET_SNAPSHOT_VERSION,
    today,
    weekFrom,
    weekUntil: shift(weekFrom, 7),
    unit: st.unit === 'lb' ? 'lb' : 'kg',
    accent: pair?.accent || '#30d158',
    ink: pair?.ink || '#000000',
    days,
    week: { done: week.done || 0, planned: week.planned || 0 },
    // v1.4.5 (#753): what is left of the week's plan, { left, of }, or null with no plan (a
    // rotation without a weekly target). The native widgets do not read it yet.
    weekLeft: (() => { try { const l = workoutsLeft(st, today); return l ? { left: l.left, of: l.of } : null } catch { return null } })(),
    streak,
    lastPR: lastPrOf(st),
    active: activeOf(st),
    // v 2: the configurable widget's blocks.
    streakInfo: streakX,
    // Settings → Modules: Body off leaves the weight block empty (the widget skips a null);
    // challengesOfWidget already answers null with Motivation off (challengesOn).
    weight: isOn(st, 'body') ? weightOf(st) : null,
    next: nextOf(days, today),
    records: recordsOf(st, today),
    volume: volumeOf(st, today),
    challenges: challengesOfWidget(st, today),
    // myGym: the "My day" widget (ios/App/OpenGymWidgets/MyGymWidgets.swift).
    day: dayWidgetBlock(st, days[0]),
    // Points to the next level: not built yet. Stays null until it is; the widgets skip it then.
    level: null,
    labels: {
      today: t('Today'),
      restDay: t('Rest day'),
      upNext: t('Up next'),
      thisWeek: t('This week'),
      weekStreak: t('Week streak'),
      streak: t('{0} week streak', streak),
      lastPR: t('Last PR'),
      done: t('Done'),
      running: t('Workout running'),
      weightGoal: t('Weight goal'),
      nextWorkout: t('Next workout'),
      records: t('Records'),
      volume: t('Volume'),
      challenges: t('Challenges'),
      freezes: t('Streak freezes'),
      nothingPlanned: t('Nothing planned'),
      noWeighIn: t('No weigh-ins yet'),
      startNow: t('Start'),
      // Android's "What to show" screen, in the app's language (OpenGymWidgetConfigure.java).
      whatToShow: t('What to show'),
      secondThing: t('And beside it'),
      kinds: { streak: t('Week streak'), weight: t('Weight goal'), week: t('This week'), next: t('Next workout'), records: t('Records'), volume: t('Volume'), challenges: t('Challenges') },
    },
  }
}

/* ---------- the native plugin ---------- */

let pluginP = null
// Inside an object: a Capacitor plugin proxy answers `then` (lib/rest-alert.js, the Coach hang #42).
const widgetPlugin = () => pluginP || (pluginP = (async () => {
  if (!MOBILE) return null
  const platform = await nativePlatform()
  if (platform !== 'ios' && platform !== 'android') return null
  const { registerPlugin } = await import('@capacitor/core')
  return { WidgetBridge: registerPlugin('WidgetBridge') }
})().catch(() => null))

/** myGym: the Whoop numbers the Whoop and Steps widgets draw (ios/App/OpenGymWidgets/WhoopWidgets.swift), from
 *  the server's /api/whoop/summary. null when there is nothing to show: the widget then says "Open myGym". */
export function whoopWidgetBlock (s) {
  if (!s || !s.connected || !s.today) return null
  const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const r = s.today.recovery || {}, c = s.today.cycle || {}, sl = s.today.sleep || {}
  const week = (s.days || []).slice(-7)
  return {
    day: s.today.day || null, syncedAt: n(s.syncedAt),
    recovery: n(r.score), band: s.today.guidance?.band || null, guidance: s.today.guidance?.text || null,
    hrv: n(r.hrv), rhr: n(r.rhr), spo2: n(r.spo2), skinTemp: n(r.skinTemp),
    strain: n(c.strain), kcal: n(c.kcal),
    sleepMin: n(sl.asleepMin), sleepNeedMin: n(sl.neededMin), sleepPerf: n(sl.performance), respRate: n(sl.respRate),
    steps: n(s.steps?.value), stepsSource: stepsSourceOf(s), stepGoal: 8000,
    week: week.map(d => n(d.recovery)), strainWeek: week.map(d => n(d.strain)), weekDays: week.map(d => d.day),
    // The configurable "Whoop metric" widget's sparklines (MyGymWidgets.swift), oldest first.
    hrvWeek: week.map(d => n(d.hrv)), rhrWeek: week.map(d => n(d.rhr)), sleepWeek: week.map(d => n(d.sleepMin)),
    stepsWeek: week.map(d => n(d.steps)), spo2Week: week.map(d => n(d.spo2)),
    zoneMin: n(s.zone45?.minutes), zoneTarget: s.zone45?.target || null, zoneWarn: n(s.zone45?.warnAbove),
    hrOver: (s.hrFlags || []).length ? n(Math.max(...s.hrFlags.map(f => f.maxHr))) : null,
  }
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
// Minutes into the health day (lib/ist.js): before 04:00 counts as the evening before, so the 00:45
// magnesium sorts after the 23:45 isabgol.
const healthMinOf = hhmm => {
  const m = HHMM.exec(hhmm || '')
  if (!m) return null
  const v = +m[1] * 60 + +m[2]
  return v < 240 ? v + 1440 : v
}

/** myGym: the Macros widget's numbers, from GET /api/health/diet (api/health/diet.js dayView), against
 *  the plan's targets (lib/diet-plan.js: 2000 kcal, 165 g protein, carbs under 130 g, 35 g fibre).
 *  null when the answer is not a day view: the widget then says "Open myGym". */
export function dietWidgetBlock (v) {
  if (!v || typeof v !== 'object' || !v.totals || typeof v.totals !== 'object') return null
  const tt = v.totals
  const protein = num(tt.protein)
  return {
    day: typeof v.day === 'string' ? v.day : null,
    dayType: typeof v.day === 'string' ? dayTypeOf(v.day, v.dayType) : null,
    kcal: num(tt.kcal), kcalTarget: (DAY_TARGETS[typeof v.day === 'string' ? dayTypeOf(v.day, v.dayType) : 'training'] || DAY_TARGETS.training).kcal,
    protein, proteinTarget: TARGETS.protein,
    proteinLeft: protein == null ? null : Math.max(0, Math.round(TARGETS.protein - protein)),
    fiber: num(tt.fiber), fiberTarget: TARGETS.fiber,
    // carbs are a ceiling in the triglyceride plan (130 g)
    carbs: num(tt.carbs), carbsMax: (DAY_TARGETS[typeof v.day === 'string' ? dayTypeOf(v.day, v.dayType) : 'training'] || DAY_TARGETS.training).carbs,
    water: num(v.water), waterTarget: TARGETS.waterMin, waterMax: TARGETS.waterMax,
    entries: Array.isArray(v.entries) ? v.entries.length : null,
  }
}

export const WIDGET_SUPPS_MAX = 8

/** myGym: the Supplements widget, from GET /api/health/supplements and lib/supplements.js: today's
 *  due items in time order, the next one due (`minutes` into the health day), how many are pending,
 *  and whether today is a D3 dose day. null when the answer is not a list. */
export function supplementsWidgetBlock (v, { day = healthDay(), minutes = healthMinutes() } = {}) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.list)) return null
  let items = []
  try { items = checklist(v.list, v.log || {}, day, dayTypeOf(day)) } catch { return null }
  const rows = items.map(i => ({
    id: i.s.id || null,
    name: String(i.s.name || ''),
    time: HHMM.test(i.s.remind || '') ? i.s.remind : null,
    dose: i.dose || null,
    taken: i.status === 'taken',
    skipped: i.status === 'skipped',
    d3: i.s.schedule?.kind === 'phase',
  }))
  // Timed ones first, in health-day order; untimed after, as listed.
  const key = r => healthMinOf(r.time) ?? 9999
  rows.sort((a, b) => key(a) - key(b))
  const pending = rows.filter(r => !r.taken && !r.skipped)
  const upcoming = pending.find(r => r.time && healthMinOf(r.time) >= minutes)
  const next = upcoming || pending[0] || null
  const d3 = rows.find(r => r.d3)
  return {
    day,
    items: rows.slice(0, WIDGET_SUPPS_MAX),
    total: rows.length,
    pending: pending.length,
    next: next ? { name: next.name, time: next.time, overdue: !upcoming } : null,
    d3Due: !!d3,
    d3Taken: d3 ? d3.taken : null,
  }
}

export const WIDGET_DAY_LIFTS = 4

/** myGym: the "My day" widget's schedule (S.daySchedule, rows { time: 'HH:MM', label }, left out
 *  when the profile has none) and today's workout with its first lifts (from the Today day). */
export function dayWidgetBlock (S, today) {
  const out = {}
  const rows = Array.isArray(S?.daySchedule)
    ? S.daySchedule.filter(r => r && HHMM.test(r.time) && typeof r.label === 'string' && r.label.trim())
      .map(r => ({ time: r.time, label: r.label.trim().slice(0, 60) }))
      .sort((a, b) => healthMinOf(a.time) - healthMinOf(b.time))
    : []
  if (rows.length) out.schedule = rows
  out.workout = today && today.name
    ? { name: today.name, count: today.count || 0, done: !!today.done, ids: today.ids || [], lifts: (today.exercises || []).slice(0, WIDGET_DAY_LIFTS) }
    : null
  return out
}

const WHOOP_POLL_MS = 5 * 60_000

// myGym diagnostics (Settings → Look & Home → Widgets, lib/widget-status.js): what the last write
// sent and how it went. `at` the last successful write (ms), `blocks` which blocks it had
// (snapshotBlocks), `error` the plugin's refusal of the last attempt, null once one succeeds.
const diag = { at: null, bytes: 0, blocks: null, error: null }
let refresher = null

/** A copy of the diagnostics above. */
export function widgetSyncDiag () { return { ...diag, blocks: diag.blocks ? { ...diag.blocks } : null } }

/** What the native side says (WidgetBridge.status, iPhone), or null without a plugin or on a build before it. */
export async function widgetPluginStatus () {
  const p = await widgetPlugin()
  if (!p) return null
  try { return (await p.WidgetBridge.status()) || null } catch { return null }
}

/** Settings' "Refresh widgets now": pulls Whoop, Diet and Supplements, then writes the snapshot even
 *  when it is the same as the last one. false when the widget sync is not running. */
export async function refreshWidgetsNow () {
  if (!refresher) return false
  await refresher()
  return true
}

/**
 * Started once by the app: writes the snapshot when what it shows changes (debounced, and only
 * when it differs from the last one written), and again when the app comes back, which may be on
 * another day. Resolves with the stop function.
 */
export async function startWidgetSync ({ useStore }) {
  const p = await widgetPlugin()
  if (!p) return () => {}
  let last = null, tm = null, whoop = null, diet = null, supps = null
  const write = async ({ force = false } = {}) => {
    clearTimeout(tm)
    tm = null
    if (useStore.getState().tourSandbox) return
    let snap, json
    try {
      snap = buildWidgetSnapshot(useStore.getState().S)
      if (whoop) snap.whoop = whoop
      if (diet) snap.diet = diet
      if (supps) snap.supps = supps
      // The widget buttons' taps not on the server yet (lib/widget-actions.js) stay drawn in.
      json = JSON.stringify(overlayPending(snap, pendingWidgetActions()))
    } catch (e) { diag.error = 'build: ' + (e?.message || String(e)); return }
    if (!force && json === last) return
    try {
      await p.WidgetBridge.write({ json })
      last = json
      Object.assign(diag, { at: Date.now(), bytes: typeof TextEncoder === 'function' ? new TextEncoder().encode(json).length : json.length, blocks: snapshotBlocks(snap), error: null })
    } catch (e) {
      // Not now: the next change writes it. Kept for Settings → Widgets, which shows it.
      diag.error = e?.message || String(e)
    }
  }
  // The tour's practice workout (useStore enterTourSandbox) is left off the widgets.
  const schedule = () => { if (useStore.getState().tourSandbox) return; clearTimeout(tm); tm = setTimeout(write, WRITE_DEBOUNCE_MS) }
  const off = useStore.subscribe((s, prev) => { if (s.S !== prev.S) schedule() })
  // Whoop, Diet and Supplements: the server's numbers, every 5 minutes while the app is open and
  // each time it comes back. Signed in only; a failed request keeps the last numbers.
  let poll = null
  const pullWhoop = async (st, api) => {
    if (!(st.config?.integrations?.providers || []).includes('whoop')) return
    try {
      let sum = await api('/api/whoop/summary')
      // Whoop without a step count today: Apple Health's, on the iPhone, when it is on (lib/steps-source.js).
      if (needsStepsFallback(sum)) {
        const apple = await import('./health-sync.js').then(m => m.readTodaySteps({ S: st.S })).catch(() => null)
        sum = withStepsFallback(sum, apple, todayISO())
      }
      const next = whoopWidgetBlock(sum)
      if (JSON.stringify(next) !== JSON.stringify(whoop)) { whoop = next; return true }
    } catch { /* offline: keep the last numbers */ }
    return false
  }
  const pullHealth = async api => {
    const day = healthDay()
    const [d, s] = await Promise.allSettled([api('/api/health/diet?day=' + encodeURIComponent(day)), api('/api/health/supplements')])
    let changed = false
    if (d.status === 'fulfilled') { const next = dietWidgetBlock(d.value); if (JSON.stringify(next) !== JSON.stringify(diet)) { diet = next; changed = true } }
    if (s.status === 'fulfilled') { const next = supplementsWidgetBlock(s.value, { day }); if (JSON.stringify(next) !== JSON.stringify(supps)) { supps = next; changed = true } }
    return changed
  }
  // The widget buttons' taps (+250 ml, Taken): sent first, so the numbers fetched after include them.
  const flushActions = async api => {
    try {
      const r = await flushWidgetActions({ bridge: p.WidgetBridge, post: (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }) })
      return !!(r && (r.sent || r.pending.length))
    } catch { return false /* kept for the next time */ }
  }
  // New numbers are written at once (the first Whoop summary after sign-in included), not after the
  // debounce: the app may be sent to the background right after.
  const pull = async ({ force = false } = {}) => {
    const st = useStore.getState()
    if (!st.user || DEMO) {
      // Signed out: the last profile's server numbers leave the widgets.
      if (whoop || diet || supps || force) { whoop = diet = supps = null; await write({ force }) }
      return
    }
    if (!poll) poll = setInterval(pull, WHOOP_POLL_MS)
    let api
    try { ({ api } = await import('./api.js')) } catch { if (force) await write({ force }); return }
    const flushed = await flushActions(api)
    const [w, hl] = await Promise.all([pullWhoop(useStore.getState(), api), pullHealth(api).catch(() => false)])
    if (flushed || w || hl || force) await write({ force })
  }
  // A sign-in (or out): written at once, then the server's numbers. The config (which says whether
  // Whoop is offered) can arrive after the user: that pulls again.
  const offUser = useStore.subscribe((s, prev) => {
    if (s.user !== prev.user) { write(); pull() } else if (s.config !== prev.config) pull()
  })
  pull()
  const onVisible = () => { if (document.visibilityState === 'visible') { schedule(); pull() } }
  document.addEventListener('visibilitychange', onVisible)
  write()
  refresher = () => pull({ force: true })
  return () => { refresher = null; off(); offUser(); if (poll) clearInterval(poll); clearTimeout(tm); document.removeEventListener('visibilitychange', onVisible) }
}

// Test seams.
export function _setWidgetPluginForTest (plugin) { pluginP = Promise.resolve(plugin ? { WidgetBridge: plugin } : null) }
export function _resetWidgets () { pluginP = null }
