import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { ArrowItem, Item, SectionItem, Shape } from '@shared/types'
import { lookupIn, pinsOf } from './arrows'
import { newArrow, newItem } from './items'
import { within } from '@/lib/geometry'
import { contentsOf, drawingOrder, sectionTrail, sectionTree, withContents } from './sections'

const section = newItem('section', 's', { x: 0, y: 0, w: 600, h: 400 }) as SectionItem
const inside = newItem('note', 'in', { x: 50, y: 50, w: 200, h: 200 })
const across = newItem('note', 'across', { x: 500, y: 300, w: 200, h: 200 })
const outside = newItem('note', 'out', { x: 800, y: 0, w: 200, h: 200 })
const looseInside: ArrowItem = newArrow('arrowIn', { item: null, x: 300, y: 100 }, { item: null, x: 400, y: 200 })
const items: Item[] = [inside, section, across, outside, looseInside]

describe('sections', () => {
  it('holds what is entirely inside it, and nothing that pokes out', () => {
    expect(within(inside, section)).toBe(true)
    expect(within(across, section)).toBe(false)
    expect(contentsOf(section, items, lookupIn(items)).sort()).toEqual(['arrowIn', 'in'])
  })

  it('brings its contents along when it is picked', () => {
    expect(withContents(['s'], items, lookupIn(items)).sort()).toEqual(['arrowIn', 'in', 's'])
    expect(withContents(['out'], items, lookupIn(items))).toEqual(['out'])
  })

  it('is always drawn behind everything, whatever its place in the pile', () => {
    expect(drawingOrder(items).map((i) => i.id)).toEqual(['s', 'in', 'across', 'out', 'arrowIn'])
    const none = [inside, outside]
    expect(drawingOrder(none)).toBe(none)
  })
})

describe('sections inside sections', () => {
  const act = { ...newItem('section', 'act', { x: 0, y: 0, w: 1000, h: 800 }), text: 'Act 1' } as SectionItem
  const forest = { ...newItem('section', 'forest', { x: 100, y: 100, w: 500, h: 400 }), text: 'Forest' } as SectionItem
  const boss = { ...newItem('section', 'boss', { x: 150, y: 150, w: 200, h: 200 }), text: 'Boss room' } as SectionItem
  const town = { ...newItem('section', 'town', { x: 650, y: 100, w: 300, h: 300 }), text: 'Town' } as SectionItem
  const dragon = { ...newItem('note', 'dragon', { x: 200, y: 200, w: 100, h: 100 }), status: 'doing' } as Shape
  const tree = { ...newItem('note', 'tree', { x: 400, y: 400, w: 50, h: 50 }), status: 'done' } as Shape
  const shop = newItem('note', 'shop', { x: 700, y: 150, w: 100, h: 100 })
  // Listed in a muddled order on purpose.
  const nested: Item[] = [dragon, boss, town, act, tree, forest, shop]
  const lookup = lookupIn(nested)

  it('a section holds the sections inside it, and everything in those', () => {
    expect(contentsOf(act, nested, lookup).sort()).toEqual(['boss', 'dragon', 'forest', 'shop', 'town', 'tree'])
    expect(contentsOf(forest, nested, lookup).sort()).toEqual(['boss', 'dragon', 'tree'])
    expect(contentsOf(boss, nested, lookup)).toEqual(['dragon'])
    expect(withContents(['forest'], nested, lookup).sort()).toEqual(['boss', 'dragon', 'forest', 'tree'])
  })

  it('two sections the same size in the same place don’t each hold the other', () => {
    const twin = { ...forest, id: 'twin' }
    const both: Item[] = [forest, twin]
    expect(contentsOf(forest, both, lookupIn(both))).toEqual(['twin'])
    expect(contentsOf(twin, both, lookupIn(both))).toEqual([])
  })

  it('outer sections are drawn first, so the ones inside them are on top', () => {
    expect(drawingOrder(nested).map((i) => i.id)).toEqual(['act', 'town', 'forest', 'boss', 'dragon', 'tree', 'shop'])
  })

  it('make a tree, with how much each holds and how far its tasks are', () => {
    const outline = (nodes: ReturnType<typeof sectionTree>): unknown => nodes.map((n) => [n.section.text, n.things, `${n.done}/${n.tasks}`, outline(n.children)])
    expect(outline(sectionTree(nested, lookup, DEFAULT_STATUSES))).toEqual([['Act 1', 3, '1/2', [['Forest', 2, '1/2', [['Boss room', 1, '0/1', []]]], ['Town', 1, '0/0', []]]]])
  })

  it('say which sections a point is in, outermost first', () => {
    expect(sectionTrail(nested, { x: 250, y: 250 }).map((s) => s.text)).toEqual(['Act 1', 'Forest', 'Boss room'])
    expect(sectionTrail(nested, { x: 2000, y: 0 })).toEqual([])
  })
})

describe('dots on each shape', () => {
  const box = (shape: Parameters<typeof newItem>[3]) => newItem('box', 'b', { x: 0, y: 0, w: 200, h: 120 }, shape)
  it('ovals and diamonds only have the middle of each side (their corners are thin air)', () => {
    expect(pinsOf(box('oval'))).toHaveLength(4)
    expect(pinsOf(box('diamond'))).toEqual(expect.arrayContaining([{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }]))
  })
  it('a parallelogram’s dots sit on its sloping outline', () => {
    const pins = pinsOf(box('parallelogram'))
    expect(pins).toContainEqual({ x: 0.2, y: 0 })
    expect(pins).toContainEqual({ x: 0.1, y: 0.5 })
    expect(pins).not.toContainEqual({ x: 0, y: 0 })
  })
  it('a cylinder has no corner dots', () => {
    expect(pinsOf(box('cylinder')).some((p) => (p.x === 0 || p.x === 1) && (p.y === 0 || p.y === 1))).toBe(false)
  })
})
