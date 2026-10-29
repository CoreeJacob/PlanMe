import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, Shape, Tab } from '@shared/types'
import { newItem } from './items'
import { mergeOutside } from './merge'

const note = (id: string, text = id): Shape => ({ ...newItem('note', id, { x: 0, y: 0, w: 100, h: 100 }), text }) as Shape
const tab = (id: string, name: string, ...items: Shape[]): Tab => ({ id, name, items })
const board = (...tabs: Tab[]): BoardDoc => ({ statuses: DEFAULT_STATUSES, tabs })
const texts = (d: BoardDoc, k = 0): string => d.tabs[k].items.map((i) => i.text).join()

describe('bringing in changes made outside PlanMe', () => {
  const base = board(tab('t', 'Level 1', note('a'), note('b'), note('c')))

  it('takes what changed outside and keeps what changed in the app', () => {
    // In the app: b edited, d added. Outside: a edited, c deleted, e added.
    const mine = board(tab('t', 'Level 1', note('a'), note('b', 'b mine'), note('c'), note('d')))
    const theirs = board(tab('t', 'Level 1', note('a', 'a theirs'), note('b'), note('e')))
    const merged = mergeOutside(base, mine, theirs)!
    expect(texts(merged.doc)).toBe('a theirs,b mine,e,d')
    expect(merged.tabs.get('t')).toEqual({ changed: ['a', 'e'], deleted: 1 })
  })

  it('lets the outside change win when both changed the same item', () => {
    const mine = board(tab('t', 'Level 1', note('a', 'a mine'), note('b'), note('c')))
    const theirs = board(tab('t', 'Level 1', note('a', 'a theirs'), note('b'), note('c')))
    expect(texts(mergeOutside(base, mine, theirs)!.doc)).toBe('a theirs,b,c')
  })

  it('keeps an item deleted in the app deleted, unless it was changed outside', () => {
    const mine = board(tab('t', 'Level 1', note('a'), note('c')))
    expect(texts(mergeOutside(base, mine, board(tab('t', 'Level 1', note('a'), note('b'), note('c', 'c theirs'))))!.doc)).toBe('a,c theirs')
    expect(texts(mergeOutside(base, mine, board(tab('t', 'Level 1', note('a'), note('b', 'b theirs'), note('c'))))!.doc)).toBe('a,b theirs,c')
  })

  it('is nothing at all when the files only hold what PlanMe saved', () => {
    const mine = board(tab('t', 'Level 1', note('a'), note('b', 'b mine'), note('c')))
    expect(mergeOutside(base, mine, base)).toBeNull()
    expect(mergeOutside(base, base, JSON.parse(JSON.stringify(base)))).toBeNull()
  })

  it('keeps unchanged tabs as the same objects, so only what changed is saved again', () => {
    const two = board(tab('t', 'Level 1', note('a')), tab('u', 'Level 2', note('x')))
    const theirs = board(tab('t', 'Level 1', note('a', 'a theirs')), tab('u', 'Level 2', note('x')))
    const merged = mergeOutside(two, two, theirs)!
    expect(merged.doc.tabs[1]).toBe(two.tabs[1])
  })

  it('brings in new, removed, renamed and reordered tabs, and keeps tabs added in the app', () => {
    const two = board(tab('t', 'Level 1', note('a')), tab('u', 'Level 2'))
    const mine = board(tab('t', 'Level 1', note('a')), tab('mine', 'Mine'), tab('u', 'Level 2'))
    const theirs = board(tab('new', 'Bosses', note('boss')), tab('t', 'Level One', note('a')))
    const merged = mergeOutside(two, mine, theirs)!
    expect(merged.doc.tabs.map((t) => t.name)).toEqual(['Bosses', 'Mine', 'Level One'])
    expect(merged.addedTabs).toEqual(['Bosses'])
    expect(merged.removedTabs).toEqual(['Level 2'])
    expect(merged.tabs.get('new')?.changed).toEqual(['boss'])
  })

  it('notices a tab renamed outside', () => {
    const merged = mergeOutside(base, base, board(tab('t', 'Forest', note('a'), note('b'), note('c'))))!
    expect(merged.doc.tabs[0].name).toBe('Forest')
    expect(merged.tabList).toBe(true)
  })

  it('brings in statuses changed outside', () => {
    const statuses = [...DEFAULT_STATUSES, { id: 'review', name: 'Review', color: 'purple', kind: 'other' as const }]
    const merged = mergeOutside(base, base, { ...base, statuses })!
    expect(merged.doc.statuses).toEqual(statuses)
    expect(merged.statuses).toBe(true)
  })
})
