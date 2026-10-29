// What can be done to items on the tab showing: adding, typing, deleting, copying, colouring…
// Shared by the keys, the menus, the floating toolbar and the right-click menu.

import { DEFAULT_VIEW, type ArrowEnd, type ArrowItem, type BoardDoc, type BoxShape, type Item, type Link, type Rect, type Shape, type Status, type Tag, type TodoItem } from '@shared/types'
import { upgradeItem } from '@shared/upgrade'
import { attempt, useApp } from '@/app/store'
import { arrowsAttached, boxOf, detach, isArrow, isShape, lookupIn } from '@/board/arrows'
import { arrange, type Alignment, type Spread } from '@/board/arrange'
import { addToCopy, copyBounds, groupsOf, makeGroup, placeCopy, relinkCopies, renameGroup, ungrouped, unlinkCopies, withGroupMates } from '@/board/groups'
import {
  addItems,
  copiesOf,
  type BlankType,
  isLocked,
  itemsOf,
  moveItems,
  newArrow,
  newItem,
  newItemAt,
  newLike,
  removeItems,
  restack,
  unlocked,
  updateItems
} from '@/board/items'
import { linkKey, linkTarget } from '@/board/links'
import { cleanHtml, fromPlainText, isAllStyled, plainText, setWholeStyle, type TextStyle } from '@/board/richtext'
import { movable, withContents } from '@/board/sections'
import { autoKind, withStatuses } from '@/board/statuses'
import { nextTagColor, tagState, tagsOf, withTag, withTags } from '@/board/tags'
import { useBoard } from '@/board/store'
import { count, plural } from '@/lib/format'
import { boundsOf, overlaps } from '@/lib/geometry'
import { currentItems, currentView, viewport } from './current'
import { addImageFiles, hasPictures } from './images'

const newId = (): string => crypto.randomUUID()

const state = () => useBoard.getState()
export const selectedItems = (): Item[] => {
  const ids = new Set(state().selected)
  return currentItems().filter((i) => ids.has(i.id))
}

/** The part of the board on screen, in board units. */
function visibleArea(): Rect {
  const view = currentView()
  const w = viewport.width / view.zoom
  const h = viewport.height / view.zoom
  return { x: view.x - w / 2, y: view.y - h / 2, w, h }
}

/** Changes the tab showing, as one undo step, then selects `select` if given. */
function change(edit: (doc: BoardDoc, tabId: string) => BoardDoc, select?: string[]): void {
  const { doc, tabId, commit } = state()
  commit(edit(doc, tabId))
  if (select) state().select(select)
}

// ---------- adding and typing ----------

/** Adds items and starts typing in one of them. Adding and typing are one undo step. */
function addAndType(added: Item[], typeIn: string): void {
  const { beginGesture, preview, select, setEditing, tabId } = state()
  beginGesture()
  preview(addItems(state().doc, tabId, added))
  select([typeIn])
  setEditing(typeIn)
}

/** Adds an item (at a point, at its usual size, or filling a rectangle) and starts typing in it. */
export function addItem(type: BlankType, at: { x: number; y: number } | Rect, shape?: BoxShape): void {
  const id = newId()
  addAndType(['w' in at ? newItem(type, id, at, shape) : newItemAt(type, id, at.x, at.y, shape)], id)
}

/** Adds an arrow between two ends and selects it. */
export function addArrow(from: ArrowEnd, to: ArrowEnd): void {
  const arrow = newArrow(newId(), from, to)
  change((doc, tabId) => addItems(doc, tabId, [arrow]), [arrow.id])
}

/**
 * Builds outwards: a new item like `source` in `rect`, joined to it by an arrow from `from`, ready
 * to type in. All one undo step (and if it's a text item left empty, it all goes again).
 */
export function addConnected(source: Shape, from: ArrowEnd, rect: Rect): void {
  const item = newLike(source, newId(), rect)
  addAndType([item, newArrow(newId(), from, { item: item.id, x: rect.x, y: rect.y })], item.id)
}

/** Starts typing in an item (or an arrow's label), or in one part of a to-do list. */
export function startEditing(id: string, part: string | null = null): void {
  if (state().editingId === id) return state().setEditing(id, part)
  // A picture has no words to type: just select it.
  if (currentItems().find((i) => i.id === id)?.type === 'image') return state().select([id])
  finishEditing()
  state().select([id])
  state().beginGesture()
  state().setEditing(id, part)
}

