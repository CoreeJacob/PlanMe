import { describe, expect, it } from 'vitest'
import type { ArrowItem, Item, Shape } from '@shared/types'
import { sideFacing } from '@/lib/geometry'
import { arrowPoints, arrowsAttached, bendHandles, boxOf, crossesBox, detach, fractionAlong, lookupIn, nearestPin, pinSide, pinsOf, pointAlong } from './arrows'
import { copiesOf, moved, moveItems, newArrow, newItem } from './items'

const box = (id: string, x: number, y: number, w = 100, h = 100): Shape => newItem('box', id, { x, y, w, h })
const joined = (from: string, to: string, route: ArrowItem['route'] = 'straight'): ArrowItem => ({
  ...newArrow('arr', { item: from, x: 0, y: 0 }, { item: to, x: 0, y: 0 }),
  route
})

describe('where arrows attach', () => {
  it('uses the side facing the other end', () => {
    const r = { x: 0, y: 0, w: 100, h: 100 }
    expect(sideFacing(r, { x: 500, y: 60 })).toBe('right')
    expect(sideFacing(r, { x: -500, y: 0 })).toBe('left')
    expect(sideFacing(r, { x: 50, y: 400 })).toBe('bottom')
    expect(sideFacing(r, { x: 60, y: -400 })).toBe('top')
    // A wide box uses its long sides for things mostly above or below it.
    expect(sideFacing({ x: 0, y: 0, w: 400, h: 50 }, { x: 400, y: 200 })).toBe('bottom')
  })

  it('joins side middles with a straight arrow, and follows when an item moves', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 0)
    const arrow = joined('a', 'b')
    expect(arrowPoints(arrow, lookupIn([a, b, arrow]))).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 }
    ])
    const lower = box('b', 0, 300)
    expect(arrowPoints(arrow, lookupIn([a, lower]))).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 300 }
    ])
  })

  it('goes to loose ends where they are', () => {
    const a = box('a', 0, 0)
    const arrow: ArrowItem = { ...joined('a', 'b'), to: { item: null, x: 400, y: 70 } }
    expect(arrowPoints(arrow, lookupIn([a]))).toEqual([
      { x: 100, y: 50 },
      { x: 400, y: 70 }
    ])
    // An item that's gone leaves its end where it was last.
    const gone: ArrowItem = { ...joined('a', 'missing'), to: { item: 'missing', x: 10, y: 500 } }
    expect(arrowPoints(gone, lookupIn([a])).at(-1)).toEqual({ x: 10, y: 500 })
  })
})

describe('right-angled arrows', () => {
  it('steps across, down and across between facing sides', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 200)
    // b's middle is further across than down, so a's right side faces it and b's left side faces a.
    expect(arrowPoints(joined('a', 'b', 'elbow'), lookupIn([a, b]))).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 250 },
      { x: 300, y: 250 }
    ])
  })

  it('turns one corner when one side faces across and the other up', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 120, 100, 400)
    // From a's right side across to above b, then down into b's top.
    const points = arrowPoints(joined('a', 'b', 'elbow'), lookupIn([a, b]))
    for (let k = 1; k < points.length; k++) {
      expect(points[k].x === points[k - 1].x || points[k].y === points[k - 1].y).toBe(true)
    }
    expect(points[0]).toEqual({ x: 100, y: 50 })
  })

  it('every step is straight across or straight up and down, whatever the layout', () => {
    const a = box('a', 0, 0)
    for (const [x, y] of [[300, 0], [300, 300], [-300, 50], [20, 400], [-200, -350], [150, 30]]) {
      const b = box('b', x, y, 120, 80)
      const points = arrowPoints(joined('a', 'b', 'elbow'), lookupIn([a, b]))
      expect(points.length).toBeGreaterThanOrEqual(2)
      for (let k = 1; k < points.length; k++) {
        const straight = Math.abs(points[k].x - points[k - 1].x) < 1e-9 || Math.abs(points[k].y - points[k - 1].y) < 1e-9
        expect(straight, `step ${k} to ${JSON.stringify(points[k])} for b at ${x},${y}`).toBe(true)
      }
    }
  })
})

describe('labels and bounds', () => {
  it('puts the label pointAlong along the line', () => {
    expect(
      pointAlong([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 }
      ])
    ).toEqual({ x: 100, y: 0 })
    expect(
      pointAlong([
        { x: 0, y: 0 },
        { x: 0, y: 50 }
      ])
    ).toEqual({ x: 0, y: 25 })
  })

  it('an arrow takes up the box around its line', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 200)
    const arrow = joined('a', 'b')
    const items: Item[] = [a, b, arrow]
    expect(boxOf(arrow, lookupIn(items))).toEqual({ x: 100, y: 50, w: 200, h: 200 })
  })
})

