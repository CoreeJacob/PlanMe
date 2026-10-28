// Changes to the items on a tab. Like doc.ts, each returns a new BoardDoc and leaves the old
// one (and every item it doesn't change) untouched.

import type {
  ArrowEnd,
  ArrowItem,
  BoardDoc,
  BoxItem,
  BoxShape,
  ImageItem,
  ImportedImage,
  Item,
  NoteItem,
  Rect,
  SectionItem,
  Shape,
  ShapeType,
  TextItem,
  TodoEntry,
  TodoItem
} from '@shared/types'
import { centre, sideFacing, type Point } from '@/lib/geometry'

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

export const isLocked = (item: Item): boolean => !!item.locked

/** The item, unlocked. */
export function unlocked<T extends Item>(item: T): T {
  if (!item.locked) return item
  const { locked: _was, ...rest } = item
  return rest as T
}

/** An arrow end moved by (dx, dy) if it's loose. Attached ends go wherever their item goes. */
const moveEnd = (end: ArrowEnd, dx: number, dy: number): ArrowEnd => (end.item ? end : { ...end, x: end.x + dx, y: end.y + dy })

/** An item moved by (dx, dy). An arrow moves only its loose ends. */
export function moved(item: Item, dx: number, dy: number): Item {
  if (item.type !== 'arrow') return { ...item, x: item.x + dx, y: item.y + dy }
  if (item.from.item && item.to.item) return item
  return { ...item, from: moveEnd(item.from, dx, dy), to: moveEnd(item.to, dx, dy) }
}

export function moveItems(doc: BoardDoc, tabId: string, ids: readonly string[], dx: number, dy: number): BoardDoc {
  if (!dx && !dy) return doc
  return updateItems(doc, tabId, ids, (i) => moved(i, dx, dy))
}

/**
 * Moves items to the top of the pile (drawn last) or the bottom, keeping their order among
 * themselves.
 */
export function restack(doc: BoardDoc, tabId: string, ids: readonly string[], to: 'front' | 'back'): BoardDoc {
  const which = new Set(ids)
  return withItems(doc, tabId, (items) => {
    const moving = items.filter((i) => which.has(i.id))
    const staying = items.filter((i) => !which.has(i.id))
    const next = to === 'front' ? [...staying, ...moving] : [...moving, ...staying]
    return next.every((i, k) => i === items[k]) ? items : next
  })
}

/**
 * Copies of items with new ids, moved by (dx, dy). Arrows between copied items join the copies;
 * an end attached to something not copied is left loose (pass items through `detach` first to
 * keep where it was).
 */
export function copiesOf(
  items: readonly Item[],
  dx: number,
  dy: number,
  newId: () => string,
  ids: ReadonlyMap<string, string> = new Map(items.map((i) => [i.id, newId()]))
): Item[] {
  const copyEnd = (end: ArrowEnd): ArrowEnd =>
    end.item && ids.has(end.item) ? { ...end, item: ids.get(end.item)!, x: end.x + dx, y: end.y + dy } : { item: null, x: end.x + dx, y: end.y + dy }
  return items.map((i) => {
    const id = ids.get(i.id)!
    if (i.type !== 'arrow') return { ...i, id, x: i.x + dx, y: i.y + dy }
    return { ...i, id, from: copyEnd(i.from), to: copyEnd(i.to) } satisfies ArrowItem
  })
}

// ---------- shapes and sizes ----------

/** The kinds of item that start empty (an image always starts with its picture). */
export type BlankType = Exclude<ShapeType, 'image'>

export const DEFAULT_SIZE: Record<BlankType, { w: number; h: number }> = {
  note: { w: 200, h: 200 },
  text: { w: 240, h: 30 },
  box: { w: 200, h: 120 },
  section: { w: 600, h: 400 },
  todo: { w: 260, h: 120 }
}
export const MIN_SIZE = 20
export const DEFAULT_FONT_SIZE = 20

