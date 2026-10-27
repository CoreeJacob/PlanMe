import { describe, expect, it } from 'vitest'
import type { ArrowItem, Item } from '@shared/types'
import { lookupIn, pinsOf } from './arrows'
import { newArrow, newItem } from './items'
import { within } from '@/lib/geometry'
import { contentsOf, drawingOrder, withContents } from './sections'

const section = newItem('section', 's', { x: 0, y: 0, w: 600, h: 400 })
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
