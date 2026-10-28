import { describe, expect, it } from 'vitest'
import { DEFAULT_STATUSES } from '@shared/statuses'
import type { BoardDoc, Shape } from '@shared/types'
import { newArrow, newItem } from './items'
import { linkChoices, linkKey, linkName, linkTarget, linkTip, shortUrl, webAddress } from './links'

const note = (id: string, x: number, y: number, text: string): Shape => ({ ...newItem('note', id, { x, y, w: 100, h: 100 }), text }) as Shape

const doc: BoardDoc = {
  statuses: DEFAULT_STATUSES,
  tabs: [
    { id: 'one', name: 'Overview', items: [note('start', 0, 0, 'Start here'), newArrow('arrow', { item: null, x: 0, y: 0 }, { item: null, x: 9, y: 9 })] },
    { id: 'two', name: 'Level 1', items: [note('boss', 0, 200, 'Boss fight'), note('intro', 0, 0, 'Intro')] }
  ]
}

describe('where links go', () => {
  it('finds a tab, or an item on any tab', () => {
    expect(linkTarget(doc, { type: 'tab', tab: 'two' })).toMatchObject({ type: 'tab', tab: { name: 'Level 1' } })
    expect(linkTarget(doc, { type: 'item', item: 'boss' })).toMatchObject({ type: 'item', tab: { id: 'two' }, item: { id: 'boss' } })
  })

  it('is broken once what it went to is deleted', () => {
    expect(linkTarget(doc, { type: 'tab', tab: 'gone' })).toBeNull()
    expect(linkTarget(doc, { type: 'item', item: 'gone' })).toBeNull()
    // Arrows can't be linked to.
    expect(linkTarget(doc, { type: 'item', item: 'arrow' })).toBeNull()
  })

  it('says where it goes, in words', () => {
    expect(linkTip(linkTarget(doc, { type: 'tab', tab: 'two' }))).toBe('Go to the “Level 1” tab')
    expect(linkTip(linkTarget(doc, { type: 'item', item: 'boss' }))).toBe('Go to “Boss fight” on Level 1')
    expect(linkTip({ type: 'web', url: 'https://example.com/' })).toBe('Open example.com in your browser')
    expect(linkTip(null)).toMatch(/deleted/)
    expect(linkName(null)).toMatch(/deleted/)
  })

  it('tells links apart', () => {
    expect(linkKey({ type: 'tab', tab: 'a' })).toBe(linkKey({ type: 'tab', tab: 'a' }))
    expect(linkKey({ type: 'tab', tab: 'a' })).not.toBe(linkKey({ type: 'item', item: 'a' }))
  })
})

describe('web addresses', () => {
  it('takes http and https addresses, and adds https:// to bare ones', () => {
    expect(webAddress('https://example.com/page')).toBe('https://example.com/page')
    expect(webAddress('  http://example.com ')).toBe('http://example.com/')
    expect(webAddress('example.com')).toBe('https://example.com/')
    expect(webAddress('wiki.mygame.co.uk/bosses?x=1')).toBe('https://wiki.mygame.co.uk/bosses?x=1')
  })

  it('turns down anything else', () => {
    for (const text of ['', 'boss fight', 'boss', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com', 'Level.1']) {
      expect(webAddress(text), text).toBeNull()
    }
  })

  it('shortens them for reading', () => {
    expect(shortUrl('https://example.com/')).toBe('example.com')
    expect(shortUrl('http://example.com/a/b')).toBe('example.com/a/b')
  })
})

describe('the Link picker’s choices', () => {
  const keys = (query: string, except: string[] = ['start']): string[] => linkChoices(doc, query, except).map((c) => linkKey(c.link))

  it('with nothing typed: every tab, then every item (not arrows, not the item itself)', () => {
    expect(keys('')).toEqual(['tab:one', 'tab:two', 'item:intro', 'item:boss'])
  })

  it('narrows to what matches, tabs first', () => {
    expect(keys('level')).toEqual(['tab:two'])
    expect(keys('boss')).toEqual(['item:boss'])
    expect(keys('start')).toEqual([])
    expect(keys('start', [])).toEqual(['item:start'])
  })

  it('offers a web address when one is typed', () => {
    const [first] = linkChoices(doc, 'example.com/art', [])
    expect(first).toMatchObject({ kind: 'web', text: 'example.com/art', link: { type: 'web', url: 'https://example.com/art' } })
  })

  it('says which tab each item is on', () => {
    expect(linkChoices(doc, 'intro', []).map((c) => c.tabName)).toEqual(['Level 1'])
  })
})
