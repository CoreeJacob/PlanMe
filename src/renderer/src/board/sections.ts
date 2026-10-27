// Sections hold whatever sits fully inside them. Nothing is stored about it: what's inside is
// worked out from where things are, so dragging an item in or out is all it takes to join or leave.

import type { Item, Rect, SectionItem } from '@shared/types'
import { within } from '@/lib/geometry'
import { boxOf, type Lookup } from './arrows'

export const isSection = (item: Item): item is SectionItem => item.type === 'section'

/** The ids of the items (not other sections) entirely inside a section. */
export function contentsOf(section: Rect, items: readonly Item[], lookup: Lookup): string[] {
  return items.filter((i) => !isSection(i) && within(boxOf(i, lookup), section)).map((i) => i.id)
}

/** `ids`, plus everything inside any sections among them. */
export function withContents(ids: readonly string[], items: readonly Item[], lookup: Lookup): string[] {
  const out = new Set(ids)
  for (const item of items) {
    if (out.has(item.id) && isSection(item)) for (const id of contentsOf(item, items, lookup)) out.add(id)
  }
  return [...out]
}

/** Sections first (they're always behind everything), then everything else, each in their own order. */
export function drawingOrder(items: readonly Item[]): Item[] {
  const sections = items.filter(isSection)
  return sections.length ? [...sections, ...items.filter((i) => !isSection(i))] : (items as Item[])
}
