import { beforeEach, describe, expect, it } from 'vitest'
import type { BoardDoc, Item, Shape } from '@shared/types'
import {
  addItems,
  besideRect,
  copiesOf,
  itemsOf,
  moveItems,
  newItem,
  newItemAt,
  newLike,
  removeItems,
  resizeRect,
  restack,
  updateItems
} from './items'
import { boundsOf } from '@/lib/geometry'
import { cleanHtml, fromPlainText, isAllStyled, plainText, setWholeStyle } from './richtext'
import { NO_SELECTION, useBoard } from './store'

const note = (id: string, x = 0, y = 0, w = 100, h = 100): Shape => newItem('note', id, { x, y, w, h })
const docWith = (...items: Item[]): BoardDoc => ({ tabs: [{ id: 't', name: 'T', items }, { id: 'u', name: 'U', items: [] }] })
const ids = (doc: BoardDoc): string => itemsOf(doc, 't').map((i) => i.id).join()

describe('item changes', () => {
  it('adds, removes and moves items on one tab, leaving others alone', () => {
    const start = docWith(note('a'), note('b', 50, 60))
    expect(ids(addItems(start, 't', [note('c')]))).toBe('a,b,c')
    expect(ids(removeItems(start, 't', ['a']))).toBe('b')
    const moved = moveItems(start, 't', ['b'], 10, -5)
    expect(itemsOf(moved, 't')[1]).toMatchObject({ x: 60, y: 55 })
    expect(itemsOf(moved, 't')[0]).toBe(itemsOf(start, 't')[0])
    expect(moved.tabs[1]).toBe(start.tabs[1])
  })

  it('returns the same board when nothing changes', () => {
    const start = docWith(note('a'), note('b'))
    expect(removeItems(start, 't', ['zzz'])).toBe(start)
    expect(moveItems(start, 't', ['a'], 0, 0)).toBe(start)
    expect(updateItems(start, 't', ['a'], (i) => i)).toBe(start)
    expect(restack(start, 't', ['b'], 'front')).toBe(start)
    expect(restack(start, 't', ['a'], 'back')).toBe(start)
  })

  it('brings to front and sends to back, keeping their order', () => {
    const start = docWith(note('a'), note('b'), note('c'), note('d'))
    expect(ids(restack(start, 't', ['b', 'a'], 'front'))).toBe('c,d,a,b')
    expect(ids(restack(start, 't', ['d', 'c'], 'back'))).toBe('c,d,a,b')
  })

  it('copies with new ids, moved over', () => {
    let n = 0
    const copies = copiesOf([note('a', 10, 20)], 24, 24, () => `new${++n}`)
    expect(copies[0]).toMatchObject({ id: 'new1', x: 34, y: 44, type: 'note' })
  })

  it('makes new items with sensible defaults', () => {
    expect(newItemAt('note', 'n', 100, 100)).toMatchObject({ type: 'note', x: 0, y: 0, w: 200, h: 200, color: 'yellow', text: '' })
    expect(newItem('box', 'b', { x: 0, y: 0, w: 5, h: 5 })).toMatchObject({ w: 20, h: 20, fill: 'white', border: 'default', shape: 'rect' })
    expect(newItem('text', 't', { x: 0, y: 0, w: 300, h: 30 })).toMatchObject({ fontSize: 20, color: 'default' })
  })

  it('finds the rectangle around items', () => {
    expect(boundsOf([note('a', 10, 20, 30, 40), note('b', -5, 50, 10, 100)])).toEqual({ x: -5, y: 20, w: 45, h: 130 })
    expect(boundsOf([])).toBeNull()
  })
})

describe('resizing', () => {
  const r = { x: 100, y: 100, w: 200, h: 100 }
  it('moves only the sides of the handle', () => {
    expect(resizeRect(r, 'e', 50, 999)).toEqual({ x: 100, y: 100, w: 250, h: 100 })
    expect(resizeRect(r, 'nw', -10, -20)).toEqual({ x: 90, y: 80, w: 210, h: 120 })
  })
  it('never goes below the smallest size, keeping the opposite side put', () => {
    expect(resizeRect(r, 'w', 500, 0)).toEqual({ x: 280, y: 100, w: 20, h: 100 })
  })
  it('keeps the shape from a corner when asked', () => {
    const out = resizeRect(r, 'se', 200, 0, true)
    expect(out).toEqual({ x: 100, y: 100, w: 400, h: 200 })
    const nw = resizeRect(r, 'nw', -200, 0, true)
    expect(nw).toEqual({ x: -100, y: 0, w: 400, h: 200 })
    expect(resizeRect(r, 'se', -100, 0, true)).toEqual({ x: 100, y: 100, w: 100, h: 50 })
    expect(resizeRect(r, 'se', -1000, -1000, true).h).toBeGreaterThanOrEqual(20)
  })
})

