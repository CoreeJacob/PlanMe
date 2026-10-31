// Sections hold whatever sits fully inside them, other sections included (Act 1 › Forest › Boss
// room). Nothing is stored about it: what's inside is worked out from where things are, so
// dragging an item (or a section) in or out is all it takes to join or leave.

import type { Item, Rect, SectionItem, Status } from '@shared/types'
import { within } from '@/lib/geometry'
import { boxOf, type Lookup } from './arrows'
import { statusOf } from './statuses'

export const isSection = (item: Item): item is SectionItem => item.type === 'section'

const area = (r: Rect): number => r.w * r.h

/**
 * True if section `a` sits inside section `b`: wholly within it, and smaller (or the same, and
 * listed after it, so two sections the same size and place never each hold the other).
 */
function sectionWithin(a: SectionItem, b: SectionItem, items: readonly Item[]): boolean {
  if (a === b || !within(a, b)) return false
  return area(a) < area(b) || (area(a) === area(b) && items.indexOf(a) > items.indexOf(b))
}

/** The ids of everything entirely inside a section: items, and sections inside it (with all they hold). */
export function contentsOf(section: SectionItem, items: readonly Item[], lookup: Lookup): string[] {
  return items.filter((i) => (isSection(i) ? sectionWithin(i, section, items) : within(boxOf(i, lookup), section))).map((i) => i.id)
}

/** `ids`, plus everything inside any sections among them. */
export function withContents(ids: readonly string[], items: readonly Item[], lookup: Lookup): string[] {
  const out = new Set(ids)
  for (const item of items) {
    if (out.has(item.id) && isSection(item)) for (const id of contentsOf(item, items, lookup)) out.add(id)
  }
  return [...out]
}

/**
 * What moves when `ids` are moved: the unlocked ones, plus whatever's inside unlocked sections
 * among them. Locked things stay put.
 */
export function movable(ids: readonly string[], items: readonly Item[], lookup: Lookup): string[] {
  const locked = new Set(items.filter((i) => i.locked).map((i) => i.id))
  return withContents(ids.filter((id) => !locked.has(id)), items, lookup).filter((id) => !locked.has(id))
}

/** How many sections a section sits inside (0 for one on its own). */
function depthOf(section: SectionItem, sections: readonly SectionItem[], items: readonly Item[]): number {
  return sections.filter((s) => sectionWithin(section, s, items)).length
}

/** Sections first, outer ones before the ones inside them (they're behind everything), then everything else, each in their own order. */
export function drawingOrder(items: readonly Item[]): Item[] {
  const sections = items.filter(isSection)
  if (!sections.length) return items as Item[]
  const depth = new Map(sections.map((s) => [s.id, depthOf(s, sections, items)]))
  const ordered = [...sections].sort((a, b) => depth.get(a.id)! - depth.get(b.id)!)
  return [...ordered, ...items.filter((i) => !isSection(i))]
}

/** The section a section sits directly inside: the smallest of those it's within. */
function parentOf(section: SectionItem, sections: readonly SectionItem[], items: readonly Item[]): SectionItem | undefined {
  return sections.filter((s) => sectionWithin(section, s, items)).sort((a, b) => area(a) - area(b))[0]
}

/** A section in the tree of a tab's sections, with how much it holds. */
export interface SectionNode {
  section: SectionItem
  children: SectionNode[]
  /** Things inside it (not counting sections), at any depth. */
  things: number
  /** Of those, how many have a status, and how many of those are finished. */
  tasks: number
  done: number
}

/** A tab's sections as a tree: those on their own, each with the ones inside it, in reading order. */
export function sectionTree(items: readonly Item[], lookup: Lookup, statuses: readonly Status[]): SectionNode[] {
  const sections = items.filter(isSection)
  const node = (section: SectionItem): SectionNode => {
    const inside = new Set(contentsOf(section, items, lookup))
    const things = items.filter((i) => inside.has(i.id) && !isSection(i) && i.type !== 'arrow')
    const tracked = things.map((i) => statusOf(i, statuses)).filter((s) => s !== undefined)
    return {
      section,
      children: readingOrder(sections.filter((s) => parentOf(s, sections, items) === section)).map(node),
      things: things.length,
      tasks: tracked.length,
      done: tracked.filter((s) => s.kind === 'done').length
    }
  }
  return readingOrder(sections.filter((s) => !parentOf(s, sections, items))).map(node)
}

const readingOrder = (sections: SectionItem[]): SectionItem[] => [...sections].sort((a, b) => a.y - b.y || a.x - b.x)

/** The sections a board point is in, outermost first ("Act 1", "Forest"…). */
export function sectionTrail(items: readonly Item[], p: { x: number; y: number }): SectionItem[] {
  const around = items.filter(isSection).filter((s) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h)
  return around.sort((a, b) => area(b) - area(a) || items.indexOf(a) - items.indexOf(b))
}
