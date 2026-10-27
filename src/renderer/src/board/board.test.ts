import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, FORMAT, type BoardDoc } from '@shared/types'
import { changes } from './changes'
import { addTab, isUntouched, moveTab, neighbourTab, nextTabName, removeTab, renameTab } from './doc'
import { EMPTY_HISTORY, LIMIT, record, redo, undo } from './history'

const doc = (...names: string[]): BoardDoc => ({ tabs: names.map((name) => ({ id: name.toLowerCase(), name, items: [] })), statuses: [] })
const names = (d: BoardDoc): string => d.tabs.map((t) => t.name).join(',')

describe('tab changes', () => {
  it('adds, renames, moves and removes tabs without touching the original', () => {
    const start = doc('A', 'B', 'C')
    expect(names(addTab(start, { id: 'x', name: 'X' }, 1))).toBe('A,X,B,C')
    expect(names(addTab(start, { id: 'x', name: 'X' }))).toBe('A,B,C,X')
    expect(names(renameTab(start, 'b', '  Bee '))).toBe('A,Bee,C')
    expect(names(moveTab(start, 'a', 2))).toBe('B,C,A')
    expect(names(moveTab(start, 'c', 0))).toBe('C,A,B')
    expect(names(removeTab(start, 'b'))).toBe('A,C')
    expect(names(start)).toBe('A,B,C')
  })

  it('returns the same board when nothing changes, so no undo step is made', () => {
    const start = doc('A', 'B')
    expect(renameTab(start, 'a', 'A')).toBe(start)
    expect(renameTab(start, 'a', '   ')).toBe(start)
    expect(moveTab(start, 'a', 0)).toBe(start)
    expect(removeTab(doc('Only'), 'only').tabs).toHaveLength(1)
  })

  it('keeps unchanged tabs as the same objects (that is how saving spots changes)', () => {
    const start = doc('A', 'B')
    const renamed = renameTab(start, 'a', 'Z')
    expect(renamed.tabs[1]).toBe(start.tabs[1])
  })

  it('names new tabs with the next free number', () => {
    expect(nextTabName(doc('Overview'))).toBe('Tab 2')
    expect(nextTabName(doc('Overview', 'Tab 3'))).toBe('Tab 4')
  })

  it('knows a tab that is still as it was made (so closing it needn’t ask)', () => {
    expect(isUntouched({ id: 'a', name: 'Overview', items: [] })).toBe(true)
    expect(isUntouched({ id: 'a', name: 'Tab 12', items: [] })).toBe(true)
    expect(isUntouched({ id: 'a', name: 'Levels', items: [] })).toBe(false)
    expect(isUntouched({ id: 'a', name: 'Tab 2', items: [{ id: 'n', type: 'note', x: 0, y: 0, w: 1, h: 1, text: '', color: 'yellow' }] })).toBe(false)
  })

  it('shows the neighbour of a removed tab', () => {
    const start = doc('A', 'B', 'C')
    expect(neighbourTab(start, 'b')).toBe('c')
    expect(neighbourTab(start, 'c')).toBe('b')
  })
})

describe('undo history', () => {
  it('steps back and forward, and a new change drops what could be redone', () => {
    const a = { doc: doc('A'), tabId: 'a' }
    const b = { doc: doc('A', 'B'), tabId: 'b' }
    const c = { doc: doc('A', 'B', 'C'), tabId: 'c' }
    let h = record(record(EMPTY_HISTORY, a), b)

    const back = undo(h, c)!
    expect(back.step).toBe(b)
    h = back.history
    const forward = redo(h, back.step)!
    expect(forward.step).toBe(c)

    h = record(undo(h, b)!.history, b)
    expect(h.future).toEqual([])
    expect(redo(h, c)).toBeNull()
    expect(undo(EMPTY_HISTORY, a)).toBeNull()
  })

  it('keeps at most LIMIT steps', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < LIMIT + 10; i++) h = record(h, { doc: doc(`T${i}`), tabId: '' })
    expect(h.past).toHaveLength(LIMIT)
    expect(h.past[0].doc.tabs[0].name).toBe('T10')
  })
})

describe('what to save', () => {
  it('saves nothing when nothing changed', () => {
    const d = doc('A')
    expect(changes({ doc: d, views: {} }, { doc: d, views: {} })).toBeNull()
  })

  it('writes the tab list when tabs are renamed, and only the changed tab file', () => {
    const before = doc('A', 'B')
    const after = renameTab(before, 'a', 'Z')
    const request = changes({ doc: before, views: {} }, { doc: after, views: {} })!
    expect(request.board).toEqual({ format: FORMAT, tabs: [{ id: 'a', name: 'Z' }, { id: 'b', name: 'B' }], statuses: [] })
    expect(request.tabs.map((t) => t.id)).toEqual(['a'])
    expect(request.removed).toEqual([])
  })

  it('writes board.json when the statuses change', () => {
    const before = doc('A')
    const statuses = [{ id: 's', name: 'Waiting', color: 'orange', kind: 'other' as const }]
    const request = changes({ doc: before, views: {} }, { doc: { ...before, statuses }, views: {} })!
    expect(request.board?.statuses).toBe(statuses)
    expect(request.tabs).toEqual([])
  })

  it('writes a tab file (not the tab list) when only the view moved', () => {
    const d = doc('A', 'B')
    const view = { x: 5, y: 6, zoom: 2 }
    const request = changes({ doc: d, views: {} }, { doc: d, views: { b: view } })!
    expect(request.board).toBeUndefined()
    expect(request.tabs).toEqual([{ format: FORMAT, id: 'b', view, items: [] }])
  })

  it('removes deleted tabs and writes new ones with the starting view', () => {
    const before = doc('A', 'B')
    const after = addTab(removeTab(before, 'b'), { id: 'n', name: 'New' })
    const request = changes({ doc: before, views: {} }, { doc: after, views: {} })!
    expect(request.removed).toEqual(['b'])
    expect(request.tabs).toEqual([{ format: FORMAT, id: 'n', view: DEFAULT_VIEW, items: [] }])
  })
})
