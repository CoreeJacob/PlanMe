// Pictures and the board: which files the board uses, following files that moved, and finding
// ones moved behind the app's back (in Finder).

import type { BoardDoc, ImageFile, ImageMoves, Item, Tab } from '@shared/types'

/** Every picture file in the images folder the board shows, on any tab (not its copies of sprites). */
export function usedSources(doc: BoardDoc): Set<string> {
  const used = new Set<string>()
  for (const tab of doc.tabs) for (const i of tab.items) if (i.type === 'image' && !i.sprite) used.add(i.src)
  return used
}

/** Which tabs show a picture file. */
export function tabsUsing(doc: BoardDoc, src: string): Tab[] {
  return doc.tabs.filter((t) => t.items.some((i) => i.type === 'image' && i.src === src))
}

/** The board with pictures pointing at where their files moved to. Untouched tabs stay the same objects. */
export function remapDoc(doc: BoardDoc, moves: ImageMoves): BoardDoc {
  let changed = false
  const tabs = doc.tabs.map((t) => {
    let tabChanged = false
    const items = t.items.map((i): Item => {
      if (i.type !== 'image' || !moves[i.src]) return i
      tabChanged = true
      const src = moves[i.src]
      return { ...i, src, name: src.split('/').pop() ?? i.name }
    })
    if (!tabChanged) return t
    changed = true
    return { ...t, items }
  })
  return changed ? { ...doc, tabs } : doc
}

/**
 * Pictures the board shows whose files aren't where it expects, matched to a file of the same name
 * somewhere else in the images folder, when there's exactly one (so a guess is never made).
 */
export function repairMoves(used: Iterable<string>, files: readonly ImageFile[]): ImageMoves {
  const present = new Set(files.map((f) => f.src))
  const moves: ImageMoves = {}
  for (const src of used) {
    if (present.has(src)) continue
    const name = src.split('/').pop()
    const matches = files.filter((f) => f.name === name)
    if (matches.length === 1) moves[src] = matches[0].src
  }
  return moves
}
