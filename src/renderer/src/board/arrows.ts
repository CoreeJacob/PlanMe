// Where arrows go. An attached end sits at the middle of whichever side of its item faces the
// other end, so arrows never cut across the things they join. Right-angled ("elbow") arrows
// leave and arrive straight out from those sides.

import type { ArrowEnd, ArrowItem, Item, Rect, Shape } from '@shared/types'

export type Point = { x: number; y: number }
export type Side = 'top' | 'right' | 'bottom' | 'left'

const OUT: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
/** How far an elbow arrow goes straight out from a side before turning. */
const ELBOW_GAP = 24

export const isArrow = (item: Item): item is ArrowItem => item.type === 'arrow'
export const isShape = (item: Item): item is Shape => item.type !== 'arrow'
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

function sideMiddle(r: Rect, side: Side): Point {
  const c = centre(r)
  if (side === 'top') return { x: c.x, y: r.y }
  if (side === 'bottom') return { x: c.x, y: r.y + r.h }
  if (side === 'left') return { x: r.x, y: c.y }
  return { x: r.x + r.w, y: c.y }
}

export type Lookup = (id: string) => Shape | undefined

/** A lookup for the items on a tab. */
export function lookupIn(items: readonly Item[]): Lookup {
  const shapes = new Map<string, Shape>()
  for (const i of items) if (isShape(i)) shapes.set(i.id, i)
  return (id) => shapes.get(id)
}

const shapeOf = (end: ArrowEnd, lookup: Lookup): Shape | undefined => (end.item ? lookup(end.item) : undefined)
const loosePoint = (end: ArrowEnd): Point => ({ x: end.x, y: end.y })

// ---------- dots ----------

/** A dot around an item's edge, as fractions of its width and height (see ArrowEnd.pin). */
export type Pin = { x: number; y: number }

/** Roughly how far apart the dots along a long side are. */
const DOT_SPACING = 100

/** Fractions along a side of this length: always the middle, more on long sides (never the ends). */
function along(length: number): number[] {
  const parts = 2 * Math.max(1, Math.round(length / (2 * DOT_SPACING)))
  return Array.from({ length: parts - 1 }, (_, k) => (k + 1) / parts)
}

/** The dots an arrow can be dropped on: the corners, the middle of each side, and more along long sides. */
export function pinsOf(r: Rect): Pin[] {
  const across = along(r.w)
  const down = along(r.h)
  return [
    { x: 0, y: 0 },
    ...across.map((x) => ({ x, y: 0 })),
    { x: 1, y: 0 },
    ...down.map((y) => ({ x: 1, y })),
    { x: 1, y: 1 },
    ...across.map((x) => ({ x: 1 - x, y: 1 })),
    { x: 0, y: 1 },
    ...down.map((y) => ({ x: 0, y: 1 - y }))
  ]
}

export const pinPoint = (r: Rect, pin: Pin): Point => ({ x: r.x + pin.x * r.w, y: r.y + pin.y * r.h })

/** Which way is "out" from a dot. A corner has two; it uses the one facing `aim` more. */
export function pinSide(pin: Pin, r: Rect, aim: Point): Side {
  const sides: Side[] = []
  if (pin.x === 0) sides.push('left')
  if (pin.x === 1) sides.push('right')
  if (pin.y === 0) sides.push('top')
  if (pin.y === 1) sides.push('bottom')
  if (!sides.length) return sideFacing(r, aim)
  const p = pinPoint(r, pin)
  const facing = (s: Side): number => (aim.x - p.x) * OUT[s].x + (aim.y - p.y) * OUT[s].y
  return sides.reduce((best, s) => (facing(s) > facing(best) ? s : best))
}

/** The dot on `r` nearest a point. */
export function nearestPin(r: Rect, p: Point): Pin {
  let best = pinsOf(r)[0]
  let bestDistance = Infinity
  for (const pin of pinsOf(r)) {
    const q = pinPoint(r, pin)
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bestDistance) {
      best = pin
      bestDistance = d
    }
  }
  return best
}

/** True if the line from `a` to `b` passes through the inside of `r` (not just along or touching its edge). */
export function crossesBox(a: Point, b: Point, r: Rect): boolean {
  const inset = 1
  const left = r.x + inset
  const right = r.x + r.w - inset
  const top = r.y + inset
  const bottom = r.y + r.h - inset
  if (right <= left || bottom <= top) return false
  // Clip the line to the box (Liang–Barsky): if any of it is left, it goes through.
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y]
  ]) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) t0 = Math.max(t0, t)
      else t1 = Math.min(t1, t)
      if (t0 > t1) return false
    }
  }
  return t1 - t0 > 1e-9
}

// ---------- routes ----------

/** Where an end is and which way is "out" from it, given the point it faces. */
function endOf(end: ArrowEnd, shape: Shape | undefined, aim: Point): { p: Point; side: Side } {
  if (shape && end.pin) return { p: pinPoint(shape, end.pin), side: pinSide(end.pin, shape, aim) }
  if (shape) {
    const side = sideFacing(shape, aim)
    return { p: sideMiddle(shape, side), side }
  }
  return { p: loosePoint(end), side: sideFacing({ ...loosePoint(end), w: 0, h: 0 }, aim) }
}

/** The point an end faces from the other end's side: a dot, an item's middle, or a loose point. */
function aimAt(end: ArrowEnd, shape: Shape | undefined): Point {
  if (shape && end.pin) return pinPoint(shape, end.pin)
  return shape ? centre(shape) : loosePoint(end)
}

