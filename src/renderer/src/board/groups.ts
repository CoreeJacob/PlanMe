// Linked groups: things that belong together (a character and their gear, say), with a copy on
// any number of tabs. Each copy's parts are ordinary items on its tab, tagged with the group, the
// copy and which part they are. The board keeps where each copy is; a part's place within the
// group is where it is relative to that.
//
// After each change, syncGroups makes every copy match: a part changed in one copy (its words,
// colours, size, ticks, status, or place within the group) is changed the same way in the others,
// as are parts added or taken out. Moving a whole copy only moves that copy, and deleting a whole
// copy only deletes that copy.

import type { ArrowEnd, BoardDoc, Group, GroupCopy, GroupPart, Item, Rect } from '@shared/types'
import { boundsOf } from '@/lib/geometry'
import { same, without } from '@/lib/objects'
import { boxOf, lookupIn } from './arrows'
import { itemsOf, moved, withItems } from './items'

export const NO_GROUPS: Group[] = []

/** The board's groups (none until it has some). */
export const groupsOf = (doc: BoardDoc): Group[] => doc.groups ?? NO_GROUPS

/** An item without its group tag. */
export const ungrouped = <T extends Item>(item: T): T => without(item, 'group')

/** Where things are on a tab: every item, and the parts of each copy (by part) on it. */
function partsOn(items: readonly Item[]): Map<string, Map<string, Item>> {
  const copies = new Map<string, Map<string, Item>>()
  for (const item of items) {
    const g = item.group
    if (!g) continue
    if (!copies.has(g.copy)) copies.set(g.copy, new Map())
    copies.get(g.copy)!.set(g.member, item)
  }
  return copies
}

/** Every copy's parts, across the board. */
function allParts(doc: BoardDoc): Map<string, Map<string, Item>> {
  const all = new Map<string, Map<string, Item>>()
  for (const tab of doc.tabs) for (const [copy, parts] of partsOn(tab.items)) all.set(copy, parts)
  return all
}

/** The ids of the items in a copy. */
export function partIds(items: readonly Item[], copy: string): string[] {
  return items.filter((i) => i.group?.copy === copy).map((i) => i.id)
}

/**
 * `ids`, plus everything else in the copies they're part of (so a group selects and moves as one).
 * The copy that's `open` (being worked inside) doesn't count: its parts are picked one at a time.
 */
export function withGroupMates(ids: readonly string[], items: readonly Item[], open: string | null): string[] {
  const chosen = new Set(ids)
  const copies = new Set(items.filter((i) => chosen.has(i.id) && i.group && i.group.copy !== open).map((i) => i.group!.copy))
  if (!copies.size) return ids as string[]
  for (const i of items) if (i.group && copies.has(i.group.copy)) chosen.add(i.id)
  return [...chosen]
}

/** The box round a copy's parts. */
export function copyBounds(items: readonly Item[], copy: string): Rect | null {
  const lookup = lookupIn(items)
  return boundsOf(items.filter((i) => i.group?.copy === copy).map((i) => boxOf(i, lookup)))
}

// ---------- making, placing and unlinking ----------

/**
 * Makes a group from some items on a tab (and the arrows between them). If any were part of a
 * copy of another group, that copy is unlinked first (its parts become ordinary items).
 */
export function makeGroup(before: BoardDoc, tabId: string, ids: readonly string[], name: string, newId: () => string): BoardDoc {
  const chosen = new Set(ids)
  const doc = unlinkCopies(before, new Set(itemsOf(before, tabId).flatMap((i) => (chosen.has(i.id) && i.group ? [i.group.copy] : []))))
  const items = itemsOf(doc, tabId)
  // Arrows joining two of them come too.
  for (const i of items) if (i.type === 'arrow' && i.from.item && i.to.item && chosen.has(i.from.item) && chosen.has(i.to.item)) chosen.add(i.id)
  const bounds = boundsOf(items.filter((i) => chosen.has(i.id)).map((i) => boxOf(i, lookupIn(items))))
  if (!bounds) return doc
  const group: Group = { id: newId(), name, copies: [{ id: newId(), tab: tabId, x: bounds.x, y: bounds.y }] }
  const part = (k: number): GroupPart => ({ id: group.id, copy: group.copies[0].id, member: `p${k}` })
  let k = 0
  const tagged = withItems(doc, tabId, (list) => list.map((i) => (chosen.has(i.id) ? { ...i, group: part(k++) } : i)))
  return { ...tagged, groups: [...groupsOf(doc), group] }
}

