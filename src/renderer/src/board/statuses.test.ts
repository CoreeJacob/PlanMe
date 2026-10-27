import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, TodoItem } from '@shared/types'
import { newItem, newLike } from './items'
import { autoKind, isFinished, progressOf, statusOf, usesOf, withStatuses } from './statuses'

const todo = (ticks: boolean[], extra: Partial<TodoItem> = {}): TodoItem => ({
  ...(newItem('todo', 't', { x: 0, y: 0, w: 260, h: 120 }) as TodoItem),
  entries: ticks.map((done, k) => ({ id: `e${k}`, text: `Line ${k}`, done })),
  ...extra
})
const note = (status?: string) => ({ ...newItem('note', 'n', { x: 0, y: 0, w: 200, h: 200 }), ...(status ? { status } : {}) })

describe('to-do lists', () => {
  it('count their ticks', () => {
    expect(progressOf(todo([true, false, true]))).toEqual({ done: 2, total: 3 })
  })
  it('work out their own status from their ticks', () => {
    expect(autoKind(todo([false, false]))).toBe('todo')
    expect(autoKind(todo([true, false]))).toBe('doing')
    expect(autoKind(todo([true, true]))).toBe('done')
    expect(autoKind(todo([]))).toBe('todo')
    expect(statusOf(todo([true, true]), DEFAULT_STATUSES)?.name).toBe('Done')
  })
  it('keep a status picked for them instead, once it’s picked', () => {
    expect(statusOf(todo([true, true], { auto: false, status: 'blocked' }), DEFAULT_STATUSES)?.name).toBe('Blocked')
    expect(statusOf(todo([true, true], { auto: false }), DEFAULT_STATUSES)).toBeUndefined()
  })
  it('a new one built from another starts empty, with no status', () => {
    const copy = newLike(todo([true], { auto: false, status: 'blocked', color: 'pink' }), 'c', { x: 0, y: 0, w: 260, h: 120 }) as TodoItem
    expect(copy.entries).toHaveLength(1)
    expect(copy.entries[0]).toMatchObject({ text: '', done: false })
    expect(copy).toMatchObject({ auto: true, color: 'pink', text: '' })
    expect('status' in copy).toBe(false)
  })
})

describe('statuses', () => {
  it('an item shows the status it has, if the board still has it', () => {
    expect(statusOf(note('doing'), DEFAULT_STATUSES)?.name).toBe('Doing')
    expect(statusOf(note('gone'), DEFAULT_STATUSES)).toBeUndefined()
    expect(statusOf(note(), DEFAULT_STATUSES)).toBeUndefined()
    expect(isFinished(note('done'), DEFAULT_STATUSES)).toBe(true)
  })

  it('deleting a status takes it off the items that had it, and counts them first', () => {
    const doc: BoardDoc = {
      statuses: DEFAULT_STATUSES,
      tabs: [{ id: 'a', name: 'A', items: [note('blocked'), { ...note('doing'), id: 'm' }, todo([], { auto: false, status: 'blocked' })] }]
    }
    expect(usesOf(doc, 'blocked')).toBe(2)
    const next = withStatuses(doc, DEFAULT_STATUSES.filter((s) => s.id !== 'blocked'))
    const [a, b, c] = next.tabs[0].items as [ReturnType<typeof note>, ReturnType<typeof note>, TodoItem]
    expect(a.status).toBeUndefined()
    expect(b.status).toBe('doing')
    expect(c).toMatchObject({ auto: true })
    expect(c.status).toBeUndefined()
    // Untouched tabs and items stay the same objects (that's how saving spots changes).
    expect(withStatuses(doc, DEFAULT_STATUSES).tabs[0]).toBe(doc.tabs[0])
  })
})
