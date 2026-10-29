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
import { boxOf, lookupIn } from './arrows'
import { itemsOf, moved, withItems } from './items'

export const NO_GROUPS: Group[] = []

/** The board's groups (none until it has some). */
export const groupsOf = (doc: BoardDoc): Group[] => doc.groups ?? NO_GROUPS

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/** An item without its group tag. */
export function ungrouped<T extends Item>(item: T): T {
  if (!item.group) return item
  const { group: _was, ...rest } = item
  return rest as T
}

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
 * Copies that have been copied: pasted or duplicated items that make up a whole copy become a new
 * copy of their group (still linked); parts of a copy on their own become ordinary items. Returns
 * the items, and the board with any new copies recorded.
 */
export function relinkCopies(doc: BoardDoc, tabId: string, items: Item[], newId: () => string): { items: Item[]; doc: BoardDoc } {
  const groups = groupsOf(doc)
  const parts = allParts(doc)
  const copies = new Map<string, Item[]>()
  for (const i of items) if (i.group) copies.set(i.group.copy, [...(copies.get(i.group.copy) ?? []), i])
  if (!copies.size) return { items, doc }
  const renamed = new Map<string, GroupCopy>()
  const added: Array<{ group: string; copy: GroupCopy }> = []
  const lookup = lookupIn(items)
  for (const [copy, pasted] of copies) {
    const group = groups.find((g) => g.copies.some((c) => c.id === copy))
    const whole = group && parts.get(copy) && [...parts.get(copy)!.keys()].every((m) => pasted.some((i) => i.group!.member === m))
    if (!group || !whole) continue
    const original = group.copies.find((c) => c.id === copy)!
    const bounds = boundsOf(pasted.map((i) => boxOf(i, lookup)))!
    const was = copyBounds([...parts.get(copy)!.values()], copy)!
    const fresh: GroupCopy = { id: newId(), tab: tabId, x: original.x + bounds.x - was.x, y: original.y + bounds.y - was.y }
    renamed.set(copy, fresh)
    added.push({ group: group.id, copy: fresh })
  }
  const relinked = items.map((i) => {
    if (!i.group) return i
    const fresh = renamed.get(i.group.copy)
    return fresh ? { ...i, group: { ...i.group, copy: fresh.id } } : ungrouped(i)
  })
  const nextGroups = groups.map((g) => {
    const more = added.filter((a) => a.group === g.id).map((a) => a.copy)
    return more.length ? { ...g, copies: [...g.copies, ...more] } : g
  })
  return { items: relinked, doc: added.length ? { ...doc, groups: nextGroups } : doc }
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
      // and not bent stay as they are), and nothing else changed.
      const first = after.get(differ[0])
      const old = before.get(differ[0])
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

/** A group's name and how many copies it has, for an item that's part of one. */
export function groupOf(doc: BoardDoc, item: Item | undefined): Group | undefined {
  return item?.group ? groupsOf(doc).find((g) => g.id === item.group!.id) : undefined
}