/** A new copy of a group on a tab, its top-left at `at`. One undo step, and the new parts' ids. */
export function placeCopy(doc: BoardDoc, tabId: string, groupId: string, at: { x: number; y: number }, newId: () => string): { doc: BoardDoc; ids: string[] } {
  const group = groupsOf(doc).find((g) => g.id === groupId)
  const source = group?.copies[0]
  const parts = source && allParts(doc).get(source.id)
  if (!group || !source || !parts) return { doc, ids: [] }
  const copy: GroupCopy = { id: newId(), tab: tabId, x: Math.round(at.x), y: Math.round(at.y) }
  const ids = new Map([...parts.values()].map((i) => [i.id, newId()]))
  const placed = [...parts.values()].map((i) => toCopy(i, source, copy, ids))
  const groups = groupsOf(doc).map((g) => (g.id === groupId ? { ...g, copies: [...g.copies, copy] } : g))
  return { doc: { ...withItems(doc, tabId, (items) => [...items, ...placed]), groups }, ids: placed.map((i) => i.id) }
}

/** Unlinks copies: their parts become ordinary items. A group with no copies left goes. */
export function unlinkCopies(doc: BoardDoc, copies: ReadonlySet<string>): BoardDoc {
  if (!copies.size) return doc
  const tabs = doc.tabs.map((t) => (t.items.some((i) => i.group && copies.has(i.group.copy)) ? { ...t, items: t.items.map((i) => (i.group && copies.has(i.group.copy) ? ungrouped(i) : i)) } : t))
  const groups = groupsOf(doc)
    .map((g) => ({ ...g, copies: g.copies.filter((c) => !copies.has(c.id)) }))
    .filter((g) => g.copies.length)
  return { ...doc, tabs, groups }
}

/** Renames a group. */
export function renameGroup(doc: BoardDoc, groupId: string, name: string): BoardDoc {
  return { ...doc, groups: groupsOf(doc).map((g) => (g.id === groupId ? { ...g, name } : g)) }
}

/** Adds items on a tab to a copy of a group (and so, to every copy). */
export function addToCopy(doc: BoardDoc, tabId: string, copy: string, ids: readonly string[]): BoardDoc {
  const group = groupsOf(doc).find((g) => g.copies.some((c) => c.id === copy))
  if (!group) return doc
  const used = new Set([...allParts(doc).values()].flatMap((parts) => [...parts.keys()]))
  let k = 0
  const fresh = (): string => {
    while (used.has(`p${k}`)) k++
    used.add(`p${k}`)
    return `p${k}`
  }
  const chosen = new Set(ids)
  return withItems(doc, tabId, (items) => items.map((i) => (chosen.has(i.id) && !i.group ? { ...i, group: { id: group.id, copy, member: fresh() } } : i)))
}

/**
 * A whole copy of a group among things being copied (for the clipboard, or duplicating): enough to
 * make the pasted parts a new linked copy, even if the group has gone by then (after a cut).
 */
export interface WholeCopy {
  group: string
  name: string
  copy: string
  /** Where the copy was, and the box round its parts then. */
  x: number
  y: number
  bounds: Rect
}

/** The copies of groups that `items` (about to be copied) include all of. */
export function wholeCopiesIn(doc: BoardDoc, items: readonly Item[]): WholeCopy[] {
  const parts = allParts(doc)
  const lookup = lookupIn(items)
  return groupsOf(doc).flatMap((g) =>
    g.copies.flatMap((c) => {
      const mine = items.filter((i) => i.group?.copy === c.id)
      const all = parts.get(c.id)
      if (!mine.length || !all || [...all.keys()].some((m) => !mine.some((i) => i.group!.member === m))) return []
      return [{ group: g.id, name: g.name, copy: c.id, x: c.x, y: c.y, bounds: boundsOf(mine.map((i) => boxOf(i, lookup)))! }]
    })
  )
}

/**
 * Copies of copies: pasted or duplicated parts of a whole copy (see wholeCopiesIn) become a new
 * copy of their group, still linked; if the group has gone (cut, then pasted), it comes back.
 * Parts of a copy on their own become ordinary items. Returns the items, and the board with the
 * new copies recorded.
 */