describe('arrows when items go, move or are copied', () => {
  it('finds arrows joined to items, and lets their ends go where they were', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 0)
    const arrow = joined('a', 'b')
    const items = [a, b, arrow]
    expect(arrowsAttached(items, new Set(['b'])).map((x) => x.id)).toEqual(['arr'])
    expect(arrowsAttached(items, new Set(['b', 'arr']))).toEqual([])
    const loose = detach(arrow, new Set(['b']), lookupIn(items))
    expect(loose.from).toBe(arrow.from)
    expect(loose.to).toEqual({ item: null, x: 300, y: 50 })
  })

  it('moving an arrow moves only its loose ends', () => {
    const arrow: ArrowItem = { ...joined('a', 'b'), to: { item: null, x: 400, y: 70 } }
    const m = moved(arrow, 10, 20) as ArrowItem
    expect(m.from).toBe(arrow.from)
    expect(m.to).toEqual({ item: null, x: 410, y: 90 })
    const both = joined('a', 'b')
    expect(moved(both, 10, 20)).toBe(both)
  })

  it('copies keep arrows joined to the copies, and let go of anything not copied', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 0)
    let n = 0
    const copies = copiesOf([a, b, joined('a', 'b')], 24, 24, () => `c${++n}`)
    const arrow = copies[2] as ArrowItem
    expect(arrow.from.item).toBe('c1')
    expect(arrow.to.item).toBe('c2')
    const half = copiesOf([a, joined('a', 'b')], 0, 0, () => `d${++n}`)[1] as ArrowItem
    expect(half.from.item?.startsWith('d')).toBe(true)
    expect(half.to.item).toBeNull()
  })
})

describe('dots for joining arrows', () => {
  it('has the corners and side middles, and more dots along long sides', () => {
    const pins = pinsOf({ x: 0, y: 0, w: 200, h: 200 })
    expect(pins).toHaveLength(8)
    expect(pins).toContainEqual({ x: 1, y: 0.5 })
    expect(pins).toContainEqual({ x: 0, y: 0 })
    const wide = pinsOf({ x: 0, y: 0, w: 600, h: 100 })
    // The top: two corners and five dots between (about every 100), always including the middle.
    expect(wide.filter((p) => p.y === 0).map((p) => p.x)).toEqual([0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1])
  })

  it('an end pinned to a dot stays on it, wherever the other end goes', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 0)
    const pinned: ArrowItem = { ...joined('a', 'b'), from: { item: 'a', x: 0, y: 0, pin: { x: 0.5, y: 0 } } }
    expect(arrowPoints(pinned, lookupIn([a, b]))[0]).toEqual({ x: 50, y: 0 })
    const moved = box('b', -400, 300)
    expect(arrowPoints(pinned, lookupIn([a, moved]))[0]).toEqual({ x: 50, y: 0 })
  })

  it('a pinned end leaves a right-angled arrow straight out from its side (a corner picks the side facing the other end)', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 300)
    const fromTop: ArrowItem = { ...joined('a', 'b', 'elbow'), from: { item: 'a', x: 0, y: 0, pin: { x: 0.5, y: 0 } } }
    const points = arrowPoints(fromTop, lookupIn([a, b]))
    expect(points[0]).toEqual({ x: 50, y: 0 })
    expect(points[1].x).toBe(50) // goes up first
    expect(points[1].y).toBeLessThan(0)
    expect(pinSide({ x: 1, y: 1 }, a, { x: 500, y: 120 })).toBe('right')
    expect(pinSide({ x: 1, y: 1 }, a, { x: 120, y: 500 })).toBe('bottom')
  })

  it('finds the nearest dot', () => {
    const r = { x: 0, y: 0, w: 100, h: 100 }
    expect(nearestPin(r, { x: -50, y: 45 })).toEqual({ x: 0, y: 0.5 })
    expect(nearestPin(r, { x: 130, y: 130 })).toEqual({ x: 1, y: 1 })
  })

  it('knows when a line cuts through a box rather than along or away from it', () => {
    const r = { x: 0, y: 0, w: 100, h: 100 }
    expect(crossesBox({ x: 100, y: 50 }, { x: -200, y: 50 }, r)).toBe(true)
    expect(crossesBox({ x: 100, y: 50 }, { x: 300, y: 50 }, r)).toBe(false)
    expect(crossesBox({ x: 100, y: 0 }, { x: -200, y: 0 }, r)).toBe(false) // along the top edge
    expect(crossesBox({ x: 100, y: 50 }, { x: 150, y: 400 }, r)).toBe(false)
  })

  it('copies and detaching keep or drop the pin as they should', () => {
    const a = box('a', 0, 0)
    const b = box('b', 300, 0)
    const pinned: ArrowItem = { ...joined('a', 'b'), from: { item: 'a', x: 0, y: 0, pin: { x: 0.5, y: 0 } } }
    let n = 0
    const [, copy] = copiesOf([a, pinned], 0, 0, () => `c${++n}`) as [Shape, ArrowItem]
    expect(copy.from.pin).toEqual({ x: 0.5, y: 0 })
    expect(detach(pinned, new Set(['a']), lookupIn([a, b])).from).toEqual({ item: null, x: 50, y: 0 })
  })
})

