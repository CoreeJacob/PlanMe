import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import { DEFAULT_VIEW, type BoardDoc, type Shape, type Tag } from '@shared/types'
import { changes } from './changes'
import { newArrow, newItem } from './items'
import { cleanHtml, plainText } from './richtext'
import { searchBoard } from './search'
import { hasTag, itemTags, nextTagColor, tagState, usesOfTag, withTag, withTags } from './tags'

const note = (id: string, extra: Partial<Shape> = {}): Shape => ({ ...newItem('note', id, { x: 0, y: 0, w: 100, h: 100 }), text: id, ...extra }) as Shape
const art: Tag = { id: 'art', name: 'Art', color: 'purple' }
const audio: Tag = { id: 'audio', name: 'Audio', color: 'blue' }

describe('tags', () => {
  it('go on and off items, leaving no empty list behind', () => {
    const a = withTag(note('a'), 'art', true)
    expect(a.tags).toEqual(['art'])
    expect(withTag(a, 'art', true)).toBe(a)
    expect(withTag(a, 'art', false)).not.toHaveProperty('tags')
    const arrow = newArrow('x', { item: null, x: 0, y: 0 }, { item: null, x: 1, y: 1 })
    expect(withTag(arrow, 'art', true)).toBe(arrow)
  })

  it('say whether all, some or none of a selection have one', () => {
    const items = [note('a', { tags: ['art'] }), note('b')]
    expect(tagState(items, 'art')).toBe('some')
    expect(tagState(items.slice(0, 1), 'art')).toBe('all')
    expect(tagState(items, 'audio')).toBe('none')
  })

  it('show in the board’s order, and filter', () => {
    const a = note('a', { tags: ['audio', 'art', 'gone'] })
    expect(itemTags(a, [art, audio]).map((t) => t.name)).toEqual(['Art', 'Audio'])
    expect(hasTag(a, 'art')).toBe(true)
    expect(hasTag(note('b'), 'art')).toBe(false)
    expect(hasTag(note('b'), null)).toBe(true)
  })

  it('come off items when deleted from the board, and are counted', () => {
    const doc: BoardDoc = { statuses: DEFAULT_STATUSES, tags: [art, audio], tabs: [{ id: 't', name: 'T', items: [note('a', { tags: ['art', 'audio'] }), note('b')] }] }
    expect(usesOfTag(doc, 'art')).toBe(1)
    const after = withTags(doc, [audio])
    expect(after.tabs[0].items[0]).toMatchObject({ tags: ['audio'] })
    expect(after.tabs[0].items[1]).toBe(doc.tabs[0].items[1])
    expect(after.tags).toEqual([audio])
  })

  it('get a colour not used yet', () => {
    expect(nextTagColor([])).toBe('blue')
    expect(nextTagColor([audio])).toBe('green')
  })

  it('are saved in board.json', () => {
    const before: BoardDoc = { statuses: DEFAULT_STATUSES, tabs: [{ id: 't', name: 'T', items: [] }] }
    const after = { ...before, tags: [art] }
    const request = changes({ doc: before, views: { t: DEFAULT_VIEW } }, { doc: after, views: { t: DEFAULT_VIEW } })
    expect(request?.board?.tags).toEqual([art])
  })
})

describe('details', () => {
  it('keep bullet lists (only details do)', () => {
    expect(cleanHtml('<ul><li class="x">One</li><li>Two</li></ul>', { lists: true })).toBe('<ul><li>One</li><li>Two</li></ul>')
    expect(cleanHtml('<ul><li>One</li></ul>')).toBe('One')
    expect(plainText('<div>Intro</div><ul><li>One</li><li>Two</li></ul>').split('\n').filter(Boolean)).toEqual(['Intro', 'One', 'Two'])
  })

  it('and tags are found by search', () => {
    const doc: BoardDoc = {
      statuses: DEFAULT_STATUSES,
      tags: [art],
      tabs: [{ id: 't', name: 'T', items: [note('boss', { details: '<div>Has <b>three</b> phases</div>' }), note('hero', { tags: ['art'] })] }]
    }
    expect(searchBoard(doc, 'phases').map((h) => [h.item?.id, h.text])).toEqual([['boss', 'Has three phases']])
    expect(searchBoard(doc, 'art').map((h) => [h.item?.id, h.text])).toEqual([['hero', '#Art']])
  })
})