export function relinkCopies(doc: BoardDoc, tabId: string, items: Item[], wholes: readonly WholeCopy[], newId: () => string): { items: Item[]; doc: BoardDoc } {
  if (!items.some((i) => i.group)) return { items, doc }
  let groups = groupsOf(doc)
  const renamed = new Map<string, string>()
  const lookup = lookupIn(items)
  for (const whole of wholes) {
    const pasted = items.filter((i) => i.group?.copy === whole.copy)
    if (!pasted.length) continue
    const now = boundsOf(pasted.map((i) => boxOf(i, lookup)))!
    const copy: GroupCopy = { id: newId(), tab: tabId, x: whole.x + now.x - whole.bounds.x, y: whole.y + now.y - whole.bounds.y }
    renamed.set(whole.copy, copy.id)
    groups = groups.some((g) => g.id === whole.group)
      ? groups.map((g) => (g.id === whole.group ? { ...g, copies: [...g.copies, copy] } : g))
      : [...groups, { id: whole.group, name: whole.name, copies: [copy] }]
  }
  const relinked = items.map((i) => {
    if (!i.group) return i
    const copy = renamed.get(i.group.copy)
    return copy ? { ...i, group: { ...i.group, copy } } : ungrouped(i)
  })
  return { items: relinked, doc: renamed.size ? { ...doc, groups } : doc }
}

// ---------- keeping copies in step ----------

/** A part of one copy, as it would be in another: placed from that copy, with its own ids. */
function toCopy(item: Item, from: GroupCopy, to: GroupCopy, ids: ReadonlyMap<string, string>, id = ids.get(item.id)!): Item {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const group = item.group && { ...item.group, copy: to.id }
  if (item.type !== 'arrow') return { ...item, id, x: item.x + dx, y: item.y + dy, ...(group ? { group } : {}) }
  const end = (e: ArrowEnd): ArrowEnd => (e.item ? { ...e, item: ids.get(e.item) ?? null, x: e.x + dx, y: e.y + dy } : { ...e, x: e.x + dx, y: e.y + dy })
  const bends = item.bends?.map((b) => ({ x: b.x + dx, y: b.y + dy }))
  return { ...item, id, from: end(item.from), to: end(item.to), ...(bends ? { bends } : {}), ...(group ? { group } : {}) }
}

/**
 * Makes every copy of each group match after a change (from `before` to `after`): see the top
 * of this file. `newId` names parts added to other copies.
 */
