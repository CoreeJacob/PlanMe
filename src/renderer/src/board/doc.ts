// Changes to a board. Each returns a new BoardDoc and leaves the old one untouched, so undo
// can keep earlier versions cheaply (unchanged tabs are shared, not copied).

import type { BoardDoc, Tab } from '@shared/types'
import { copiesOf } from './items'

export const tabIndex = (doc: BoardDoc, id: string): number => doc.tabs.findIndex((t) => t.id === id)

/** "Tab 2", "Tab 3"… the first number not already used by a tab called that. */
export function nextTabName(doc: BoardDoc): string {
  const names = new Set(doc.tabs.map((t) => t.name))
  let n = doc.tabs.length + 1
  while (names.has(`Tab ${n}`)) n++
  return `Tab ${n}`
}

/** Adds an empty tab, by default at the end. */
export function addTab(doc: BoardDoc, tab: Pick<Tab, 'id' | 'name'>, index = doc.tabs.length): BoardDoc {
  const tabs = doc.tabs.slice()
  tabs.splice(index, 0, { ...tab, items: [] })
  return { ...doc, tabs }
}

export function renameTab(doc: BoardDoc, id: string, name: string): BoardDoc {
  const trimmed = name.trim()
  const tab = doc.tabs.find((t) => t.id === id)
  if (!tab || !trimmed || tab.name === trimmed) return doc
  return { ...doc, tabs: doc.tabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) }
}

/** "Level 1 copy", or "Level 1 copy 2"… if that's taken. */
export function copyName(doc: BoardDoc, name: string): string {
  const names = new Set(doc.tabs.map((t) => t.name))
  let copy = `${name} copy`
  for (let n = 2; names.has(copy); n++) copy = `${name} copy ${n}`
  return copy
}

/**
 * Adds a copy of a tab just after it, with everything on it: arrows stay joined, and links
 * between its items go to the copies. (Links to other tabs, or items on them, stay as they were.)
 */
export function duplicateTab(doc: BoardDoc, id: string, copy: Pick<Tab, 'id' | 'name'>, newId: () => string): BoardDoc {
  const tab = doc.tabs.find((t) => t.id === id)
  if (!tab) return doc
  const ids = new Map(tab.items.map((i) => [i.id, newId()]))
  const items = copiesOf(tab.items, 0, 0, newId, ids).map((i) =>
    i.type !== 'arrow' && i.link?.type === 'item' && ids.has(i.link.item) ? { ...i, link: { type: 'item' as const, item: ids.get(i.link.item)! } } : i
  )
  const tabs = doc.tabs.slice()
  tabs.splice(tabIndex(doc, id) + 1, 0, { ...copy, items })
  return { ...doc, tabs }
}

/** Removes a tab. The last tab can't be removed (a board always has one). */
export function removeTab(doc: BoardDoc, id: string): BoardDoc {
  if (doc.tabs.length <= 1 || tabIndex(doc, id) < 0) return doc
  return { ...doc, tabs: doc.tabs.filter((t) => t.id !== id) }
}

/** Moves a tab so it ends up at `index` in the new order. */
export function moveTab(doc: BoardDoc, id: string, index: number): BoardDoc {
  const from = tabIndex(doc, id)
  const to = Math.max(0, Math.min(doc.tabs.length - 1, index))
  if (from < 0 || from === to) return doc
  const tabs = doc.tabs.slice()
  const [tab] = tabs.splice(from, 1)
  tabs.splice(to, 0, tab)
  return { ...doc, tabs }
}

/** The tab to show after `id` is removed: the one to its right, or else its left. */
export function neighbourTab(doc: BoardDoc, id: string): string {
  const i = tabIndex(doc, id)
  return (doc.tabs[i + 1] ?? doc.tabs[i - 1] ?? doc.tabs[0]).id
}

/** The names tabs are given automatically: the first tab's, and "Tab 2", "Tab 3"… */
const GIVEN_NAME = /^(Overview|Tab \d+)$/

/** True for a tab that's still as it was made: nothing on it, and not renamed. */
export const isUntouched = (tab: Tab): boolean => tab.items.length === 0 && GIVEN_NAME.test(tab.name)