describe('styled words', () => {
  it('keeps only bold, italic, underline and line breaks, without attributes', () => {
    expect(cleanHtml('<b style="x">a</b><strong>b</strong><em>c</em><span class="z">d</span><u>e</u>')).toBe('<b>a</b><b>b</b><i>c</i>d<u>e</u>')
    expect(cleanHtml('<div>one</div><p>two<br/></p>')).toBe('<div>one</div><div>two<br></div>')
  })
  it('drops scripts, styles, comments and anything risky', () => {
    expect(cleanHtml('a<script>alert(1)</script>b<style>p{}</style><!-- hi -->c<img src=x onerror=alert(1)>')).toBe('abc')
    expect(cleanHtml('<a href="javascript:alert(1)">link</a>')).toBe('link')
    expect(cleanHtml('1 < 2 & 3 > 2')).toBe('1 &lt; 2 &amp; 3 &gt; 2')
    expect(cleanHtml('fish &amp; chips')).toBe('fish &amp; chips')
  })
  it('gives the words alone, a line per line', () => {
    expect(plainText('<b>Boss</b> fight<div>phase&nbsp;2</div><div>a &amp; b</div>')).toBe('Boss fight\nphase 2\na & b')
    expect(plainText('<div>one</div><div><br></div><div>two<br></div>')).toBe('one\n\ntwo')
    expect(plainText('a<br>b')).toBe('a\nb')
    expect(plainText(fromPlainText('x\n\ny'))).toBe('x\n\ny')
  })
  it('turns plain text into item text', () => {
    expect(fromPlainText('a < b')).toBe('a &lt; b')
    expect(fromPlainText('one\r\n\ntwo')).toBe('<div>one</div><div><br></div><div>two</div>')
  })
  it('styles all the words at once, and knows when they all are', () => {
    expect(setWholeStyle('a <b>b</b> c', 'b', true)).toBe('<b>a b c</b>')
    expect(setWholeStyle('<b>a b c</b>', 'b', false)).toBe('a b c')
    expect(setWholeStyle('', 'b', true)).toBe('')
    expect(isAllStyled('<b>a b c</b>', 'b')).toBe(true)
    expect(isAllStyled('<b>a</b> b <b>c</b>', 'b')).toBe(false)
    expect(isAllStyled('<b>a <b>b</b> c</b>', 'b')).toBe(true)
    expect(isAllStyled('a', 'i')).toBe(false)
  })
})

describe('drags and typing as one undo step', () => {
  beforeEach(() => {
    useBoard.getState().load({ name: 'B', path: '/b', doc: docWith(note('a')), views: {} })
  })

  it('makes one step from many previews, and none if nothing changed', () => {
    const board = () => useBoard.getState()
    const start = board().doc
    board().beginGesture()
    board().preview(moveItems(start, 't', ['a'], 5, 0))
    board().preview(moveItems(start, 't', ['a'], 10, 0))
    board().endGesture()
    expect(board().history.past).toHaveLength(1)
    expect((itemsOf(board().doc, 't')[0] as Shape).x).toBe(10)
    board().undo()
    expect(board().doc).toBe(start)

    board().beginGesture()
    board().endGesture()
    expect(board().history.past).toHaveLength(0)
  })

  it('puts things back when a drag is cancelled', () => {
    const board = () => useBoard.getState()
    const start = board().doc
    board().preview(moveItems(start, 't', ['a'], 5, 0))
    board().cancelGesture()
    expect(board().doc).toBe(start)
    expect(board().history.past).toHaveLength(0)
  })

  it('tidying up layout is never an undo step', () => {
    const board = () => useBoard.getState()
    board().fixLayout(updateItems(board().doc, 't', ['a'], (i) => ({ ...i, h: 50 })))
    expect(board().history.past).toHaveLength(0)
  })

  it('drops the selection when switching tabs, and keeps only items that still exist after undo', () => {
    const board = () => useBoard.getState()
    board().select(['a'])
    board().commit(addItems(board().doc, 't', [note('b')]))
    board().select(['a', 'b'])
    board().undo()
    expect(board().selected).toEqual(['a'])
    board().setTab('u')
    expect(board().selected).toBe(NO_SELECTION)
  })
})

describe('building outwards from a dot', () => {
  const source = { x: 0, y: 0, w: 200, h: 100 }
  it('puts the new item just past the drop point, facing back', () => {
    expect(besideRect(source, { x: 400, y: 200 })).toEqual({ x: 400, y: 150, w: 200, h: 100 })
    expect(besideRect(source, { x: -300, y: 200 })).toEqual({ x: -500, y: 150, w: 200, h: 100 })
    expect(besideRect(source, { x: 300, y: 600 })).toEqual({ x: 200, y: 600, w: 200, h: 100 })
    expect(besideRect(source, { x: 300, y: -500 })).toEqual({ x: 200, y: -600, w: 200, h: 100 })
  })
  it('lines it up with the original when it’s nearly in line', () => {
    expect(besideRect(source, { x: 400, y: 80 })).toEqual({ x: 400, y: 0, w: 200, h: 100 })
    expect(besideRect(source, { x: 120, y: 400 })).toEqual({ x: 0, y: 400, w: 200, h: 100 })
  })
  it('copies the look but not the words', () => {
    const box = { ...newItem('box', 'b', source, 'diamond'), text: 'Has key?', fill: 'pink' }
    expect(newLike(box, 'n', { x: 5, y: 6, w: 200, h: 100 })).toEqual({ ...box, id: 'n', text: '', x: 5, y: 6 })
  })
})