/** The editor's words changed. */
export function editText(id: string, html: string): void {
  const { doc, tabId, preview } = state()
  const text = cleanHtml(html)
  preview(updateItems(doc, tabId, [id], (i) => (i.text === text ? i : { ...i, text })))
}

/**
 * Stops typing. A text item left empty isn't worth keeping, so it goes. A to-do list loses any
 * empty lines (but keeps one, to type in later).
 */
export function finishEditing(): void {
  const { editingId, doc, tabId } = state()
  if (!editingId) return
  const item = currentItems().find((i) => i.id === editingId)
  if (item?.type === 'todo') {
    const kept = item.entries.filter((e) => e.text.trim())
    if (kept.length !== item.entries.length) {
      const entries = kept.length ? kept : item.entries.slice(0, 1)
      state().preview(updateItems(doc, tabId, [item.id], (i) => ({ ...i, entries })))
    }
  }
  if (item?.type === 'text' && !plainText(item.text).trim()) {
    // Arrows that were made with it go too (they'd be joined to nothing).
    const items = itemsOf(doc, tabId)
    const joined = arrowsAttached(items, new Set([item.id])).map((a) => a.id)
    state().preview(removeItems(doc, tabId, [item.id, ...joined]))
    state().select([])
  }
  state().setEditing(null)
  state().endGesture()
}

// ---------- to-do lists ----------

/**
 * Changes a to-do list. While it's being typed in, that's part of the same undo step as the
 * typing; otherwise (ticking a box, say) it's an undo step of its own.
 */
export function editTodo(id: string, edit: (todo: TodoItem) => TodoItem): void {
  const { doc, tabId, gesture, preview, commit } = state()
  const next = updateItems(doc, tabId, [id], (i) => {
    if (i.type !== 'todo') return i
    const edited = edit(i)
    // Its ticks changed its status: note when, for the Done list.
    return edited.auto && autoKind(edited) !== autoKind(i) ? { ...edited, statusAt: Date.now() } : edited
  })
  if (gesture) preview(next)
  else commit(next)
}

/** Ticks a line of a to-do list, or unticks it. */
export function tickEntry(id: string, entry: string): void {
  editTodo(id, (t) => ({ ...t, entries: t.entries.map((e) => (e.id === entry ? { ...e, done: !e.done } : e)) }))
}

// ---------- statuses ----------

/**
 * Gives the selected items a status (a status id), none (null), or, for to-do lists, lets them
 * work theirs out from their ticks ('auto').
 */
export function setStatusOnSelected(value: string | null | 'auto'): void {
  change((doc, tabId) =>
    updateItems(doc, tabId, state().selected, (i) => {
      if (i.type === 'arrow') return i
      const statusAt = Date.now()
      if (value === 'auto') return i.type === 'todo' ? { ...withoutStatus(i), auto: true, statusAt } : i
      const picked = value === null ? withoutStatus(i) : { ...i, status: value, statusAt }
      return picked.type === 'todo' ? { ...picked, auto: false } : picked
    })
  )
}

/** The item with no status of its own. */
function withoutStatus<T extends Shape>(item: T): T {
  const { status: _none, ...rest } = item
  return rest as T
}

/** The board's list of statuses changed (from the status editor): one undo step. */
export function saveStatuses(statuses: Status[]): void {
  state().commit(withStatuses(state().doc, statuses))
}

// ---------- arrows ----------

/** Straight, right-angled or curved. Bends carry over between straight and curved; a right-angled arrow's are its own. */
export function setRouteOnSelected(route: ArrowItem['route']): void {
  change((doc, tabId) =>
    updateItems(doc, tabId, state().selected, (i) => {
      if (i.type !== 'arrow' || i.route === route) return i
      if (i.route !== 'elbow' && route !== 'elbow') return { ...i, route }
      const { bends: _dropped, ...rest } = i
      return { ...rest, route }
    })
  )
}

/** Takes all the bends out of the selected arrows. */
export function straightenSelected(): void {
  change((doc, tabId) =>
    updateItems(doc, tabId, state().selected, (i) => {
      if (i.type !== 'arrow' || !i.bends) return i
      const { bends: _dropped, ...rest } = i
      return rest
    })
  )
}

/** Takes one bend out of an arrow (double-clicking it). */
export function removeBend(id: string, index: number): void {
  change((doc, tabId) =>
    updateItems(doc, tabId, [id], (i) => {
      if (i.type !== 'arrow' || !i.bends?.[index]) return i
      const bends = i.bends.filter((_, k) => k !== index)
      if (bends.length) return { ...i, bends }
      const { bends: _dropped, ...rest } = i
      return rest
    })
  )
}