/** A new, empty item filling `rect`. A box gets the outline `shape`. */
export function newItem(type: BlankType, id: string, rect: Rect, shape: BoxShape = 'rect'): Shape {
  const base = { id, text: '', x: rect.x, y: rect.y, w: Math.max(MIN_SIZE, rect.w), h: Math.max(MIN_SIZE, rect.h) }
  if (type === 'note') return { ...base, type, color: 'yellow' } satisfies NoteItem
  if (type === 'text') return { ...base, type, color: 'default', fontSize: DEFAULT_FONT_SIZE } satisfies TextItem
  if (type === 'section') return { ...base, type, color: 'grey' } satisfies SectionItem
  if (type === 'todo') return { ...base, type, color: 'white', entries: [newEntry()], auto: true } satisfies TodoItem
  return { ...base, type, shape, fill: 'white', border: 'default' } satisfies BoxItem
}

/** A new image item showing a picture copied into the board. */
export function newImage(id: string, rect: Rect, picture: ImportedImage): ImageItem {
  return { id, type: 'image', text: '', x: rect.x, y: rect.y, w: rect.w, h: rect.h, src: picture.src, name: picture.name }
}

/** The biggest a new image is placed, on its longest side, in board units. */
const IMAGE_BOX = 600

/**
 * The size a new image is placed at: its own size, unless that's more than IMAGE_BOX on its
 * longest side or more than half of what's on screen, when it's scaled down to fit (keeping its shape).
 */
export function fitImage(width: number, height: number, screen: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.min(1, IMAGE_BOX / Math.max(width, height), screen.w / 2 / width, screen.h / 2 / height)
  return { w: Math.max(MIN_SIZE, Math.round(width * scale)), h: Math.max(MIN_SIZE, Math.round(height * scale)) }
}

/** A new arrow between two ends, with the usual look. */
export function newArrow(id: string, from: ArrowEnd, to: ArrowEnd): ArrowItem {
  return { id, type: 'arrow', text: '', from, to, route: 'straight', heads: 'end', dashed: false, color: 'default', width: 2 }
}

/** An item of the default size centred on a point. */
export function newItemAt(type: BlankType, id: string, x: number, y: number, shape?: BoxShape): Shape {
  const { w, h } = DEFAULT_SIZE[type]
  return newItem(type, id, { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h }, shape)
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

// ---------- building outwards from a dot ----------

/** How close (board units) the new item's middle must be to the original's to line up with it. */
const LINE_UP = 40

/**
 * Where a new item the size of `source` goes when an arrow from it is dropped at `at`: just past
 * that point, facing back towards `source`, and lined up with it when it's nearly in line.
 */
export function besideRect(source: Rect, at: Point): Rect {
  const { w, h } = source
  const c = centre(source)
  const side = sideFacing(source, at)
  if (side === 'left' || side === 'right') {
    // Off to one side: the new item's near side meets the drop point.
    const y = Math.abs(at.y - c.y) <= LINE_UP ? source.y : at.y - h / 2
    return { x: side === 'right' ? at.x : at.x - w, y, w, h }
  }
  const x = Math.abs(at.x - c.x) <= LINE_UP ? source.x : at.x - w / 2
  return { x, y: side === 'bottom' ? at.y : at.y - h, w, h }
}

/**
 * A new, empty item that looks like `source` (same kind, colours, outline), filling `rect`. It
 * starts without a status, and a to-do list starts with one empty line.
 */
export function newLike(source: Shape, id: string, rect: Rect): Shape {
  // Building out from a picture makes a note beside it (a second copy of the picture wouldn't help).
  if (source.type === 'image') return newItem('note', id, rect)
  const { status: _status, link: _link, locked: _locked, ...look } = source
  const fresh = { ...look, id, text: '', x: rect.x, y: rect.y, w: rect.w, h: rect.h } as Shape
  return fresh.type === 'todo' ? { ...fresh, entries: [newEntry()], auto: true } : fresh
}

/** An empty line for a to-do list. */
export const newEntry = (): TodoEntry => ({ id: crypto.randomUUID(), text: '', done: false })
