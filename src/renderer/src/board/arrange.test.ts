import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { ArrowItem, BoardDoc, Item, Shape, TextItem, TodoItem } from '@shared/types'
import { arrange, scaleItems } from './arrange'
import { copyName, duplicateTab } from './doc'
import { itemsOf, newArrow, newItem, unlocked } from './items'
import { lookupIn } from './arrows'
import { movable } from './sections'

const box = (id: string, x: number, y: number, w = 100, h = 100, extra: Partial<Shape> = {}): Shape =>
  ({ ...newItem('box', id, { x, y, w, h }), ...extra }) as Shape
const docOf = (...items: Item[]): BoardDoc => ({ statuses: DEFAULT_STATUSES, tabs: [{ id: 't', name: 'Level 1', items }] })
const place = (d: BoardDoc): Record<string, [number, number]> =>
  Object.fromEntries(itemsOf(d, 't').filter((i): i is Shape => i.type !== 'arrow').map((i) => [i.id, [i.x, i.y]]))

describe('lining things up', () => {
  const start = docOf(box('a', 0, 0, 100, 50), box('b', 300, 100, 50, 100), box('c', 100, 400, 200, 20))

  it('lines up edges and middles of the box round them all', () => {
    expect(place(arrange(start, 't', ['a', 'b', 'c'], 'left'))).toEqual({ a: [0, 0], b: [0, 100], c: [0, 400] })
    expect(place(arrange(start, 't', ['a', 'b', 'c'], 'right'))).toEqual({ a: [250, 0], b: [300, 100], c: [150, 400] })
    expect(place(arrange(start, 't', ['a', 'b', 'c'], 'centre'))).toEqual({ a: [125, 0], b: [150, 100], c: [75, 400] })
    expect(place(arrange(start, 't', ['a', 'b', 'c'], 'top'))).toEqual({ a: [0, 0], b: [300, 0], c: [100, 0] })
    expect(place(arrange(start, 't', ['a', 'b', 'c'], 'bottom'))).toEqual({ a: [0, 370], b: [300, 320], c: [100, 400] })
  })

  it('only moves what was picked', () => {
    expect(place(arrange(start, 't', ['a', 'b'], 'left'))).toEqual({ a: [0, 0], b: [0, 100], c: [100, 400] })
  })

  it('lines up with a locked one, which stays put', () => {
    const d = docOf(box('a', 0, 0), box('b', 300, 100, 100, 100, { locked: true }), box('c', 600, 50))
    expect(place(arrange(d, 't', ['a', 'b', 'c'], 'top'))).toEqual({ a: [0, 100], b: [300, 100], c: [600, 100] })
  })

  it('takes what’s inside a section along', () => {
    const section = { ...newItem('section', 's', { x: 0, y: 0, w: 300, h: 300 }) } as Shape
    const d = docOf(section, box('inside', 50, 50), box('other', 500, 0))
    expect(place(arrange(d, 't', ['s', 'other'], 'right'))).toEqual({ s: [300, 0], inside: [350, 50], other: [500, 0] })
  })

  it('is no change at all when they’re already lined up', () => {
    const d = docOf(box('a', 0, 0), box('b', 0, 300))
    expect(arrange(d, 't', ['a', 'b'], 'left')).toBe(d)
  })
})

describe('spreading out evenly', () => {
  const start = docOf(box('a', 0, 0, 100), box('b', 150, 0, 50), box('c', 500, 0, 100), box('d', 200, 0, 100))

  it('makes the gaps between them the same, keeping the first and last where they are', () => {
    // Total width 600, filled 350: three gaps of 250/3.
    const after = place(arrange(start, 't', ['a', 'b', 'c', 'd'], 'across'))
    const g = 250 / 3
    expect(after.a[0]).toBe(0)
    expect(after.b[0]).toBeCloseTo(100 + g, 1)
    expect(after.d[0]).toBeCloseTo(150 + 2 * g, 1)
    expect(after.c[0]).toBe(500)
  })

  it('needs three or more', () => {
    const d = docOf(box('a', 0, 0), box('b', 0, 500))
    expect(arrange(d, 't', ['a', 'b'], 'down')).toBe(d)
  })
})

