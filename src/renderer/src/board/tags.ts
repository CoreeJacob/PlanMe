// Tags: labels for what area of the game something belongs to ("Art", "Combat"), per board.
// An item can have several. Statuses say how far along something is; tags say what it's part of.

import type { BoardDoc, Item, Tag } from '@shared/types'

export const NO_TAGS: Tag[] = []

/** The board's tags (none until it has some). */
export const tagsOf = (doc: BoardDoc): Tag[] => doc.tags ?? NO_TAGS

/** The colours new tags are given, in turn. */
const NEW_TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'red', 'yellow', 'grey']

/** A colour for a new tag: the first not used yet, or else the next in turn. */
export function nextTagColor(tags: readonly Tag[]): string {
  const used = new Set(tags.map((t) => t.color))
  return NEW_TAG_COLORS.find((c) => !used.has(c)) ?? NEW_TAG_COLORS[tags.length % NEW_TAG_COLORS.length]
}

/** An item's tags, as the board's tags (in the board's order). */
export function itemTags(item: Item, tags: readonly Tag[]): Tag[] {
  if (item.type === 'arrow' || !item.tags?.length) return NO_TAGS
  const mine = new Set(item.tags)
  return tags.filter((t) => mine.has(t.id))
}

/** Whether all, some or none of the items have a tag (arrows don't count: they can't have tags). */
export function tagState(items: readonly Item[], id: string): 'all' | 'some' | 'none' {
  const shapes = items.filter((i) => i.type !== 'arrow')
  const n = shapes.filter((i) => i.tags?.includes(id)).length
  return n === 0 ? 'none' : n === shapes.length ? 'all' : 'some'
}

/** An item with a tag added or taken away. */
export function withTag<T extends Item>(item: T, id: string, on: boolean): T {
  if (item.type === 'arrow') return item
  const has = !!item.tags?.includes(id)
  if (has === on) return item
  const tags = on ? [...(item.tags ?? []), id] : item.tags!.filter((t) => t !== id)
  if (tags.length) return { ...item, tags }
  const { tags: _none, ...rest } = item
  return rest as T
}

/** How many items (on every tab) have a tag. */
export const usesOfTag = (doc: BoardDoc, id: string): number =>
  doc.tabs.reduce((n, t) => n + t.items.filter((i) => i.type !== 'arrow' && i.tags?.includes(id)).length, 0)

/** The board with a new list of tags. Items lose tags no longer on the list. */
export function withTags(doc: BoardDoc, tags: Tag[]): BoardDoc {
  const kept = new Set(tags.map((t) => t.id))
  const tabs = doc.tabs.map((tab) => {
    let changed = false
    const items = tab.items.map((i) => {
      if (i.type === 'arrow' || !i.tags?.some((t) => !kept.has(t))) return i
      changed = true
      let next = i
      for (const t of i.tags) if (!kept.has(t)) next = withTag(next, t, false)
      return next
    })
    return changed ? { ...tab, items } : tab
  })
  return { ...doc, tabs, tags }
}

/** True if an item matches the Tasks panel's tag filter (a tag id), or there's no filter. */
export const hasTag = (item: Item, filter: string | null): boolean => !filter || (item.type !== 'arrow' && !!item.tags?.includes(filter))
