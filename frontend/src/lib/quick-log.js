// Quick logging (this fork): the one-handed shortcuts under an exercise's sets in a running
// workout. "Same as last time" copies last session's work sets (weight and reps, a hold's
// seconds, a run's minutes and speed) into every set not ticked yet, ticking nothing. "Do all
// sets like last time" does the same and then ticks them (the screen ticks the last one through
// its normal flow, so the rest timer and the next exercise behave as for any tick). "Repeat
// previous set" copies the set you just did into the next open one.
//
// Pure: every function takes the rows and returns new rows. `last` is history.js lastEntryFor's
// answer ({ sets }), in the same unit as the rows (the caller reads both through ex-unit.js).
import { isWarmupRow, isSideSet, syncSideAggregate, WEIGHT_ORIGIN_MANUAL } from './workout-model.js'

const num = v => Number(v) || 0
const list = v => (Array.isArray(v) ? v : [])

/** Whether a past row carries something worth copying in this mode. */
export function usableRow(row, mode) {
  if (!row || typeof row !== 'object') return false
  if (mode === 'cardio') return num(row.min) > 0
  if (mode === 'time') return num(row.sec) > 0
  return num(row.r) > 0
}

/** Last session's work rows that can be copied in `mode`, warm-ups left out. */
export function lastWorkRows(last, mode) {
  return list(last?.sets).filter(s => !isWarmupRow(s) && usableRow(s, mode))
}

/**
 * Row `row` with the numbers of `src` (another row, a past one or today's), not done. Only the
 * numbers move: the phase, a side tag, a set's own rest, its note and video stay the row's own.
 */
export function copyNumbers(row, src, mode) {
  const out = { ...row, done: false }
  delete out.at
  if (mode === 'cardio') {
    out.min = num(src.min)
    if (src.speed != null) out.speed = num(src.speed)
    if (src.incline != null) out.incline = num(src.incline)
    return out
  }
  if (mode === 'time') {
    out.sec = num(src.sec)
    out.w = num(src.w)
    delete out.planSec
    return out
  }
  if (isSideSet(out)) {
    const side = k => {
      const s = isSideSet(src) ? src.sides[k] : null
      return { ...out.sides[k], w: s ? num(s.w) : num(src.w), r: s ? num(s.r) : Math.round(num(src.r) / 2), done: false, weightOrigin: WEIGHT_ORIGIN_MANUAL }
    }
    return syncSideAggregate({ ...out, sides: { L: side('L'), R: side('R') } })
  }
  if (isSideSet(src)) return { ...out, w: Math.max(num(src.sides.L.w), num(src.sides.R.w)), r: num(src.sides.L.r) + num(src.sides.R.r), weightOrigin: WEIGHT_ORIGIN_MANUAL }
  return { ...out, w: num(src.w), r: num(src.r), weightOrigin: WEIGHT_ORIGIN_MANUAL }
}

/** The open (not done) work rows, by index. */
export const openWorkRows = sets => list(sets).map((s, i) => (!isWarmupRow(s) && !s?.done ? i : -1)).filter(i => i >= 0)

/**
 * Every open work row filled from last time: the n-th work row of today from the n-th work set
 * last time (the last one again once last time had fewer). Done rows and warm-ups are left as
 * they are. Returns the rows unchanged when there is nothing to copy.
 */
export function fillFromLast(sets, last, mode) {
  const src = lastWorkRows(last, mode)
  const rows = list(sets)
  if (!src.length) return rows
  let k = 0
  return rows.map(s => {
    if (isWarmupRow(s)) return s
    const from = src[Math.min(k, src.length - 1)]
    k++
    if (s?.done) return s
    return copyNumbers(s, from, mode)
  })
}

/** Whether "Same as last time" would change any open row. */
export function lastTimeDiffers(sets, last, mode) {
  const rows = list(sets)
  const next = fillFromLast(rows, last, mode)
  const key = s => JSON.stringify([s.w, s.r, s.sec, s.min, s.speed, s.incline, s.sides?.L?.w, s.sides?.L?.r, s.sides?.R?.w, s.sides?.R?.r])
  return next.some((s, i) => !rows[i]?.done && key(s) !== key(rows[i]))
}

/**
 * Fill from last time and tick every open work row but the last, stamping `at` on each. Returns
 * { sets, lastOpen }: the screen ticks `lastOpen` itself so the normal tick flow runs once.
 */
export function completeLikeLast(sets, last, mode, now = Date.now()) {
  const filled = fillFromLast(sets, last, mode)
  const open = openWorkRows(filled)
  if (!open.length || !lastWorkRows(last, mode).length) return { sets: list(sets), lastOpen: -1 }
  const lastOpen = open[open.length - 1]
  const out = filled.map((s, i) => {
    if (i === lastOpen || !open.includes(i)) return s
    if (isSideSet(s)) return { ...syncSideAggregate({ ...s, sides: { L: { ...s.sides.L, done: true }, R: { ...s.sides.R, done: true } } }), at: now }
    return { ...s, done: true, at: now }
  })
  return { sets: out, lastOpen }
}

/**
 * The row "Repeat previous set" fills, and the row it copies: the first open row with a done row
 * of the same phase before it (a warm-up repeats a warm-up, a work set a work set). null when
 * there is none.
 */
export function repeatTarget(sets) {
  const rows = list(sets)
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]
    if (!s || s.done) continue
    const warm = isWarmupRow(s)
    for (let j = i - 1; j >= 0; j--) {
      if (isWarmupRow(rows[j]) !== warm) continue
      if (rows[j].done) return { at: i, from: j }
      break
    }
    return null
  }
  return null
}

/** The rows with the next open set holding the numbers of the set before it, or unchanged. */
export function repeatPrevious(sets, mode) {
  const rows = list(sets)
  const tg = repeatTarget(rows)
  if (!tg) return rows
  return rows.map((s, i) => (i === tg.at ? copyNumbers(s, rows[tg.from], mode) : s))
}
