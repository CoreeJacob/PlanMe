// Finding words anywhere on the board: in notes, text, shapes, to-do titles and lines, section
// titles, picture names, arrow labels and tab names, on every tab.

import type { BoardDoc, Item } from '@shared/types'
import { plainText } from './richtext'

export interface SearchHit {
  tabId: string
  tabName: string
  /** The item found, or none when it's the tab's name that matched. */
  item?: Item
  /** The line the words were found in (the start cut off if they're far along it). */
  text: string
  /** Where the words are in `text`, as [start, end) pairs in order. */
  marks: Array<[number, number]>
}

/** The words searched for, in lower case. */
export const searchWords = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean)

/** An item's lines of words. */
function linesOf(item: Item): string[] {
  const lines = plainText(item.text).split('\n')
  if (item.type === 'todo') lines.push(...item.entries.map((e) => e.text))
  if (item.type === 'image') lines.push(item.name)
  return lines.map((l) => l.trim()).filter(Boolean)
}

/** Every place the words appear in a line, overlaps joined. */
function marksIn(line: string, words: string[]): Array<[number, number]> {
  const lower = line.toLowerCase()
  const found: Array<[number, number]> = []
  for (const word of words) {
    for (let k = lower.indexOf(word); k !== -1; k = lower.indexOf(word, k + word.length)) found.push([k, k + word.length])
  }
  found.sort((a, b) => a[0] - b[0])
  const marks: Array<[number, number]> = []
  for (const [start, end] of found) {
    const last = marks.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else marks.push([start, end])
  }
  return marks
}

/** How much of a line to keep before the first word found, when it's far along. */
const LEAD = 20

/**
 * If every word is somewhere in the lines, the line with the most of them, and where they are in
 * it. Otherwise null.
 */
function match(lines: string[], words: string[]): Pick<SearchHit, 'text' | 'marks'> | null {
  const all = lines.join('\n').toLowerCase()
  if (!lines.length || !words.every((w) => all.includes(w))) return null
  let best = lines[0]
  let most = -1
  for (const line of lines) {
    const lower = line.toLowerCase()
    const n = words.filter((w) => lower.includes(w)).length
    if (n > most) [best, most] = [line, n]
  }
  const marks = marksIn(best, words)
  const first = marks[0]?.[0] ?? 0
  if (first <= LEAD + 10) return { text: best, marks }
  // Far along a long line: start a little before the first word, so it shows.
  const cut = first - LEAD
  return { text: `…${best.slice(cut)}`, marks: marks.map(([a, b]) => [a - cut + 1, b - cut + 1]) }
}

/** Where an item is, for putting things in reading order. */
function placeOf(item: Item): { x: number; y: number } {
  return item.type === 'arrow' ? { x: (item.from.x + item.to.x) / 2, y: (item.from.y + item.to.y) / 2 } : item
}

/** Top to bottom, then left to right, like reading the board. */
export function inReadingOrder<T>(list: readonly T[], itemOf: (t: T) => Item): T[] {
  return [...list].sort((a, b) => {
    const p = placeOf(itemOf(a))
    const q = placeOf(itemOf(b))
    return p.y - q.y || p.x - q.x
  })
}

/** Everything matching every word searched for: tab names first, then items, tab by tab in reading order. */
export function searchBoard(doc: BoardDoc, query: string, limit = 100): SearchHit[] {
  const words = searchWords(query)
  if (!words.length) return []
  const hits: SearchHit[] = []
  for (const tab of doc.tabs) {
    const found = match([tab.name], words)
    if (found) hits.push({ tabId: tab.id, tabName: tab.name, ...found })
  }
  for (const tab of doc.tabs) {
    const found: SearchHit[] = []
    for (const item of tab.items) {
      const m = match(linesOf(item), words)
      if (m) found.push({ tabId: tab.id, tabName: tab.name, item, ...m })
    }
    hits.push(...inReadingOrder(found, (h) => h.item!))
    if (hits.length >= limit) break
  }
  return hits.slice(0, limit)
}
