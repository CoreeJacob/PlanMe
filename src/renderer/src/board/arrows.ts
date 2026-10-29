// Where arrows go. An attached end sits at the middle of whichever side of its item faces the
// other end (or its nearest bend), so arrows never cut across the things they join. Straight
// arrows go through their bends; curved ones go smoothly through them, leaving and arriving
// straight out from the sides; right-angled ("elbow") arrows also leave and arrive straight out,
// with their middle run where it's been dragged to.

import type { ArrowEnd, ArrowItem, Item, Rect, Shape } from '@shared/types'
import { centre, sideFacing, type Point, type Side } from '@/lib/geometry'
import { SLANT, sideMiddle, type Outlined } from './outlines'

const OUT: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }
/** How far an elbow arrow goes straight out from a side before turning. */
const ELBOW_GAP = 24
/** How many points each stretch of a curve is drawn with. */
const CURVE_STEPS = 24

export const isArrow = (item: Item): item is ArrowItem => item.type === 'arrow'
export const isShape = (item: Item): item is Shape => item.type !== 'arrow'

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

const SIDE_MIDDLES: Pin[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 }
]

/** Which way is "out" from a dot, as a direction (diagonal at corners, none in the middle). */
export function pinOut(pin: Pin): Point {
  // A dot part-way down a side (even a parallelogram's sloping one) points sideways.
  const sideways = pin.y > 0 && pin.y < 1 ? (pin.x < 0.5 ? -1 : 1) : 0
  return { x: pin.x === 0 ? -1 : pin.x === 1 ? 1 : sideways, y: pin.y === 0 ? -1 : pin.y === 1 ? 1 : 0 }
}