describe('bending arrows', () => {
  const a = box('a', 0, 0)
  const b = box('b', 400, 0)

  it('go through their bends, leaving each item on the side facing its nearest bend', () => {
    const arrow = { ...joined('a', 'b'), bends: [{ x: 50, y: -200 }, { x: 450, y: -200 }] }
    expect(arrowPoints(arrow, lookupIn([a, b]))).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: -200 },
      { x: 450, y: -200 },
      { x: 450, y: 0 }
    ])
  })

  it('curve smoothly from side to side, through any bends', () => {
    const curve = joined('a', 'b', 'curve')
    const points = arrowPoints(curve, lookupIn([a, b]))
    expect(points[0]).toEqual({ x: 100, y: 50 })
    expect(points.at(-1)).toEqual({ x: 400, y: 50 })
    expect(points.length).toBeGreaterThan(10)
    const bent = arrowPoints({ ...curve, bends: [{ x: 250, y: -100 }] }, lookupIn([a, b]))
    expect(bent.some((p) => Math.abs(p.x - 250) < 0.01 && Math.abs(p.y + 100) < 0.01)).toBe(true)
  })

  it('move a right-angled arrow’s middle run to where it’s dragged', () => {
    const elbow = { ...joined('a', 'b', 'elbow'), from: { item: 'a', x: 0, y: 0 }, to: { item: 'b', x: 0, y: 0 } }
    const low = box('b', 400, 300)
    expect(arrowPoints({ ...elbow, bends: [{ x: 160, y: 0 }] }, lookupIn([a, low])).map((p) => p.x)).toEqual([100, 160, 160, 400])
    const [handle] = bendHandles({ ...elbow, bends: [{ x: 160, y: 0 }] }, lookupIn([a, low]))
    expect(handle).toMatchObject({ kind: 'elbow', p: { x: 160 } })
  })

  it('offer a handle on each bend and between each pair of points', () => {
    const arrow = { ...joined('a', 'b'), bends: [{ x: 250, y: -100 }] }
    const handles = bendHandles(arrow, lookupIn([a, b]))
    expect(handles.map((h) => h.kind)).toEqual(['bend', 'add', 'add'])
    expect(handles[1].p).toEqual({ x: (100 + 250) / 2, y: (50 - 100) / 2 })
  })

  it('know how far along a point is, for sliding labels', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 }
    ]
    expect(fractionAlong(line, { x: 50, y: 10 })).toBeCloseTo(0.25)
    expect(fractionAlong(line, { x: 130, y: 100 })).toBeCloseTo(1)
    expect(pointAlong(line, 0.75)).toEqual({ x: 100, y: 50 })
  })

  it('keep their bends when one end moves, and take them along when both do', () => {
    const arrow = { ...joined('a', 'b'), bends: [{ x: 250, y: -100 }] }
    const doc = { statuses: [], tabs: [{ id: 't', name: 'T', items: [a, b, arrow] as Item[] }] }
    const one = moveItems(doc, 't', ['a'], 10, 10).tabs[0].items[2] as ArrowItem
    expect(one.bends).toEqual([{ x: 250, y: -100 }])
    const both = moveItems(doc, 't', ['a', 'b'], 10, 10).tabs[0].items[2] as ArrowItem
    expect(both.bends).toEqual([{ x: 260, y: -90 }])
    expect((copiesOf([arrow], 5, 5, () => 'c')[0] as ArrowItem).bends).toEqual([{ x: 255, y: -95 }])
  })
})
