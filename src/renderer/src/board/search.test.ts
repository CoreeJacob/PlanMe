import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, ImageItem, Item, Shape, TodoItem } from '@shared/types'
import { newArrow, newItem } from './items'
import { searchBoard, searchWords } from './search'

const note = (id: string, x: number, y: number, text: string): Shape => ({ ...newItem('note', id, { x, y, w: 100, h: 100 }), text }) as Shape

const list: TodoItem = {
  ...(newItem('todo', 'list', { x: 0, y: 0, w: 260, h: 120 }) as TodoItem),
  text: 'Level jobs',
  entries: [
    { id: 'a', text: 'Draw the map', done: false },
    { id: 'b', text: 'Boss music', done: true }
  ]
}
const picture: ImageItem = { ...(newItem('note', 'pic', { x: 0, y: 900, w: 10, h: 10 }) as Shape), type: 'image', src: 'images/bat.png', name: 'bat.png' } as ImageItem
const arrow = { ...newArrow('arrow', { item: null, x: 0, y: 50 }, { item: null, x: 100, y: 50 }), text: 'leads to the <b>boss</b>' } as Item

const doc: BoardDoc = {
  statuses: DEFAULT_STATUSES,
  tabs: [
    { id: 'one', name: 'Overview', items: [note('lower', 0, 300, 'The boss fight'), note('upper', 500, 0, 'Boss<div>has two phases</div>'), arrow] },
    { id: 'two', name: 'Boss rooms', items: [list, picture, note('long', 0, 500, 'A very long line of words that goes on and on before it mentions the dragon')] }
  ]
}
const found = (query: string): string[] => searchBoard(doc, query).map((h) => h.item?.id ?? `tab:${h.tabName}`)

describe('searching the board', () => {
  it('splits what was typed into lower-case words', () => {
    expect(searchWords('  Boss  FIGHT ')).toEqual(['boss', 'fight'])
    expect(searchBoard(doc, '   ')).toEqual([])
  })

  it('finds tab names first, then items tab by tab, top to bottom', () => {
    expect(found('boss')).toEqual(['tab:Boss rooms', 'upper', 'arrow', 'lower', 'list'])
  })

  it('ignores case, and needs every word (anywhere in the item)', () => {
    expect(found('BOSS phases')).toEqual(['upper'])
    expect(found('boss dragon')).toEqual([])
  })

  it('looks in to-do lines, picture names and arrow labels', () => {
    expect(found('map')).toEqual(['list'])
    expect(found('bat')).toEqual(['pic'])
    expect(found('leads')).toEqual(['arrow'])
  })

  it('shows the line with the most of the words, and marks where they are', () => {
    const [hit] = searchBoard(doc, 'two phases')
    expect(hit.text).toBe('has two phases')
    expect(hit.marks).toEqual([
      [4, 7],
      [8, 14]
    ])
    const [line] = searchBoard(doc, 'music')
    expect(line.text).toBe('Boss music')
  })

  it('joins marks that overlap', () => {
    const [hit] = searchBoard(doc, 'boss bos')
    expect(hit.marks).toEqual([[0, 4]])
  })

  it('cuts the start off a long line so the words found show', () => {
    const [hit] = searchBoard(doc, 'dragon')
    expect(hit.text.startsWith('…')).toBe(true)
    const [a, b] = hit.marks[0]
    expect(hit.text.slice(a, b)).toBe('dragon')
    expect(a).toBeLessThan(30)
  })

  it('stops at the limit', () => {
    expect(searchBoard(doc, 'boss', 2)).toHaveLength(2)
  })
})