/** The dots an arrow can be dropped on: the corners, the middle of each side, and more along long sides. */
export function pinsOf(r: Outlined): Pin[] {
  const across = along(r.w)
  const down = along(r.h)
  // Ovals and diamonds only touch their box at the middle of each side.
  if (r.shape === 'oval' || r.shape === 'diamond') return SIDE_MIDDLES
  if (r.shape === 'parallelogram') {
    // The corners and sloping sides are in from the box: dots go on the actual outline.
    const half = SLANT / 2
    return [
      { x: SLANT, y: 0 },
      ...across.map((x) => ({ x: SLANT + x * (1 - SLANT), y: 0 })),
      { x: 1, y: 0 },
      { x: 1 - half, y: 0.5 },
      { x: 1 - SLANT, y: 1 },
      ...across.map((x) => ({ x: (1 - SLANT) * (1 - x), y: 1 })),
      { x: 0, y: 1 },
      { x: half, y: 0.5 }
    ]
  }
  // A cylinder's top and bottom are curved: no corner dots.
  if (r.shape === 'cylinder') return [{ x: 0.5, y: 0 }, ...down.map((y) => ({ x: 1, y })), { x: 0.5, y: 1 }, ...down.map((y) => ({ x: 0, y: 1 - y }))]
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
  const out = pinOut(pin)
  const sides: Side[] = []
  if (out.x < 0) sides.push('left')
  if (out.x > 0) sides.push('right')
  if (out.y < 0) sides.push('top')
  if (out.y > 0) sides.push('bottom')
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

type Routed = Pick<ArrowItem, 'from' | 'to' | 'route' | 'bends'>

/** An arrow's ends (where, and which way is out), and the bends it goes through between them. */
function routeOf(arrow: Routed, lookup: Lookup): { start: { p: Point; side: Side }; end: { p: Point; side: Side }; via: Point[] } {
  const a = shapeOf(arrow.from, lookup)
  const b = shapeOf(arrow.to, lookup)
  // A right-angled arrow's bend only moves its middle run; the others' ends face their nearest bend.
  const via = arrow.route === 'elbow' ? [] : (arrow.bends ?? [])
  const start = endOf(arrow.from, a, via[0] ?? aimAt(arrow.to, b))
  const end = endOf(arrow.to, b, via.at(-1) ?? aimAt(arrow.from, a))
  return { start, end, via }
}

/** The points an arrow passes through, from its start to its end (at least two; many along a curve). */
export function arrowPoints(arrow: Routed, lookup: Lookup): Point[] {
  const { start, end, via } = routeOf(arrow, lookup)
  if (arrow.route === 'elbow') return tidy([start.p, ...elbow(start.p, OUT[start.side], end.p, OUT[end.side], arrow.bends?.[0]).corners, end.p])
  if (arrow.route === 'curve') return curve(start, end, via, !!arrow.from.item, !!arrow.to.item)
  return [start.p, ...via, end.p]
}

/**
 * A smooth curve through `via`, leaving `start` and arriving at `end` straight out from their
 * sides (for ends joined to items), drawn as many short straight pieces.
 */
function curve(start: { p: Point; side: Side }, end: { p: Point; side: Side }, via: Point[], outOfStart: boolean, intoEnd: boolean): Point[] {
  const points = [start.p, ...via, end.p]
  const n = points.length
  const gap = (k: number): number => Math.hypot(points[k + 1].x - points[k].x, points[k + 1].y - points[k].y)
  // Which way, and how fast, the curve runs through each point.
  const tangents = points.map((p, k) => {
    if (k === 0 && outOfStart) return { x: OUT[start.side].x * gap(0) * 1.5, y: OUT[start.side].y * gap(0) * 1.5 }
    if (k === n - 1 && intoEnd) return { x: -OUT[end.side].x * gap(n - 2) * 1.5, y: -OUT[end.side].y * gap(n - 2) * 1.5 }
    const before = points[Math.max(0, k - 1)]
    const after = points[Math.min(n - 1, k + 1)]
    const scale = k === 0 || k === n - 1 ? 1 : 0.5
    return { x: (after.x - before.x) * scale, y: (after.y - before.y) * scale }
  })
  const out: Point[] = [points[0]]
  for (let k = 0; k < n - 1; k++) {
    const [p0, p1, t0, t1] = [points[k], points[k + 1], tangents[k], tangents[k + 1]]
    for (let step = 1; step <= CURVE_STEPS; step++) {
      // A cubic through p0 and p1 with those tangents (Hermite).
      const t = step / CURVE_STEPS
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
      const h10 = t ** 3 - 2 * t ** 2 + t
      const h01 = -2 * t ** 3 + 3 * t ** 2
      const h11 = t ** 3 - t ** 2
      out.push({ x: h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x, y: h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y })
    }
  }
  return out
}

/** The points a straight or curved arrow is drawn through: its ends and its bends. */
export function controlPoints(arrow: Routed, lookup: Lookup): Point[] {
  const { start, end, via } = routeOf(arrow, lookup)
  return [start.p, ...via, end.p]
}

/** A handle on a selected arrow: a bend to drag (double-click removes it), a place to add one, or a right-angled arrow's middle run. */
export type BendHandle = { kind: 'bend'; index: number; p: Point } | { kind: 'add'; index: number; p: Point } | { kind: 'elbow'; p: Point }

/**
 * Where a selected arrow's handles go. `avoid` is its label (where, and roughly how far it
 * reaches): a place to add a bend that would be under it moves along the line, clear of it, so
 * the label can still be grabbed.
 */
export function bendHandles(arrow: Routed, lookup: Lookup, avoid?: { p: Point; reach: number }): BendHandle[] {
  const { start, end, via } = routeOf(arrow, lookup)
  if (arrow.route === 'elbow') {
    const { corners, run } = elbow(start.p, OUT[start.side], end.p, OUT[end.side], arrow.bends?.[0])
    if (run === null) return []
    const [a, b] = [corners[run], corners[run + 1]]
    return [{ kind: 'elbow', p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }]
  }
  const bends: BendHandle[] = via.map((p, index) => ({ kind: 'bend', index, p }))
  // Between each pair of points (along the curve, for a curve), a place to add another bend.
  const line = arrow.route === 'curve' ? arrowPoints(arrow, lookup) : [start.p, ...via, end.p]
  const clear = (p: Point): boolean => !avoid || Math.hypot(p.x - avoid.p.x, p.y - avoid.p.y) > avoid.reach
  const adds: BendHandle[] = []
  for (let index = 0; index <= via.length; index++) {
    // The points along this stretch, the middle first and then outwards, and the first clear of the label.
    const stretch =
      arrow.route === 'curve'
        ? line.slice(index * CURVE_STEPS, (index + 1) * CURVE_STEPS + 1)
        : Array.from({ length: 21 }, (_, k) => ({ x: line[index].x + ((line[index + 1].x - line[index].x) * k) / 20, y: line[index].y + ((line[index + 1].y - line[index].y) * k) / 20 }))
    const middle = (stretch.length - 1) / 2
    const outwards = stretch.map((p, k) => ({ p, away: Math.abs(k - middle) })).sort((a, b) => a.away - b.away)
    const spot = outwards.find((o) => o.away < middle - 1 && clear(o.p)) ?? outwards[0]
    adds.push({ kind: 'add', index, p: spot.p })
  }
  return [...bends, ...adds]
}

/**
 * The corners of a right-angled route from `s` (leaving in direction `ds`) to `e` (arriving
 * from direction `de`, which points out of its side). `at`, if given, is where the middle run
 * goes; `run` says which corners it's between (none when there's only one corner).
 */
function elbow(s: Point, ds: Point, e: Point, de: Point, at?: Point): { corners: Point[]; run: number | null } {
  const s1 = { x: s.x + ds.x * ELBOW_GAP, y: s.y + ds.y * ELBOW_GAP }
  const e1 = { x: e.x + de.x * ELBOW_GAP, y: e.y + de.y * ELBOW_GAP }
  const sideways = (d: Point): boolean => d.x !== 0

  if (sideways(ds) === sideways(de)) {
    // Both leave sideways (or both up/down). Work it out sideways, swapping x and y for up/down.
    const flip = !sideways(ds)
    const f = (p: Point): Point => (flip ? { x: p.y, y: p.x } : p)
    const [S, E, S1, E1, DS, DE] = [s, e, s1, e1, ds, de].map(f)
    const AT = at && f(at)
    let corners: Point[]
    let run = 0
    if (DS.x === DE.x) {
      // Same way (e.g. both out of the right side): go out past both, then across.
      const X = AT?.x ?? (DS.x > 0 ? Math.max(S1.x, E1.x) : Math.min(S1.x, E1.x))
      corners = [
        { x: X, y: S.y },
        { x: X, y: E.y }
      ]
    } else if ((E.x - S.x) * DS.x > 0) {
      // Facing each other with room between: across, up or down halfway (or where it's been dragged), across.
      const mid = AT?.x ?? (S.x + E.x) / 2
      corners = [
        { x: mid, y: S.y },
        { x: mid, y: E.y }
      ]
    } else {
      // Facing away from each other: out, round the middle (or where it's been dragged), and back in.
      const mid = AT?.y ?? (S1.y + E1.y) / 2
      corners = [S1, { x: S1.x, y: mid }, { x: E1.x, y: mid }, E1]
      run = 1
    }
    return { corners: corners.map(f), run }
  }

  // One leaves sideways and the other up/down: one corner, if it's in front of both sides.
  const corner = sideways(ds) ? { x: e.x, y: s.y } : { x: s.x, y: e.y }
  const ahead = (from: Point, d: Point, p: Point): boolean => (p.x - from.x) * d.x + (p.y - from.y) * d.y > 0
  if (ahead(s, ds, corner) && ahead(e, de, corner)) return { corners: [corner], run: null }
  return { corners: sideways(ds) ? [s1, { x: s1.x, y: e1.y }, e1] : [s1, { x: e1.x, y: s1.y }, e1], run: null }
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

/** The point a fraction of the way along a line through `points` (0 the start, 1 the end): where a label goes. */
export function pointAlong(points: readonly Point[], fraction = 0.5): Point {
  const lengths = points.slice(1).map((p, k) => Math.hypot(p.x - points[k].x, p.y - points[k].y))
  let left = lengths.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, fraction))
  for (let k = 0; k < lengths.length; k++) {
    if (left <= lengths[k] || k === lengths.length - 1) {
      const t = lengths[k] ? left / lengths[k] : 0
      return { x: points[k].x + (points[k + 1].x - points[k].x) * t, y: points[k].y + (points[k + 1].y - points[k].y) * t }
    }
    left -= lengths[k]
  }
  return points[0]
}

/** How far along a line through `points` (0 the start, 1 the end) is the point on it nearest `p`. */
export function fractionAlong(points: readonly Point[], p: Point): number {
  let best = { distance: Infinity, at: 0 }
  let walked = 0
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length ** 2)) : 0
    const distance = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y)
    if (distance < best.distance) best = { distance, at: walked + t * length }
    walked += length
  }
  return walked ? best.at / walked : 0.5
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
