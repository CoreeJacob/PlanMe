// Lining things up, spreading them out evenly, and resizing several at once. Locked items never
// move; when some are among the things being lined up, the others line up with them.

import type { BoardDoc, Rect, Shape } from '@shared/types'
import { boundsOf, type Point } from '@/lib/geometry'
import { isShape, lookupIn } from './arrows'
import { itemsOf, MIN_SIZE, moved, updateItems, withBentArrows } from './items'
import { contentsOf, isSection } from './sections'

export type Alignment = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'
export type Spread = 'across' | 'down'

/** How far each shape moves to line up: with the locked ones if there are any, otherwise with all of them. */
function alignMoves(shapes: Shape[], how: Alignment): Map<string, Point> {
  const locked = shapes.filter((s) => s.locked)
  const to = boundsOf(locked.length ? locked : shapes)
  const moves = new Map<string, Point>()
  if (!to) return moves
  for (const s of shapes) {
    let x = 0
    let y = 0
    if (how === 'left') x = to.x - s.x
    else if (how === 'centre') x = to.x + to.w / 2 - (s.x + s.w / 2)
    else if (how === 'right') x = to.x + to.w - (s.x + s.w)
    else if (how === 'top') y = to.y - s.y
    else if (how === 'middle') y = to.y + to.h / 2 - (s.y + s.h / 2)
    else y = to.y + to.h - (s.y + s.h)
    moves.set(s.id, { x, y })
  }
  return moves
}

/**
 * How far each shape moves to spread them out evenly, across or down: the first and last stay
 * where they are, and the gaps between the rest become the same.
 */
function spreadMoves(shapes: Shape[], how: Spread): Map<string, Point> {
  const moves = new Map<string, Point>()
  if (shapes.length < 3) return moves
  const [pos, len] = how === 'across' ? (['x', 'w'] as const) : (['y', 'h'] as const)
  const order = [...shapes].sort((a, b) => a[pos] + a[len] / 2 - (b[pos] + b[len] / 2))
  const first = order[0]
  const last = order[order.length - 1]
  const filled = order.reduce((sum, s) => sum + s[len], 0)
  const gap = (last[pos] + last[len] - first[pos] - filled) / (order.length - 1)
  let at = first[pos]
  for (const s of order) {
    const by = Math.round((at - s[pos]) * 100) / 100
    moves.set(s.id, how === 'across' ? { x: by, y: 0 } : { x: 0, y: by })
    at += s[len] + gap
  }
  return moves
}

/** Lines up the shapes among `ids`, or spreads them out. A section takes what's inside it along. */
export function arrange(doc: BoardDoc, tabId: string, ids: readonly string[], how: Alignment | Spread): BoardDoc {
  const items = itemsOf(doc, tabId)
  const lookup = lookupIn(items)
  const shapes = items.filter((i): i is Shape => isShape(i) && ids.includes(i.id))
  const moves = how === 'across' || how === 'down' ? spreadMoves(shapes, how) : alignMoves(shapes, how)
  const going = new Map<string, Point>()
  for (const s of shapes) {
    const by = moves.get(s.id)
    if (!by || (!by.x && !by.y) || s.locked) continue
    going.set(s.id, by)
    if (isSection(s)) for (const id of contentsOf(s, items, lookup)) if (!moves.has(id)) going.set(id, by)
  }
  return updateItems(doc, tabId, [...going.keys()], (i) => (i.locked ? i : moved(i, going.get(i.id)!.x, going.get(i.id)!.y)))
}

/**
 * Resizes things together, as if they were one picture: everything in `from` is scaled to fill
 * `to`. Text words grow and shrink with it when it `keepsShape`; to-do lists only get wider
 * (their height follows their lines); loose arrow ends move with it. Locked things stay as they are.
 */
export function scaleItems(doc: BoardDoc, tabId: string, ids: readonly string[], from: Rect, to: Rect, keepsShape: boolean): BoardDoc {
  const sx = to.w / from.w
  const sy = to.h / from.h
  const x = (v: number): number => to.x + (v - from.x) * sx
  const y = (v: number): number => to.y + (v - from.y) * sy
  return updateItems(doc, tabId, withBentArrows(doc, tabId, ids), (i) => {
    if (i.locked) return i
    if (i.type === 'arrow') {
      if (i.from.item && i.to.item && !i.bends?.length) return i
      const end = (e: typeof i.from): typeof i.from => (e.item ? e : { ...e, x: x(e.x), y: y(e.y) })
      const bends = i.bends?.map((b) => ({ x: x(b.x), y: y(b.y) }))
      return { ...i, from: end(i.from), to: end(i.to), ...(bends ? { bends } : {}) }
    }
    const placed = { x: x(i.x), y: y(i.y), w: Math.max(MIN_SIZE, i.w * sx) }
    if (i.type === 'text') return { ...i, ...placed, fontSize: keepsShape ? Math.max(4, i.fontSize * sx) : i.fontSize }
    if (i.type === 'todo') return { ...i, ...placed }
    return { ...i, ...placed, h: Math.max(MIN_SIZE, i.h * sy) }
  })
}
