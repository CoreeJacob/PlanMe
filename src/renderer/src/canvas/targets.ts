// What's under the pointer, for joining arrows: an item, or one of its dots.

import type { ArrowEnd, Shape, View } from '@shared/types'
import { pinOut, pinPoint, pinsOf, type Pin } from '@/board/arrows'
import type { Point } from '@/lib/geometry'
import { canJoin, currentItems } from './current'
import { toScreen, type Size } from './view'

/** How far outside an item's edge its dots sit, in screen pixels (clear of the resize handles). */
export const DOT_OFFSET = 14

/** Where a dot is drawn on screen: just outside the edge, straight out from it (diagonally at corners). */
export function dotOnScreen(view: View, size: Size, item: Shape, pin: Pin): Point {
  const p = toScreen(view, size, pinPoint(item, pin))
  const out = pinOut(pin)
  const length = Math.hypot(out.x, out.y) || 1
  return { x: p.x + (out.x / length) * DOT_OFFSET, y: p.y + (out.y / length) * DOT_OFFSET }
}

/** How close (in screen pixels) the pointer must be to a dot for an arrow to snap to it. */
const DOT_SNAP = 14
/** How far outside an item (in screen pixels) the pointer can go and still show its dots. */
const DOT_REACH = DOT_OFFSET + 12

/**
 * How tall a section's title strip is on screen (see .section-title: 15px words that stay readable
 * when zoomed out, 2px above and 6 screen pixels below).
 */
export const sectionTitleHeight = (zoom: number): number => (15 / Math.max(zoom, 0.5)) * 1.3 * zoom + 2 * zoom + 6

/** How far outside an item (in screen pixels) the pointer can go and still show its move grip. */
const GRIP_REACH = 40

/**
 * The item whose move grip shows: the top-most thing the pointer is over (or just around, to reach
 * the grip), and failing that, the innermost section the pointer is anywhere inside.
 */
export function gripTarget(p: Point, zoom: number): string | null {
  const reach = GRIP_REACH / zoom
  const items = currentItems()
  const near = (s: Shape, by: number): boolean => p.x >= s.x - by && p.x <= s.x + s.w + by && p.y >= s.y - by && p.y <= s.y + s.h + by
  for (let k = items.length - 1; k >= 0; k--) {
    const s = items[k]
    // Locked things can't be moved, so they have no grip.
    if (s.type !== 'arrow' && s.type !== 'section' && !s.locked && near(s, reach)) return s.id
  }
  const sections = items.filter((s): s is Shape => s.type === 'section' && !s.locked && near(s, reach))
  return sections.sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id ?? null
}

/** Where an item's move grip sits on screen: just left of its top-left corner (beside a section's title). */
export function gripOnScreen(view: View, size: Size, item: Shape): Point {
  const corner = toScreen(view, size, item)
  return item.type === 'section' ? { x: corner.x - 14, y: corner.y - sectionTitleHeight(view.zoom) / 2 } : { x: corner.x - 22, y: corner.y + 12 }
}

/** An arrow end at a board point: attached to `shape` if there is one, otherwise loose there. */
export const endAt = (p: Point, shape: Shape | null | undefined): ArrowEnd => ({ item: shape?.id ?? null, x: p.x, y: p.y })

/** An arrow end pinned to one of an item's dots. */
export const endOnDot = (shape: Shape, pin: Pin): ArrowEnd => ({ item: shape.id, ...pinPoint(shape, pin), pin })

/**
 * The item an arrow could join under a window point, skipping `except`. The canvas holds on to
 * the pointer during a press, so this looks at what's really there.
 */
export function shapeUnder(x: number, y: number, except: string | null = null): Shape | null {
  const items = currentItems()
  for (const el of document.elementsFromPoint(x, y)) {
    const id = el.closest<HTMLElement | SVGElement>('[data-item-id]')?.dataset.itemId
    const item = id && id !== except ? items.find((i) => i.id === id) : undefined
    if (canJoin(item)) return item
  }
  return null
}

/** The dot nearest `at` (a point on the canvas, in screen pixels) within DOT_SNAP, on any item but `except`. */
export function dotNear(at: Point, view: View, size: Size, except: string | null): { shape: Shape; pin: Pin } | null {
  let best: { shape: Shape; pin: Pin } | null = null
  let bestDistance = DOT_SNAP
  for (const shape of currentItems()) {
    if (shape.id === except || !canJoin(shape)) continue
    for (const pin of pinsOf(shape)) {
      // Near the dot itself, or the spot on the edge it stands for.
      const dot = dotOnScreen(view, size, shape, pin)
      const edge = toScreen(view, size, pinPoint(shape, pin))
      const distance = Math.min(Math.hypot(dot.x - at.x, dot.y - at.y), Math.hypot(edge.x - at.x, edge.y - at.y))
      if (distance <= bestDistance) {
        best = { shape, pin }
        bestDistance = distance
      }
    }
  }
  return best
}

/** The top-most item a board point is over, or close enough to reach its dots. */
export function shapeAround(p: Point, zoom: number): string | null {
  const reach = DOT_REACH / zoom
  const items = currentItems()
  for (let k = items.length - 1; k >= 0; k--) {
    const s = items[k]
    if (canJoin(s) && p.x >= s.x - reach && p.x <= s.x + s.w + reach && p.y >= s.y - reach && p.y <= s.y + s.h + reach) return s.id
  }
  return null
}
