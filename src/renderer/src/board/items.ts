// Changes to the items on a tab. Like doc.ts, each returns a new BoardDoc and leaves the old
// one (and every item it doesn't change) untouched.

import type { BoardDoc, BoxItem, Item, ItemType, NoteItem, Rect, TextItem } from '@shared/types'

/** Replaces one tab's items. Returns `doc` itself if they didn't change. */
export function withItems(doc: BoardDoc, tabId: string, change: (items: Item[]) => Item[]): BoardDoc {
  let changed = false
  const tabs = doc.tabs.map((t) => {
    if (t.id !== tabId) return t
    const items = change(t.items)
    if (items === t.items) return t
    changed = true
    return { ...t, items }
  })
  return changed ? { ...doc, tabs } : doc
}

export const itemsOf = (doc: BoardDoc, tabId: string): Item[] => doc.tabs.find((t) => t.id === tabId)?.items ?? []

export function addItems(doc: BoardDoc, tabId: string, added: Item[]): BoardDoc {
  return added.length ? withItems(doc, tabId, (items) => [...items, ...added]) : doc
}

export function removeItems(doc: BoardDoc, tabId: string, ids: readonly string[]): BoardDoc {
  const gone = new Set(ids)
  return withItems(doc, tabId, (items) => (items.some((i) => gone.has(i.id)) ? items.filter((i) => !gone.has(i.id)) : items))
}

/** Changes some items. `change` returns the item itself when there's nothing to change. */
export function updateItems(doc: BoardDoc, tabId: string, ids: readonly string[], change: (item: Item) => Item): BoardDoc {
  const which = new Set(ids)
  return withItems(doc, tabId, (items) => {
    let changed = false
    const next = items.map((i) => {
      if (!which.has(i.id)) return i
      const updated = change(i)
      if (updated !== i) changed = true
      return updated
    })
    return changed ? next : items
  })
}

export function moveItems(doc: BoardDoc, tabId: string, ids: readonly string[], dx: number, dy: number): BoardDoc {
  if (!dx && !dy) return doc
  return updateItems(doc, tabId, ids, (i) => ({ ...i, x: i.x + dx, y: i.y + dy }))
}

/** Moves items to the top of the pile (drawn last), keeping their order among themselves. */
export function bringToFront(doc: BoardDoc, tabId: string, ids: readonly string[]): BoardDoc {
  const which = new Set(ids)
  return withItems(doc, tabId, (items) => {
    const next = [...items.filter((i) => !which.has(i.id)), ...items.filter((i) => which.has(i.id))]
    return next.every((i, k) => i === items[k]) ? items : next
  })
}

export function sendToBack(doc: BoardDoc, tabId: string, ids: readonly string[]): BoardDoc {
  const which = new Set(ids)
  return withItems(doc, tabId, (items) => {
    const next = [...items.filter((i) => which.has(i.id)), ...items.filter((i) => !which.has(i.id))]
    return next.every((i, k) => i === items[k]) ? items : next
  })
}

/** Copies of items with new ids, moved by (dx, dy). */
export function copiesOf(items: readonly Item[], dx: number, dy: number, newId: () => string): Item[] {
  return items.map((i) => ({ ...i, id: newId(), x: i.x + dx, y: i.y + dy }))
}

// ---------- shapes and sizes ----------

export const DEFAULT_SIZE: Record<ItemType, { w: number; h: number }> = {
  note: { w: 200, h: 200 },
  text: { w: 240, h: 30 },
  box: { w: 200, h: 120 }
}
export const MIN_SIZE = 20
export const DEFAULT_FONT_SIZE = 20

/** A new, empty item filling `rect`. */
export function newItem(type: ItemType, id: string, rect: Rect): Item {
  const base = { id, text: '', x: rect.x, y: rect.y, w: Math.max(MIN_SIZE, rect.w), h: Math.max(MIN_SIZE, rect.h) }
  if (type === 'note') return { ...base, type, color: 'yellow' } satisfies NoteItem
  if (type === 'text') return { ...base, type, color: 'default', fontSize: DEFAULT_FONT_SIZE } satisfies TextItem
  return { ...base, type, fill: 'white', border: 'default', rounded: false } satisfies BoxItem
}

/** An item of the default size centred on a point. */
export function newItemAt(type: ItemType, id: string, x: number, y: number): Item {
  const { w, h } = DEFAULT_SIZE[type]
  return newItem(type, id, { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h })
}

/** The smallest rectangle around all the given rectangles, or null if there are none. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.w)
    bottom = Math.max(bottom, r.y + r.h)
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** A rectangle from two corners, in any order. */
export function rectFrom(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

/** Which sides a resize handle moves, e.g. 'nw' moves the top and left. */
export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * The rectangle after dragging a handle by (dx, dy). With `keepShape`, it keeps its proportions
 * (corners only). The opposite side stays put, and it never gets smaller than MIN_SIZE.
 */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, keepShape = false): Rect {
  let left = r.x
  let top = r.y
  let right = r.x + r.w
  let bottom = r.y + r.h
  if (handle.includes('w')) left = Math.min(left + dx, right - MIN_SIZE)
  if (handle.includes('e')) right = Math.max(right + dx, left + MIN_SIZE)
  if (handle.includes('n')) top = Math.min(top + dy, bottom - MIN_SIZE)
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + MIN_SIZE)
  if (keepShape && handle.length === 2) {
    // Follow whichever side changed more (growing or shrinking), and fit the other side to it.
    const sw = (right - left) / r.w
    const sh = (bottom - top) / r.h
    const scale = Math.max(Math.abs(sw - 1) > Math.abs(sh - 1) ? sw : sh, MIN_SIZE / r.w, MIN_SIZE / r.h)
    const w = r.w * scale
    const h = r.h * scale
    if (handle.includes('w')) left = right - w
    else right = left + w
    if (handle.includes('n')) top = bottom - h
    else bottom = top + h
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}
