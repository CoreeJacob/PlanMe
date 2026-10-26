// Lining things up while dragging: when an edge or the middle of what's moving comes close to
// an edge or the middle of another item, it jumps into line, and a guide line shows it.

import type { Rect } from '@shared/types'
import type { Handle } from '@/board/items'

/** A guide line: vertical (at x, from y1 to y2) or horizontal (at y, from x1 to x2). */
export type Guide = { axis: 'x'; at: number; from: number; to: number } | { axis: 'y'; at: number; from: number; to: number }

interface Match {
  /** How far to shift to be in line. */
  shift: number
  /** The line it lines up on. */
  at: number
}

const xs = (r: Rect): number[] => [r.x, r.x + r.w / 2, r.x + r.w]
const ys = (r: Rect): number[] => [r.y, r.y + r.h / 2, r.y + r.h]

/** The closest line-up within `threshold` between any of `mine` and any of `theirs`. */
function closest(mine: number[], theirs: number[], threshold: number): Match | null {
  let best: Match | null = null
  for (const m of mine) {
    for (const t of theirs) {
      const shift = t - m
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: t }
    }
  }
  return best
}

/** Guides along each line `moved` now shares with other items, spanning all of them. */
function guidesFor(moved: Rect, others: readonly Rect[], x: number | null, y: number | null): Guide[] {
  const guides: Guide[] = []
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01
  if (x !== null) {
    const lined = [moved, ...others.filter((o) => xs(o).some((v) => near(v, x)))]
    guides.push({ axis: 'x', at: x, from: Math.min(...lined.map((r) => r.y)), to: Math.max(...lined.map((r) => r.y + r.h)) })
  }
  if (y !== null) {
    const lined = [moved, ...others.filter((o) => ys(o).some((v) => near(v, y)))]
    guides.push({ axis: 'y', at: y, from: Math.min(...lined.map((r) => r.x)), to: Math.max(...lined.map((r) => r.x + r.w)) })
  }
  return guides
}

/** Where `moving` should go so it lines up with `others`, and the guides to show. */
export function snapMove(moving: Rect, others: readonly Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const mx = closest(xs(moving), others.flatMap(xs), threshold)
  const my = closest(ys(moving), others.flatMap(ys), threshold)
  const dx = mx?.shift ?? 0
  const dy = my?.shift ?? 0
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy }
  return { dx, dy, guides: guidesFor(moved, others, mx ? mx.at : null, my ? my.at : null) }
}

/** `rect` after its moving sides (those of `handle`) line up with `others`, and the guides to show. */
export function snapResize(rect: Rect, handle: Handle, others: readonly Rect[], threshold: number): { rect: Rect; guides: Guide[] } {
  let { x, y, w, h } = rect
  const hasW = handle.includes('w')
  const hasE = handle.includes('e')
  const hasN = handle.includes('n')
  const hasS = handle.includes('s')
  const mx = hasW || hasE ? closest([hasW ? x : x + w], others.flatMap(xs), threshold) : null
  const my = hasN || hasS ? closest([hasN ? y : y + h], others.flatMap(ys), threshold) : null
  if (mx) {
    if (hasW) {
      x += mx.shift
      w -= mx.shift
    } else w += mx.shift
  }
  if (my) {
    if (hasN) {
      y += my.shift
      h -= my.shift
    } else h += my.shift
  }
  const snapped = { x, y, w, h }
  return { rect: snapped, guides: guidesFor(snapped, others, mx ? mx.at : null, my ? my.at : null) }
}