// ---------- tags and details ----------

/** Adds a tag to the selected items, or takes it off if they all have it. One undo step. */
export function toggleTagOnSelected(id: string): void {
  const on = tagState(selectedItems(), id) !== 'all'
  change((doc, tabId) => updateItems(doc, tabId, state().selected, (i) => withTag(i, id, on)))
}

/** Makes a new tag (asking its name) and puts it on the selected items. One undo step. */
export async function newTagForSelected(): Promise<void> {
  const ids = state().selected
  const name = (await useApp.getState().ask({ title: 'New Tag', label: 'What area is it? Art, Audio, Combat…', value: '', confirmLabel: 'Add' }))?.trim()
  if (!name) return
  const tags = tagsOf(state().doc)
  // A tag by that name already: use it.
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
  const tag: Tag = existing ?? { id: newId().slice(0, 8), name, color: nextTagColor(tags) }
  change((doc, tabId) => updateItems(existing ? doc : { ...doc, tags: [...tags, tag] }, tabId, ids, (i) => withTag(i, tag.id, true)))
}

/** The board's list of tags changed (from the tag editor): one undo step. */
export function saveTags(tags: Tag[]): void {
  state().commit(withTags(state().doc, tags))
}

/** Typing in an item's details (one undo step from starting to stopping, like typing on the board). */
export function editDetails(id: string, html: string): void {
  const { doc, tabId, preview } = state()
  const details = cleanHtml(html, { lists: true })
  const empty = !plainText(details).trim()
  preview(
    updateItems(doc, tabId, [id], (i) => {
      if (i.type === 'arrow') return i
      if (empty) {
        const { details: _gone, ...rest } = i
        return i.details === undefined ? i : (rest as Shape)
      }
      return i.details === details ? i : { ...i, details }
    })
  )
}

/** Opens the Details pane for an item. */
export function showDetails(id: string): void {
  finishEditing()
  state().select([id])
  useApp.getState().setDetailsOpen(true)
}

// ---------- going to things ----------

/** Shows a tab, where it was last looking. */
export function goToTab(tabId: string): void {
  finishEditing()
  state().setTab(tabId)
}

/** Shows an item (from the Tasks panel, search or a link): its tab, centred on screen, selected, and flashing briefly. */
export function goToItem(tabId: string, id: string): void {
  goToTab(tabId)
  const items = itemsOf(state().doc, tabId)
  const item = items.find((i) => i.id === id)
  if (!item) return
  const box = boxOf(item, lookupIn(items))
  const zoom = (state().views[tabId] ?? DEFAULT_VIEW).zoom
  state().setView(tabId, { x: box.x + box.w / 2, y: box.y + box.h / 2, zoom })
  state().select([id])
  useApp.getState().flash([id])
}

// ---------- links ----------

/** Opens the Link picker for the selected items (arrows can't have links). */
export function linkSelected(): void {
  finishEditing()
  const ids = selectedItems().filter(isShape).map((i) => i.id)
  if (ids.length) useApp.getState().setLinking(ids)
}

/** Gives items a link, or with null takes theirs away. One undo step. */
export function setLink(ids: string[], link: Link | null): void {
  change((doc, tabId) =>
    updateItems(doc, tabId, ids, (i) => {
      if (i.type === 'arrow') return i
      if (!link) {
        const { link: had, ...rest } = i
        return had ? (rest as Shape) : i
      }
      return i.link && linkKey(i.link) === linkKey(link) ? i : { ...i, link }
    })
  )
}

/**
 * Follows an item's link: to a tab or an item (the Back chip then comes back here), or to a web
 * page in the browser. A broken link opens the Link picker to choose somewhere else.
 */
export function followLink(id: string): void {
  const item = currentItems().find((i) => i.id === id)
  if (!item || item.type === 'arrow' || !item.link) return
  const target = linkTarget(state().doc, item.link)
  if (!target) {
    finishEditing()
    state().select([id])
    useApp.getState().setLinking([id])
    return
  }
  if (target.type === 'web') return void attempt(() => window.api.openWebLink(target.url))
  useApp.getState().pushBack({ tabId: state().tabId, view: currentView(), itemId: id })
  if (target.type === 'tab') goToTab(target.tab.id)
  else goToItem(target.tab.id, target.item.id)
}

