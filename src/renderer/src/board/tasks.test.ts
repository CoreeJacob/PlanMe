import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, Item, Shape, TodoItem } from '@shared/types'
import { newArrow, newItem } from './items'
import { inFilter, labelOf, tasksOf } from './tasks'

const at = (id: string, x: number, y: number, extra: Partial<Shape> = {}): Shape =>
  ({ ...newItem('note', id, { x, y, w: 100, h: 100 }), text: id, ...extra }) as Shape

describe('the Tasks panel’s lists', () => {
  const list: TodoItem = { ...(newItem('todo', 'list', { x: 0, y: 500, w: 260, h: 120 }) as TodoItem), text: 'Level 1', entries: [
    { id: 'a', text: 'Map', done: true },
    { id: 'b', text: 'Boss', done: false }
  ] }
  const doc: BoardDoc = {
    statuses: DEFAULT_STATUSES,
    tabs: [
      {
        id: 'one',
        name: 'Overview',
        items: [
          at('lower', 0, 300, { status: 'doing' }),
          at('right', 400, 0, { status: 'blocked' }),
          at('left', 0, 0, { status: 'todo' }),
          at('plain', 900, 900),
          at('older', 0, 0, { status: 'done', statusAt: 1 }),
          list,
          newArrow('arrow', { item: 'left', x: 0, y: 0 }, { item: 'right', x: 0, y: 0 }) as Item
        ]
      },
      { id: 'two', name: 'Empty', items: [at('quiet', 0, 0)] },
      { id: 'three', name: 'Levels', items: [at('newer', 0, 0, { status: 'done', statusAt: 5 }), at('forest', 0, 0, { status: 'blocked' })] }
    ]
  }
  const lists = tasksOf(doc)

  it('groups unfinished ones by tab, in tab order, skipping tabs with none', () => {
    expect(lists.active.map((g) => g.tabName)).toEqual(['Overview', 'Levels'])
  })
  it('lists them top to bottom, then left to right, like reading the board', () => {
    expect(lists.active[0].tasks.map((t) => t.item.id)).toEqual(['left', 'right', 'lower', 'list'])
  })
  it('shows a to-do list as one task with its progress, and its own status', () => {
    const task = lists.active[0].tasks.find((t) => t.item.id === 'list')!
    expect(task).toMatchObject({ label: 'Level 1', progress: '1/2' })
    expect(task.status.name).toBe('Doing')
  })
  it('gathers finished ones together, newest first, with their tab', () => {
    expect(lists.done.map((t) => [t.item.id, t.tabName])).toEqual([
      ['newer', 'Levels'],
      ['older', 'Overview']
    ])
  })
  it('names untitled things by what they are', () => {
    expect(labelOf({ ...newItem('box', 'b', { x: 0, y: 0, w: 1, h: 1 }), text: '' })).toBe('Untitled shape')
    expect(labelOf({ ...newItem('note', 'n', { x: 0, y: 0, w: 1, h: 1 }), text: '<div><br></div><div>Second line</div>' })).toBe('Second line')
  })
  it('filters by status', () => {
    expect(inFilter(at('x', 0, 0, { status: 'blocked' }), 'blocked', DEFAULT_STATUSES)).toBe(true)
    expect(inFilter(at('x', 0, 0, { status: 'doing' }), 'blocked', DEFAULT_STATUSES)).toBe(false)
    expect(inFilter(at('x', 0, 0), null, DEFAULT_STATUSES)).toBe(true)
  })
})
