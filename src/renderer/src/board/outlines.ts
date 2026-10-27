// The outlines boxes can have, as far as anything but drawing them needs to know: where their
// sides are, so arrows and dots sit on the actual line rather than in mid-air.

import type { Rect } from '@shared/types'
import { centre, type Point, type Side } from '@/lib/geometry'

/** How far a parallelogram's top leans right, as a fraction of its width. */
export const SLANT = 0.2
/** The height of a cylinder's top and bottom curves. */
export const cylinderCap = (w: number, h: number): number => Math.min(h * 0.12, w * 0.25)

/** The outline a rectangle stands for: a box's shape, or a plain rectangle for anything else. */
export type Outlined = Rect & { shape?: string }

/** The middle of a side, on the item's outline (a parallelogram's sloping sides are in from the corners). */
export function sideMiddle(r: Outlined, side: Side): Point {
  const c = centre(r)
  const lean = r.shape === 'parallelogram' ? (r.w * SLANT) / 2 : 0
  if (side === 'top') return { x: c.x, y: r.y }
  if (side === 'bottom') return { x: c.x, y: r.y + r.h }
  if (side === 'left') return { x: r.x + lean, y: c.y }
  return { x: r.x + r.w - lean, y: c.y }
}