/** Back to where the last link was followed from: that tab, looking where it was, with the link's item selected. */
export function goBack(): void {
  const { doc } = state()
  let spot = useApp.getState().popBack()
  // Skip places on tabs deleted since.
  while (spot && !doc.tabs.some((t) => t.id === spot!.tabId)) spot = useApp.getState().popBack()
  if (!spot) return
  goToTab(spot.tabId)
  state().setView(spot.tabId, spot.view)
  const itemId = spot.itemId
  if (itemsOf(doc, spot.tabId).some((i) => i.id === itemId)) state().select([itemId])
}

// ---------- selection ----------

/** Selects everything on the tab except locked things (like dragging across the whole tab). */
export function selectAll(): void {
  const items = currentItems()
  state().select(withGroupMates(items.filter((i) => !isLocked(i)).map((i) => i.id), items, state().openGroup))
}

// ---------- linked groups ----------

/** The copies (of linked groups) the selection is part of. */
export const selectedCopies = (): Set<string> => new Set(selectedItems().flatMap((i) => (i.group ? [i.group.copy] : [])))

/** Makes a linked group of the selection, asking its name. One undo step. */
export async function groupSelected(): Promise<void> {
  finishEditing()
  const ids = state().selected
  if (!ids.length) return
  const name = (await useApp.getState().ask({ title: 'Make Group', label: 'A name for it, like “Hero” or “Shop”. Copies of it on other tabs stay linked.', value: '', confirmLabel: 'Make Group' }))?.trim()
  if (!name) return
  change((doc, tabId) => makeGroup(doc, tabId, ids, name, () => newId().slice(0, 8)), ids)
}

/** Unlinks the copies the selection is part of: their parts become ordinary items (other copies stay linked). */
export function ungroupSelected(): void {
  const copies = selectedCopies()
  if (!copies.size) return
  state().setOpenGroup(null)
  change((doc) => unlinkCopies(doc, copies))
}

/** Adds the selected things that aren't in a group to the one copy that is selected (and so to every copy). */
export function addSelectedToGroup(): void {
  const [copy] = selectedCopies()
  if (!copy) return
  change((doc, tabId) => addToCopy(doc, tabId, copy, state().selected))
}

/** Takes the selected parts out of their group: here they become ordinary items, and they go from every other copy. */
export function takeOutOfGroup(): void {
  change((doc, tabId) => updateItems(doc, tabId, state().selected, (i) => ungrouped(i)))
}

/** Puts a copy of a group on the tab showing, its middle at `at` (or the middle of the screen). */
export function placeGroupCopy(groupId: string, at?: { x: number; y: number }): void {
  const { doc, tabId } = state()
  const group = groupsOf(doc).find((g) => g.id === groupId)
  const first = group?.copies[0]
  const size = first && copyBounds(itemsOf(doc, first.tab), first.id)
  if (!size) return
  const area = visibleArea()
  const middle = at ?? { x: area.x + area.w / 2, y: area.y + area.h / 2 }
  const placed = placeCopy(doc, tabId, groupId, { x: middle.x - size.w / 2, y: middle.y - size.h / 2 }, () => newId().slice(0, 8))
  finishEditing()
  state().setOpenGroup(null)
  state().commit(placed.doc)
  state().select(placed.ids)
}

export async function renameGroupAsked(groupId: string): Promise<void> {
  const group = groupsOf(state().doc).find((g) => g.id === groupId)
  const name = group && (await useApp.getState().ask({ title: 'Rename Group', value: group.name, confirmLabel: 'Rename' }))?.trim()
  if (name && name !== group.name) state().commit(renameGroup(state().doc, groupId, name))
}

/** Unlinks every copy of a group: they all become ordinary items, and the group goes. */
export function deleteGroup(groupId: string): void {
  const group = groupsOf(state().doc).find((g) => g.id === groupId)
  if (group) state().commit(unlinkCopies(state().doc, new Set(group.copies.map((c) => c.id))))
}

/** Locks the selected items, or unlocks them if they're all locked already. One undo step. */
export function toggleLockOnSelected(): void {
  const chosen = selectedItems()
  if (!chosen.length) return
  finishEditing()
  const lock = !chosen.every(isLocked)
  change((doc, tabId) => updateItems(doc, tabId, state().selected, (i) => (lock ? (i.locked ? i : { ...i, locked: true }) : unlocked(i))))
}

/** Lines up the selected things, or spreads them out evenly. One undo step. */
export function arrangeSelected(how: Alignment | Spread): void {
  change((doc, tabId) => arrange(doc, tabId, state().selected, how))
}

