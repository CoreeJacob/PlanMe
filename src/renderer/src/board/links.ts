// Links from items: to a tab, to an item on any tab, or to a web page. A link to something that's
// since been deleted stays, shown as broken, until it's changed or removed.

import type { BoardDoc, Link, Shape, ShapeType, Tab } from '@shared/types'
import { inReadingOrder, searchBoard, searchWords } from './search'
import { labelOf } from './tasks'

/** Where a link goes, as the board is now. */
export type LinkTarget = { type: 'tab'; tab: Tab } | { type: 'item'; tab: Tab; item: Shape } | { type: 'web'; url: string }

/** Where a link goes, or null if that's been deleted. */
export function linkTarget(doc: BoardDoc, link: Link): LinkTarget | null {
  if (link.type === 'web') return link
  if (link.type === 'tab') {
    const tab = doc.tabs.find((t) => t.id === link.tab)
    return tab ? { type: 'tab', tab } : null
  }
  for (const tab of doc.tabs) {
    const item = tab.items.find((i) => i.id === link.item)
    if (item && item.type !== 'arrow') return { type: 'item', tab, item }
  }
  return null
}

/** A web address without the parts nobody needs to read ("example.com/page"). */
export const shortUrl = (url: string): string => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** Where a link goes, in words. */
export function linkName(target: LinkTarget | null): string {
  if (!target) return 'something that’s been deleted'
  if (target.type === 'tab') return `the “${target.tab.name}” tab`
  if (target.type === 'item') return `“${labelOf(target.item)}” on ${target.tab.name}`
  return shortUrl(target.url)
}

/** What following a link does, in words (for its badge's hover text). */
export function linkTip(target: LinkTarget | null): string {
  if (!target) return 'Linked to something that’s been deleted — click to choose another'
  return target.type === 'web' ? `Open ${linkName(target)} in your browser` : `Go to ${linkName(target)}`
}

/**
 * Typed words as a web address, or null if they don't look like one. "example.com/page" gets
 * https:// in front; only http and https addresses count.
 */
export function webAddress(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  const full = /^https?:\/\//i.test(t) ? t : /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(t) ? `https://${t}` : null
  if (!full) return null
  try {
    const url = new URL(full)
    return url.hostname ? url.toString() : null
  } catch {
    return null
  }
}

/** Something a link could go to, as the Link picker lists it. */
export interface LinkChoice {
  link: Link
  kind: 'web' | 'tab' | ShapeType
  text: string
  /** Where the words searched for are in `text`. */
  marks: Array<[number, number]>
  /** The tab an item is on. */
  tabName?: string
}

/**
 * What items (`except`) could link to, matching the words typed: a web address (if that's what
 * was typed), then tabs, then items on every tab. With nothing typed, every tab and item.
 */
export function linkChoices(doc: BoardDoc, query: string, except: readonly string[], limit = 100): LinkChoice[] {
  const choices: LinkChoice[] = []
  const url = webAddress(query)
  if (url) choices.push({ link: { type: 'web', url }, kind: 'web', text: shortUrl(url), marks: [] })
  if (!searchWords(query).length) {
    for (const tab of doc.tabs) choices.push({ link: { type: 'tab', tab: tab.id }, kind: 'tab', text: tab.name, marks: [] })
    for (const tab of doc.tabs) {
      const shapes = tab.items.filter((i): i is Shape => i.type !== 'arrow' && !except.includes(i.id))
      for (const item of inReadingOrder(shapes, (i) => i)) {
        choices.push({ link: { type: 'item', item: item.id }, kind: item.type, text: labelOf(item), marks: [], tabName: tab.name })
      }
    }
  } else {
    for (const hit of searchBoard(doc, query, limit)) {
      const { item, text, marks, tabName } = hit
      if (!item) choices.push({ link: { type: 'tab', tab: hit.tabId }, kind: 'tab', text, marks })
      else if (item.type !== 'arrow' && !except.includes(item.id)) choices.push({ link: { type: 'item', item: item.id }, kind: item.type, text, marks, tabName })
    }
  }
  return choices.slice(0, limit)
}

/** A link as one string: the same for links going to the same place. */
export const linkKey = (link: Link): string => (link.type === 'web' ? `web:${link.url}` : link.type === 'tab' ? `tab:${link.tab}` : `item:${link.item}`)
