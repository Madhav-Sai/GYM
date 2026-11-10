// Customize Home (this fork): the order of Home's tiles and cards, and which are hidden.
//
//   S.homeLayout = { tiles: { order: [id…], hidden: [id…] }, cards: { order: [id…], hidden: [id…] } }
//
// Only what you changed is meaningful: an id this build does not know is dropped, and one the
// stored order does not name yet (a tile added in a later version) goes in at its default place,
// so an update never loses a card. It syncs as one setting (lib/sync-merge.js stampEdits stamps it
// whole), the newest arrangement wins. All functions are pure.

export const TILE_IDS = ['workout', 'checkin', 'whoop', 'diet', 'supps', 'medical', 'schedule', 'stats', 'history', 'library', 'plan', 'guide']
export const CARD_IDS = ['now', 'tiles', 'week', 'highlights', 'recovery', 'whoop', 'medical', 'cardio', 'health', 'challenges', 'checkin', 'bodyweight', 'streak']
export const GROUPS = { tiles: TILE_IDS, cards: CARD_IDS }

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])

/** An order that names every known id once: the stored ones first (known only), then each missing one after its default predecessor. */
export function fullOrder(stored, ids) {
  const out = [...new Set(strs(stored).filter(id => ids.includes(id)))]
  ids.forEach((id, i) => {
    if (out.includes(id)) return
    // after the nearest earlier default neighbour that is placed, else at the start
    let at = 0
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(ids[j]); if (k >= 0) { at = k + 1; break } }
    out.splice(at, 0, id)
  })
  return out
}

function groupOf(layout, group) {
  const ids = GROUPS[group]
  const g = isMap(layout) && isMap(layout[group]) ? layout[group] : {}
  return { order: fullOrder(g.order, ids), hidden: [...new Set(strs(g.hidden).filter(id => ids.includes(id)))] }
}

/** The layout a profile shows, every group complete. */
export function layoutOf(S) {
  const raw = S?.homeLayout
  return { tiles: groupOf(raw, 'tiles'), cards: groupOf(raw, 'cards') }
}

/** The visible ids of a group, in order. */
export const visibleIds = (layout, group) => layout[group].order.filter(id => !layout[group].hidden.includes(id))

/** Whether an id is shown. */
export const isShown = (layout, group, id) => !layout[group].hidden.includes(id)

/** One id moved one place earlier (dir -1) or later (+1) within its group. */
export function moveItem(layout, group, id, dir) {
  const order = [...layout[group].order]
  const i = order.indexOf(id), j = i + (dir < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= order.length) return layout
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...layout, [group]: { ...layout[group], order } }
}

/** One id shown or hidden. The tile grid itself can be hidden; at least one card stays visible. */
export function setHidden(layout, group, id, hide) {
  if (!GROUPS[group]?.includes(id)) return layout
  const cur = layout[group].hidden.filter(x => x !== id)
  const hidden = hide ? [...cur, id] : cur
  if (group === 'cards' && hidden.length >= CARD_IDS.length) return layout
  return { ...layout, [group]: { ...layout[group], hidden } }
}

/** Back to the default arrangement (stored as null: nothing customised). */
export const DEFAULT_LAYOUT = null