/**
 * Deletes the selection. For a section with things in it, asks whether they go too. If arrows are
 * attached to what's going, asks whether they go too or stay with loose ends.
 */
export async function deleteSelected(): Promise<void> {
  finishEditing()
  const { doc, tabId, selected: chosen } = state()
  if (!chosen.length) return
  const items = itemsOf(doc, tabId)
  const lookup = lookupIn(items)
  // Locked things stay.
  const locked = new Set(items.filter(isLocked).map((i) => i.id))
  const selected = chosen.filter((id) => !locked.has(id))
  if (selected.length < chosen.length) {
    useApp.getState().toast(selected.length ? 'Locked things were kept — unlock them to delete them' : 'It’s locked — unlock it to delete it')
    if (!selected.length) return
  }
  let going = selected
  const contents = withContents(selected, items, lookup).filter((id) => !selected.includes(id) && !locked.has(id))
  if (contents.length) {
    const n = contents.length
    const sections = selected.filter((id) => items.find((i) => i.id === id)?.type === 'section').length
    const choice = await window.api.ask({
      message: `Delete everything in the ${plural(sections, 'section')} too?`,
      detail: `There ${plural(n, 'is', 'are')} ${count(n, 'thing')} inside. If you keep them, they stay where they are.`,
      buttons: ['Delete Everything', `Just the ${plural(sections, 'Section')}`, 'Cancel']
    })
    if (choice === 2) return
    if (choice === 0) going = [...selected, ...contents]
  }
  const ids = new Set(going)
  const arrows = arrowsAttached(items, ids)
  let next = removeItems(doc, tabId, going)
  if (arrows.length) {
    const n = arrows.length
    const choice = await window.api.ask({
      message: n === 1 ? 'Delete the arrow joined to this too?' : `Delete the ${count(n, 'arrow')} joined to these too?`,
      detail: 'If you keep them, their ends stay where they are, joined to nothing.',
      buttons: [`Delete ${plural(n, 'Arrow')}`, `Keep ${plural(n, 'Arrow')}`, 'Cancel']
    })
    if (choice === 2) return
    // Locked arrows stay either way, let go at that end.
    const kept = new Set(arrows.filter((a) => choice === 1 || a.locked).map((a) => a.id))
    next = removeItems(next, tabId, arrows.filter((a) => !kept.has(a.id)).map((a) => a.id))
    next = updateItems(next, tabId, [...kept], (a) => (isArrow(a) ? detach(a, ids, lookup) : a))
  }
  // The board may have changed while the question was up.
  if (state().doc !== doc) return
  state().commit(next)
  state().select([])
}

/**
 * The selected items (and whatever's in selected sections), with arrows that reach outside them
 * let go at that end.
 */
function selectionToCopy(): Item[] {
  const all = currentItems()
  const lookup = lookupIn(all)
  const ids = new Set(withContents(state().selected, all, lookup))
  const items = all.filter((i) => ids.has(i.id))
  const outside = new Set(all.map((i) => i.id).filter((id) => !ids.has(id)))
  return items.map((i) => (isArrow(i) ? detach(i, outside, lookup) : i))
}

/** How far a duplicate (or a paste on the same tab) lands from the original. */
const COPY_STEP = 24

export function duplicateSelected(): void {
  // Copies aren't locked, so they can be moved off the original. A whole copy of a group is a new linked copy.
  const copies = copiesOf(selectionToCopy(), COPY_STEP, COPY_STEP, newId).map(unlocked)
  if (!copies.length) return
  const { doc, tabId } = state()
  const relinked = relinkCopies(doc, tabId, copies, () => newId().slice(0, 8))
  change(() => addItems(relinked.doc, tabId, relinked.items), relinked.items.map((c) => c.id))
}

export function nudgeSelected(dx: number, dy: number): void {
  const items = currentItems()
  // A section takes what's inside it along; locked things stay put.
  const ids = movable(state().selected, items, lookupIn(items))
  change((doc, tabId) => moveItems(doc, tabId, ids, dx, dy))
}

export function bringSelectedToFront(): void {
  change((doc, tabId) => restack(doc, tabId, state().selected, 'front'))
}

export function sendSelectedToBack(): void {
  change((doc, tabId) => restack(doc, tabId, state().selected, 'back'))
}

// ---------- looks ----------

/** A setting some kinds of item have, like a note's colour or an arrow's heads. */
export type LookKey = 'color' | 'fill' | 'border' | 'shape' | 'route' | 'heads' | 'dashed' | 'width'

