// Points and rectangles: the shared maths for anything placed on the board.

import type { Rect } from '@shared/types'

export type Point = { x: number; y: number }
export type Side = 'top' | 'right' | 'bottom' | 'left'

export const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** The side of `r` that the line from its middle towards `p` leaves through. */
export function sideFacing(r: Rect, p: Point): Side {
  const c = centre(r)
  const dx = p.x - c.x
  const dy = p.y - c.y
  // Measured against the box's shape, so a wide box uses its long sides for things above and below.
  const horizontal = r.w || r.h ? Math.abs(dx) * r.h >= Math.abs(dy) * r.w : Math.abs(dx) >= Math.abs(dy)
  if (horizontal) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
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

/** True if `inner` is entirely within `outer`. */
export const within = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/** A rectangle from two corners, in any order. */
export function rectFrom(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}
