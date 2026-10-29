// Bringing in a change made to the board's files from outside PlanMe (say, by an assistant),
// while keeping what's been done in the app since the last save. Three versions are compared:
// `base`, the board as PlanMe last saved it; `mine`, the board in the app now; and `theirs`, the
// board on disk now. Item by item: whatever changed outside comes in (it wins if both changed the
// same item), and whatever changed only in the app stays.

import type { BoardDoc, Item, Tab } from '@shared/types'

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

export interface OutsideChange {
  doc: BoardDoc
  /** Per tab (by id): the items added or changed outside, and how many were deleted outside. */
  tabs: Map<string, { changed: string[]; deleted: number }>
  /** Tabs added and removed outside, by name. */
  addedTabs: string[]
  removedTabs: string[]
  /** The statuses, the tags, or the tabs' names or order, changed outside. */
  statuses: boolean
  tags: boolean
  tabList: boolean
}

function mergeItems(base: readonly Item[], mine: readonly Item[], theirs: readonly Item[]): { items: Item[]; changed: string[]; deleted: number } {
  const baseById = new Map(base.map((i) => [i.id, i]))
  const mineById = new Map(mine.map((i) => [i.id, i]))
  const theirIds = new Set(theirs.map((i) => i.id))
  const items: Item[] = []
  const changed: string[] = []
  for (const t of theirs) {
    const b = baseById.get(t.id)
    const m = mineById.get(t.id)
    if (b && same(b, t)) {
      // Not touched outside: as it is in the app (or gone, if deleted in the app).
      if (m) items.push(m)
    } else {
      items.push(t)
      changed.push(t.id)
    }
  }
  // Added in the app and not saved yet.
  for (const m of mine) if (!theirIds.has(m.id) && !baseById.has(m.id)) items.push(m)
  const deleted = base.filter((b) => !theirIds.has(b.id) && mineById.has(b.id)).length
  const unchanged = items.length === mine.length && items.every((i, k) => i === mine[k])
  return { items: unchanged ? (mine as Item[]) : items, changed, deleted }
}

/** The board with an outside change brought in, and what came in; null if nothing did. */
export function mergeOutside(base: BoardDoc, mine: BoardDoc, theirs: BoardDoc): OutsideChange | null {
  const baseTabs = new Map(base.tabs.map((t) => [t.id, t]))
  const mineTabs = new Map(mine.tabs.map((t) => [t.id, t]))
  const theirIds = new Set(theirs.tabs.map((t) => t.id))
  const result: OutsideChange = { doc: mine, tabs: new Map(), addedTabs: [], removedTabs: [], statuses: false, tags: false, tabList: false }

  const tabs: Tab[] = []
  for (const t of theirs.tabs) {
    const b = baseTabs.get(t.id)
    const m = mineTabs.get(t.id)
    if (!m) {
      // New outside, or deleted in the app but changed outside since: it comes (back) in.
      if (b && same(b, t)) continue
      tabs.push(t)
      if (!b) result.addedTabs.push(t.name)
      result.tabs.set(t.id, { changed: t.items.map((i) => i.id), deleted: 0 })
      continue
    }
    const merged = mergeItems(b?.items ?? [], m.items, t.items)
    if (merged.changed.length || merged.deleted) result.tabs.set(t.id, { changed: merged.changed, deleted: merged.deleted })
    const name = b && t.name !== b.name ? t.name : m.name
    tabs.push(merged.items === m.items && name === m.name ? m : { ...m, name, items: merged.items })
  }
  // Tabs added in the app and not saved yet stay, where they were.
  mine.tabs.forEach((m, k) => {
    if (!theirIds.has(m.id) && !baseTabs.has(m.id)) tabs.splice(Math.min(k, tabs.length), 0, m)
  })
  result.removedTabs = mine.tabs.filter((m) => baseTabs.has(m.id) && !theirIds.has(m.id)).map((m) => m.name)

  const statuses = same(theirs.statuses, base.statuses) ? mine.statuses : theirs.statuses
  result.statuses = statuses !== mine.statuses && !same(statuses, mine.statuses)
  const tags = same(theirs.tags ?? [], base.tags ?? []) ? mine.tags : theirs.tags
  result.tags = tags !== mine.tags && !same(tags ?? [], mine.tags ?? [])
  const names = (list: readonly Tab[]): string => JSON.stringify(list.map((t) => [t.id, t.name]))
  result.tabList = names(tabs) !== names(mine.tabs) && !result.addedTabs.length && !result.removedTabs.length

  const unchanged = tabs.length === mine.tabs.length && tabs.every((t, k) => t === mine.tabs[k]) && statuses === mine.statuses && tags === mine.tags
  if (unchanged) return null
  result.doc = { ...mine, tabs, statuses, tags }
  return result
}