/** Sets a look (like a note's colour) on every selected item that has it. */
export function setOnSelected(key: LookKey, value: string | number | boolean): void {
  change((doc, tabId) => updateItems(doc, tabId, state().selected, (i) => (key in i && (i as never)[key] !== value ? ({ ...i, [key]: value } as Item) : i)))
}

/** True if every selected item's words are all in this style. */
export const allStyled = (style: TextStyle): boolean => {
  const items = selectedItems()
  return items.length > 0 && items.every((i) => isAllStyled(i.text, style))
}

/** Bold, italic or underline for all the words of the selected items (on unless they all have it). */
export function toggleStyleOnSelected(style: TextStyle): void {
  const on = !allStyled(style)
  change((doc, tabId) =>
    updateItems(doc, tabId, state().selected, (i) => {
      const text = setWholeStyle(i.text, style, on)
      return text === i.text ? i : { ...i, text }
    })
  )
}

// ---------- copy and paste ----------

const CLIPBOARD_TYPE = 'application/x-planme-items'

interface Copied {
  /** The board it was copied from: pictures pasted into another board bring their files along. */
  board?: string
  tabId: string
  items: Item[]
}

/** How many times the same copy has been pasted on its own tab, so each paste lands a step further on. */
let pastes = { key: '', count: 0 }

/** Puts the selected items on the clipboard (and their words, for pasting elsewhere). Returns false if nothing's selected. */
export function copySelected(data: DataTransfer): boolean {
  const items = selectionToCopy()
  if (!items.length) return false
  const copied: Copied = { board: state().board?.path, tabId: state().tabId, items }
  data.setData(CLIPBOARD_TYPE, JSON.stringify(copied))
  data.setData('text/plain', items.map((i) => plainText(i.text)).filter(Boolean).join('\n\n'))
  return true
}

/** Pastes items copied in PlanMe, or else plain text as a text item. Returns false if there was nothing to paste. */
export function paste(data: DataTransfer): boolean {
  const raw = data.getData(CLIPBOARD_TYPE)
  if (raw) {
    const copied = JSON.parse(raw) as Copied
    // It may have been copied before an update.
    void attempt(() => pasteItems({ ...copied, items: copied.items.map(upgradeItem) }, raw))
    return true
  }
  const area = visibleArea()
  // Pictures (a screenshot, say) go in the middle of the screen.
  if (data.files.length && hasPictures([...data.files])) {
    void addImageFiles([...data.files], { x: area.x + area.w / 2, y: area.y + area.h / 2 })
    return true
  }
  const text = data.getData('text/plain')
  if (!text.trim()) return false
  const id = newId()
  const item = { ...newItemAt('text', id, area.x + area.w / 2, area.y + area.h / 2), text: fromPlainText(text.trim()) }
  change((doc, tabId) => addItems(doc, tabId, [item]), [id])
  return true
}

async function pasteItems(copied: Copied, key: string): Promise<void> {
  // Pictures from another board: copy their files into this one first.
  const here = state().board?.path
  if (copied.board && here && copied.board !== here) {
    const from = copied.board
    copied = {
      ...copied,
      items: await Promise.all(copied.items.map(async (i) => (i.type === 'image' ? { ...i, ...(await window.api.copyImage(from, i.src, here)) } : i)))
    }
  }
  const lookup = lookupIn(copied.items)
  const bounds = boundsOf(copied.items.map((i) => boxOf(i, lookup)))
  if (!bounds) return
  const area = visibleArea()
  let dx: number
  let dy: number
  if (copied.tabId === state().tabId && overlaps(bounds, area)) {
    // Same tab and the originals are in view: each paste lands a step down and to the right.
    pastes = { key, count: pastes.key === key ? pastes.count + 1 : 1 }
    dx = dy = COPY_STEP * pastes.count
  } else {
    // Elsewhere: paste in the middle of the screen.
    dx = Math.round(area.x + area.w / 2 - (bounds.x + bounds.w / 2))
    dy = Math.round(area.y + area.h / 2 - (bounds.y + bounds.h / 2))
  }
  const copies = copiesOf(copied.items, dx, dy, newId).map(unlocked)
  // From another board, groups don't come along: the parts are ordinary items.
  const { doc, tabId } = state()
  const relinked = copied.board && copied.board !== here ? { items: copies.map(ungrouped), doc } : relinkCopies(doc, tabId, copies, () => newId().slice(0, 8))
  change(() => addItems(relinked.doc, tabId, relinked.items), relinked.items.map((c) => c.id))
}