describe('resizing several at once', () => {
  const text: TextItem = { ...(newItem('text', 'words', { x: 100, y: 100, w: 100, h: 30 }) as TextItem), fontSize: 20 }
  const list = newItem('todo', 'list', { x: 0, y: 100, w: 100, h: 80 }) as TodoItem
  const loose: ArrowItem = newArrow('arrow', { item: 'a', x: 0, y: 0 }, { item: null, x: 200, y: 200 })
  const start = docOf(box('a', 0, 0), text, list, loose, box('fixed', 150, 0, 50, 50, { locked: true }))
  const from = { x: 0, y: 0, w: 200, h: 200 }

  it('scales places and sizes into the new box', () => {
    const d = scaleItems(start, 't', ['a', 'words', 'list', 'arrow', 'fixed'], from, { x: 0, y: 0, w: 400, h: 400 }, true)
    const items = itemsOf(d, 't')
    expect(items[0]).toMatchObject({ x: 0, y: 0, w: 200, h: 200 })
    expect(items[1]).toMatchObject({ x: 200, y: 200, w: 200, fontSize: 40 })
    expect(items[2]).toMatchObject({ x: 0, y: 200, w: 200, h: 80 })
    expect((items[3] as ArrowItem).to).toMatchObject({ x: 400, y: 400 })
    expect(items[4]).toBe(start.tabs[0].items[4])
  })

  it('stretching sideways leaves text the same size', () => {
    const d = scaleItems(start, 't', ['words'], from, { x: 0, y: 0, w: 400, h: 200 }, false)
    expect(itemsOf(d, 't')[1]).toMatchObject({ x: 200, w: 200, fontSize: 20 })
  })
})

describe('locked things', () => {
  it('stay put when what they’re with moves, even inside a section', () => {
    const section = newItem('section', 's', { x: 0, y: 0, w: 300, h: 300 })
    const items = [section, box('in', 10, 10), box('pinned', 100, 100, 50, 50, { locked: true }), box('fixedSection', 1000, 0, 300, 300, { locked: true })]
    const lookup = lookupIn(items)
    expect(movable(['s', 'pinned'], items, lookup).sort()).toEqual(['in', 's'])
    expect(movable(['fixedSection'], items, lookup)).toEqual([])
  })

  it('unlock without other changes', () => {
    const b = box('a', 0, 0, 100, 100, { locked: true })
    expect(unlocked(b)).not.toHaveProperty('locked')
    const free = box('b', 0, 0)
    expect(unlocked(free)).toBe(free)
  })
})

describe('copying a tab', () => {
  const start: BoardDoc = {
    statuses: DEFAULT_STATUSES,
    tabs: [
      {
        id: 't',
        name: 'Level 1',
        items: [
          box('a', 0, 0, 100, 100, { link: { type: 'item', item: 'b' }, locked: true }),
          box('b', 300, 0, 100, 100, { link: { type: 'tab', tab: 'u' } }),
          newArrow('ab', { item: 'a', x: 0, y: 0 }, { item: 'b', x: 0, y: 0 })
        ]
      },
      { id: 'u', name: 'Level 1 copy', items: [box('elsewhere', 0, 0)] }
    ]
  }
  let n = 0
  const copied = duplicateTab(start, 't', { id: 'copy', name: copyName(start, 'Level 1') }, () => `new${++n}`)
  const [a, b, ab] = copied.tabs[1].items as [Shape, Shape, ArrowItem]

  it('goes just after the original, with a name not already used', () => {
    expect(copied.tabs.map((t) => t.name)).toEqual(['Level 1', 'Level 1 copy 2', 'Level 1 copy'])
  })

  it('copies everything with new ids, arrows still joined and locks kept', () => {
    expect([a.id, b.id, ab.id].every((id) => id.startsWith('new'))).toBe(true)
    expect([ab.from.item, ab.to.item]).toEqual([a.id, b.id])
    expect(a.locked).toBe(true)
  })

  it('points links between its items at the copies, leaving other links alone', () => {
    expect(a.link).toEqual({ type: 'item', item: b.id })
    expect(b.link).toEqual({ type: 'tab', tab: 'u' })
  })

  it('leaves the original as it was', () => {
    expect(copied.tabs[0]).toBe(start.tabs[0])
  })
})
