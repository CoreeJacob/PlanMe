import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { ArrowItem, BoardDoc, Item, Shape } from '@shared/types'
import { addToCopy, groupsOf, makeGroup, placeCopy, relinkCopies, syncGroups, unlinkCopies, withGroupMates } from './groups'
import { copiesOf, itemsOf, moveItems, newArrow, newItem, removeItems, updateItems } from './items'

const note = (id: string, x: number, y: number): Shape => ({ ...newItem('note', id, { x, y, w: 100, h: 100 }), text: id }) as Shape
let n = 0
const newId = (): string => `id${++n}`

/** A board with a "Hero" group (a note, its sword, and an arrow between) on tab one, and a copy of it on tab two at 1000,0. */
function setUp() {
  const start: BoardDoc = {
    statuses: DEFAULT_STATUSES,
    tabs: [
      { id: 'one', name: 'Level 1', items: [note('hero', 0, 0), note('sword', 200, 0), newArrow('arr', { item: 'hero', x: 0, y: 0 }, { item: 'sword', x: 0, y: 0 }), note('other', 0, 500)] },
      { id: 'two', name: 'Level 2', items: [] }
    ]
  }
  const grouped = makeGroup(start, 'one', ['hero', 'sword'], 'Hero', newId)
  const group = groupsOf(grouped)[0]
  const placed = placeCopy(grouped, 'two', group.id, { x: 1000, y: 0 }, newId)
  return { doc: placed.doc, group, copyIds: placed.ids }
}

const byText = (doc: BoardDoc, tab: string, text: string): Item | undefined => itemsOf(doc, tab).find((i) => i.text === text)
/** Applies a change and keeps the copies in step, as the app does. */
const change = (doc: BoardDoc, edit: (d: BoardDoc) => BoardDoc): BoardDoc => syncGroups(doc, edit(doc), newId)

describe('linked groups', () => {
  it('are made from items and the arrows between them, starting at their top-left', () => {
    const { doc, group } = setUp()
    const parts = itemsOf(doc, 'one').filter((i) => i.group)
    expect(parts.map((i) => i.id)).toEqual(['hero', 'sword', 'arr'])
    expect(group).toMatchObject({ name: 'Hero', copies: [{ tab: 'one', x: 0, y: 0 }] })
  })

  it('place a copy on another tab, with its own ids and arrows joined within it', () => {
    const { doc } = setUp()
    const copy = itemsOf(doc, 'two')
    expect(copy.map((i) => i.text)).toEqual(['hero', 'sword', ''])
    expect(copy[0]).toMatchObject({ x: 1000, y: 0 })
    expect(copy[0].id).not.toBe('hero')
    const arrow = copy[2] as ArrowItem
    expect([arrow.from.item, arrow.to.item]).toEqual([copy[0].id, copy[1].id])
    expect(groupsOf(doc)[0].copies).toHaveLength(2)
  })

  it('pass a change to a part on to the same part in every copy', () => {
    const { doc } = setUp()
    const edited = change(doc, (d) => updateItems(d, 'one', ['sword'], (i) => ({ ...i, text: 'Big sword', color: 'pink' })))
    expect(byText(edited, 'two', 'Big sword')).toMatchObject({ color: 'pink', x: 1200, y: 0 })
  })

  it('moving a whole copy moves only that copy', () => {
    const { doc, group } = setUp()
    const ids = itemsOf(doc, 'one').filter((i) => i.group).map((i) => i.id)
    const movedDoc = change(doc, (d) => moveItems(d, 'one', ids, 50, 70))
    expect(byText(movedDoc, 'one', 'hero')).toMatchObject({ x: 50, y: 70 })
    expect(byText(movedDoc, 'two', 'hero')).toMatchObject({ x: 1000, y: 0 })
    expect(groupsOf(movedDoc)[0].copies.find((c) => c.tab === 'one')).toMatchObject({ x: 50, y: 70 })
    expect(groupsOf(movedDoc)[0].id).toBe(group.id)
  })

  it('moving one part within a copy moves it in every copy', () => {
    const { doc } = setUp()
    const movedDoc = change(doc, (d) => moveItems(d, 'one', ['sword'], 0, 150))
    expect(byText(movedDoc, 'two', 'sword')).toMatchObject({ x: 1200, y: 150 })
  })

  it('a part taken out of one copy goes from every copy; a whole copy deleted goes on its own', () => {
    const { doc, copyIds } = setUp()
    const fewer = change(doc, (d) => removeItems(d, 'one', ['sword', 'arr']))
    expect(itemsOf(fewer, 'two').map((i) => i.text)).toEqual(['hero'])
    const gone = change(doc, (d) => removeItems(d, 'two', copyIds))
    expect(itemsOf(gone, 'one').filter((i) => i.group)).toHaveLength(3)
    expect(groupsOf(gone)[0].copies).toHaveLength(1)
  })

  it('a part added to one copy is added to every copy', () => {
    const { doc } = setUp()
    const copy = groupsOf(doc)[0].copies[0].id
    const added = change(doc, (d) => addToCopy(d, 'one', copy, ['other']))
    expect(byText(added, 'two', 'other')).toMatchObject({ x: 1000, y: 500 })
  })

  it('select and move as one, except inside the copy being worked in', () => {
    const { doc } = setUp()
    const items = itemsOf(doc, 'one')
    const copy = groupsOf(doc)[0].copies[0].id
    expect(withGroupMates(['hero'], items, null).sort()).toEqual(['arr', 'hero', 'sword'])
    expect(withGroupMates(['hero'], items, copy)).toEqual(['hero'])
    expect(withGroupMates(['other'], items, null)).toEqual(['other'])
  })

  it('unlink: the parts become ordinary items, and a group with no copies left goes', () => {
    const { doc } = setUp()
    const [first, second] = groupsOf(doc)[0].copies
    const one = unlinkCopies(doc, new Set([second.id]))
    expect(itemsOf(one, 'two').every((i) => !i.group)).toBe(true)
    expect(groupsOf(one)[0].copies).toEqual([first])
    expect(groupsOf(unlinkCopies(one, new Set([first.id])))).toEqual([])
  })

  it('a whole copy pasted is a new linked copy; a part pasted on its own is an ordinary item', () => {
    const { doc } = setUp()
    const whole = copiesOf(
      itemsOf(doc, 'one').filter((i) => i.group),
      0,
      300,
      newId
    )
    const relinked = relinkCopies(doc, 'one', whole, newId)
    expect(relinked.items.every((i) => i.group && i.group.copy !== groupsOf(doc)[0].copies[0].id)).toBe(true)
    expect(groupsOf(relinked.doc)[0].copies).toHaveLength(3)
    expect(groupsOf(relinked.doc)[0].copies[2]).toMatchObject({ tab: 'one', x: 0, y: 300 })
    const part = relinkCopies(doc, 'one', copiesOf([itemsOf(doc, 'one')[0]], 0, 300, newId), newId)
    expect(part.items[0].group).toBeUndefined()
  })

  it('making a group from parts of another unlinks that copy first', () => {
    const { doc } = setUp()
    const regrouped = makeGroup(doc, 'two', [itemsOf(doc, 'two')[0].id], 'Just hero', newId)
    expect(groupsOf(regrouped).map((g) => [g.name, g.copies.length])).toEqual([
      ['Hero', 1],
      ['Just hero', 1]
    ])
    expect(itemsOf(regrouped, 'one').filter((i) => i.group)).toHaveLength(3)
  })
})