export function syncGroups(before: BoardDoc, after: BoardDoc, newId: () => string = () => crypto.randomUUID()): BoardDoc {
  const groups = groupsOf(after)
  if (!groups.length) return after
  const was = allParts(before)
  const now = allParts(after)
  // Copies just made (placed, pasted, duplicated) match the others already.
  const known = new Set(groupsOf(before).flatMap((g) => g.copies.map((c) => c.id)))

  let changed = false
  const edits: Array<{ group: Group; copy: GroupCopy; parts: Map<string, Item | null> }> = []
  const nextGroups = groups.map((group) => {
    const copies: GroupCopy[] = []
    for (const copy of group.copies) {
      const before = was.get(copy.id) ?? new Map<string, Item>()
      const after = now.get(copy.id)
      // A copy deleted whole (or with its tab): just that copy goes.
      if (!after) {
        changed = true
        continue
      }
      const differ = [...new Set([...before.keys(), ...after.keys()])].filter((m) => before.get(m) !== after.get(m))
      if (!differ.length || !known.has(copy.id)) {
        copies.push(copy)
        continue
      }
      // Moved as a whole: everything in it moved by the same amount (arrows joined at both ends
      // and not bent stay as they are), and nothing else changed. How far is read from a part
      // that has a place of its own (not an arrow).
      const anchor = differ.find((m) => before.get(m)?.type !== 'arrow' && after.get(m)?.type !== 'arrow' && before.has(m) && after.has(m))
      const first = anchor ? after.get(anchor) : undefined
      const old = anchor ? before.get(anchor) : undefined
      if (first && old && first.type !== 'arrow' && old.type !== 'arrow') {
        const dx = first.x - old.x
        const dy = first.y - old.y
        const wholeMove =
          before.size === after.size &&
          differ.every((m) => before.get(m) && after.get(m) && same(moved(before.get(m)!, dx, dy), after.get(m))) &&
          [...before].every(([m, i]) => differ.includes(m) || same(moved(i, dx, dy), i))
        if (wholeMove) {
          changed = true
          copies.push({ ...copy, x: copy.x + dx, y: copy.y + dy })
          continue
        }
      }
      copies.push(copy)
      edits.push({ group, copy, parts: new Map(differ.map((m) => [m, after.get(m) ?? null])) })
    }
    if (copies.length !== group.copies.length || copies.some((c, k) => c !== group.copies[k])) changed = true
    return copies.length === group.copies.length && copies.every((c, k) => c === group.copies[k]) ? group : { ...group, copies }
  })
  if (!changed && !edits.length) return after
  const kept = nextGroups.filter((g) => g.copies.length)

  // Make each edit in every other copy of its group (the first copy edited wins, if several were).
  const done = new Set<string>()
  const updates = new Map<string, Map<string, Item | null>>() // tab → (id → new item, or null to delete)
  const additions = new Map<string, Item[]>() // tab → new items
  for (const { group, copy, parts } of edits) {
    const source = now.get(copy.id)!
    const live = kept.find((g) => g.id === group.id)
    if (!live) continue
    for (const other of live.copies) {
      if (other.id === copy.id) continue
      const theirs = now.get(other.id)
      if (!theirs) continue
      // Ids in the edited copy → ids in this one (new ones for parts it doesn't have yet).
      const ids = new Map<string, string>()
      for (const [m, item] of source) ids.set(item.id, theirs.get(m)?.id ?? newId())
      for (const [m, item] of parts) {
        const key = `${other.id}/${m}`
        if (done.has(key)) continue
        done.add(key)
        const tab = other.tab
        if (!updates.has(tab)) updates.set(tab, new Map())
        const target = theirs.get(m)
        if (!item) {
          if (target) updates.get(tab)!.set(target.id, null)
        } else if (target) {
          updates.get(tab)!.set(target.id, toCopy(item, copy, other, ids, target.id))
        } else {
          additions.set(tab, [...(additions.get(tab) ?? []), toCopy(item, copy, other, ids)])
        }
      }
    }
  }
  const tabs = after.tabs.map((t) => {
    const update = updates.get(t.id)
    const add = additions.get(t.id)
    if (!update?.size && !add?.length) return t
    const items = t.items.flatMap((i) => {
      if (!update?.has(i.id)) return [i]
      const next = update.get(i.id)
      return next ? [next] : []
    })
    return { ...t, items: [...items, ...(add ?? [])] }
  })
  return { ...after, tabs, groups: kept.length ? kept : undefined }
}

/**
 * Tidies group data that's come apart (say, files edited by hand or by another app): parts of
 * copies the board doesn't list become ordinary items, and copies with no parts left go (and
 * groups with no copies). The board itself if there's nothing to tidy.
 */
export function tidyGroups(doc: BoardDoc): BoardDoc {
  const parts = allParts(doc)
  const listed = new Set(groupsOf(doc).flatMap((g) => g.copies.map((c) => `${g.id}/${c.id}`)))
  const strays = doc.tabs.some((t) => t.items.some((i) => i.group && !listed.has(`${i.group.id}/${i.group.copy}`)))
  const empty = groupsOf(doc).some((g) => g.copies.some((c) => !parts.has(c.id)))
  if (!strays && !empty) return doc
  const tabs = strays
    ? doc.tabs.map((t) => ({ ...t, items: t.items.map((i) => (i.group && !listed.has(`${i.group.id}/${i.group.copy}`) ? ungrouped(i) : i)) }))
    : doc.tabs
  const groups = groupsOf(doc)
    .map((g) => ({ ...g, copies: g.copies.filter((c) => parts.has(c.id)) }))
    .filter((g) => g.copies.length)
  return { ...doc, tabs, groups: groups.length ? groups : undefined }
}

/** A group's name and how many copies it has, for an item that's part of one. */
export function groupOf(doc: BoardDoc, item: Item | undefined): Group | undefined {
  return item?.group ? groupsOf(doc).find((g) => g.id === item.group!.id) : undefined
}