/** The points an arrow passes through, from its start to its end (at least two). */
export function arrowPoints(arrow: Pick<ArrowItem, 'from' | 'to' | 'route'>, lookup: Lookup): Point[] {
  const a = shapeOf(arrow.from, lookup)
  const b = shapeOf(arrow.to, lookup)
  const start = endOf(arrow.from, a, aimAt(arrow.to, b))
  const end = endOf(arrow.to, b, aimAt(arrow.from, a))
  if (arrow.route === 'straight') return [start.p, end.p]
  return tidy([start.p, ...elbow(start.p, OUT[start.side], end.p, OUT[end.side]), end.p])
}

/**
 * The corners of a right-angled route from `s` (leaving in direction `ds`) to `e` (arriving
 * from direction `de`, which points out of its side).
 */
function elbow(s: Point, ds: Point, e: Point, de: Point): Point[] {
  const s1 = { x: s.x + ds.x * ELBOW_GAP, y: s.y + ds.y * ELBOW_GAP }
  const e1 = { x: e.x + de.x * ELBOW_GAP, y: e.y + de.y * ELBOW_GAP }
  const sideways = (d: Point): boolean => d.x !== 0

  if (sideways(ds) === sideways(de)) {
    // Both leave sideways (or both up/down). Work it out sideways, swapping x and y for up/down.
    const flip = !sideways(ds)
    const f = (p: Point): Point => (flip ? { x: p.y, y: p.x } : p)
    const [S, E, S1, E1, DS, DE] = [s, e, s1, e1, ds, de].map(f)
    let corners: Point[]
    if (DS.x === DE.x) {
      // Same way (e.g. both out of the right side): go out past both, then across.
      const X = DS.x > 0 ? Math.max(S1.x, E1.x) : Math.min(S1.x, E1.x)
      corners = [
        { x: X, y: S.y },
        { x: X, y: E.y }
      ]
    } else if ((E.x - S.x) * DS.x > 0) {
      // Facing each other with room between: across, up or down halfway, across.
      const mid = (S.x + E.x) / 2
      corners = [
        { x: mid, y: S.y },
        { x: mid, y: E.y }
      ]
    } else {
      // Facing away from each other: out, round the middle, and back in.
      const mid = (S1.y + E1.y) / 2
      corners = [S1, { x: S1.x, y: mid }, { x: E1.x, y: mid }, E1]
    }
    return corners.map(f)
  }

  // One leaves sideways and the other up/down: one corner, if it's in front of both sides.
  const corner = sideways(ds) ? { x: e.x, y: s.y } : { x: s.x, y: e.y }
  const ahead = (from: Point, d: Point, p: Point): boolean => (p.x - from.x) * d.x + (p.y - from.y) * d.y > 0
  if (ahead(s, ds, corner) && ahead(e, de, corner)) return [corner]
  return sideways(ds) ? [s1, { x: s1.x, y: e1.y }, e1] : [s1, { x: e1.x, y: s1.y }, e1]
}

/** Drops repeated points and corners that are really straight on. */
function tidy(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    const before = out.at(-2)
    if (before && last && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) out.pop()
    out.push(p)
  }
  return out.length >= 2 ? out : [points[0], points.at(-1)!]
}

/** The point halfway along a line through `points` (where a label goes). */
export function halfway(points: readonly Point[]): Point {
  const lengths = points.slice(1).map((p, k) => Math.hypot(p.x - points[k].x, p.y - points[k].y))
  let left = lengths.reduce((a, b) => a + b, 0) / 2
  for (let k = 0; k < lengths.length; k++) {
    if (left <= lengths[k] || k === lengths.length - 1) {
      const t = lengths[k] ? left / lengths[k] : 0
      return { x: points[k].x + (points[k + 1].x - points[k].x) * t, y: points[k].y + (points[k + 1].y - points[k].y) * t }
    }
    left -= lengths[k]
  }
  return points[0]
}

/** The box around an arrow's line. */
export function arrowBounds(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The box any item takes up (an arrow's is around its line). */
export function boxOf(item: Item, lookup: Lookup): Rect {
  return isArrow(item) ? arrowBounds(arrowPoints(item, lookup)) : item
}

/** An end that's attached to `item`. */
export const attachedTo = (end: ArrowEnd, ids: ReadonlySet<string>): boolean => end.item !== null && ids.has(end.item)

/** Arrows (not among `ids`) with an end attached to any of `ids`. */
export function arrowsAttached(items: readonly Item[], ids: ReadonlySet<string>): ArrowItem[] {
  return items.filter((i): i is ArrowItem => isArrow(i) && !ids.has(i.id) && (attachedTo(i.from, ids) || attachedTo(i.to, ids)))
}

/** The arrow with any ends attached to `ids` let go, left loose where they were. */
export function detach(arrow: ArrowItem, ids: ReadonlySet<string>, lookup: Lookup): ArrowItem {
  if (!attachedTo(arrow.from, ids) && !attachedTo(arrow.to, ids)) return arrow
  const points = arrowPoints(arrow, lookup)
  const start = points[0]
  const end = points.at(-1)!
  return {
    ...arrow,
    from: attachedTo(arrow.from, ids) ? { item: null, x: start.x, y: start.y } : arrow.from,
    to: attachedTo(arrow.to, ids) ? { item: null, x: end.x, y: end.y } : arrow.to
  }
}
