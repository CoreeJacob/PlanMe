import { describe, expect, it } from 'vitest'
import type { BoardDoc, ImageFile, ImageItem } from '@shared/types'
import { newImage, newItem } from './items'
import { remapDoc, repairMoves, tabsUsing, usedSources } from './images'
import { useBoard } from './store'

const picture = (id: string, src: string): ImageItem => newImage(id, { x: 0, y: 0, w: 10, h: 10 }, { src, name: src.split('/').pop()! })
const file = (src: string): ImageFile => ({ src, name: src.split('/').pop()!, folder: '', bytes: 1 })
const doc = (): BoardDoc => ({
  statuses: [],
  tabs: [
    { id: 'a', name: 'Overview', items: [picture('p1', 'images/map.png'), newItem('note', 'n', { x: 0, y: 0, w: 1, h: 1 })] },
    { id: 'b', name: 'Levels', items: [picture('p2', 'images/map.png'), picture('p3', 'images/hero.png')] },
    { id: 'c', name: 'Empty', items: [] }
  ]
})

describe('pictures and the board', () => {
  it('knows which files the board uses, and where', () => {
    expect([...usedSources(doc())].sort()).toEqual(['images/hero.png', 'images/map.png'])
    expect(tabsUsing(doc(), 'images/map.png').map((t) => t.name)).toEqual(['Overview', 'Levels'])
  })

  it('follows files that moved, leaving untouched tabs alone', () => {
    const before = doc()
    const after = remapDoc(before, { 'images/hero.png': 'images/Characters/hero.png' })
    expect((after.tabs[1].items[1] as ImageItem).src).toBe('images/Characters/hero.png')
    expect(after.tabs[0]).toBe(before.tabs[0])
    expect(remapDoc(before, {})).toBe(before)
  })

  it('finds pictures moved in Finder by name, but only when there’s exactly one match', () => {
    const used = ['images/map.png', 'images/hero.png', 'images/bat.png']
    const files = [file('images/Levels/map.png'), file('images/A/hero.png'), file('images/B/hero.png')]
    expect(repairMoves(used, files)).toEqual({ 'images/map.png': 'images/Levels/map.png' })
    expect(repairMoves(['images/Levels/map.png'], files)).toEqual({})
  })

  it('undo after a move brings back the picture at its new place', () => {
    const board = () => useBoard.getState()
    board().load({ name: 'B', path: '/b', doc: doc(), views: {} })
    board().commit({ ...board().doc, tabs: board().doc.tabs.map((t) => (t.id === 'a' ? { ...t, items: [] } : t)) })
    board().remapImages({ 'images/map.png': 'images/Levels/map.png' })
    board().undo()
    expect((board().doc.tabs[0].items[0] as ImageItem).src).toBe('images/Levels/map.png')
  })
})
