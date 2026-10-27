// What can be done to items on the tab showing: adding, typing, deleting, copying, colouring…
// Shared by the keys, the menus, the floating toolbar and the right-click menu.

import type { ArrowEnd, BoardDoc, BoxShape, Item, Rect, Shape, ShapeType, Status, TodoItem } from '@shared/types'
import { upgradeItem } from '@shared/upgrade'
import { arrowsAttached, boxOf, detach, isArrow, lookupIn } from '@/board/arrows'
import {
  addItems,
  copiesOf,
  itemsOf,
  moveItems,
  newArrow,
  newItem,
  newItemAt,
  newLike,
  removeItems,
  restack,
  updateItems
} from '@/board/items'
import { cleanHtml, fromPlainText, isAllStyled, plainText, setWholeStyle, type TextStyle } from '@/board/richtext'
import { withContents } from '@/board/sections'
import { withStatuses } from '@/board/statuses'
import { useBoard } from '@/board/store'
import { count, plural } from '@/lib/format'
import { boundsOf, overlaps } from '@/lib/geometry'
import { currentItems, currentView } from './current'

const newId = (): string => crypto.randomUUID()

/** The canvas's size on screen, kept up to date by the Canvas (for placing pasted items). */
export const viewport = { width: 0, height: 0 }

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
export function addItem(type: ShapeType, at: { x: number; y: number } | Rect, shape?: BoxShape): void {
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
  const next = updateItems(doc, tabId, [id], (i) => (i.type === 'todo' ? edit(i) : i))
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
      if (value === 'auto') return i.type === 'todo' ? { ...withoutStatus(i), auto: true } : i
      const picked = value === null ? withoutStatus(i) : { ...i, status: value }
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

// ---------- selection ----------

export function selectAll(): void {
  state().select(currentItems().map((i) => i.id))
}

/**
 * Deletes the selection. For a section with things in it, asks whether they go too. If arrows are
 * attached to what's going, asks whether they go too or stay with loose ends.
 */
export async function deleteSelected(): Promise<void> {
  finishEditing()
  const { doc, tabId, selected } = state()
  if (!selected.length) return
  const items = itemsOf(doc, tabId)
  const lookup = lookupIn(items)
  let going = selected
  const contents = withContents(selected, items, lookup).filter((id) => !selected.includes(id))
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
    const attached = new Set(arrows.map((a) => a.id))
    next =
      choice === 0
        ? removeItems(next, tabId, [...attached])
        : updateItems(next, tabId, [...attached], (a) => (isArrow(a) ? detach(a, ids, lookup) : a))
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
  const copies = copiesOf(selectionToCopy(), COPY_STEP, COPY_STEP, newId)
  if (copies.length) change((doc, tabId) => addItems(doc, tabId, copies), copies.map((c) => c.id))
}

export function nudgeSelected(dx: number, dy: number): void {
  const items = currentItems()
  // A section takes what's inside it along.
  const ids = withContents(state().selected, items, lookupIn(items))
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
  tabId: string
  items: Item[]
}

/** How many times the same copy has been pasted on its own tab, so each paste lands a step further on. */
let pastes = { key: '', count: 0 }

/** Puts the selected items on the clipboard (and their words, for pasting elsewhere). Returns false if nothing's selected. */
export function copySelected(data: DataTransfer): boolean {
  const items = selectionToCopy()
  if (!items.length) return false
  const copied: Copied = { tabId: state().tabId, items }
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
    pasteItems({ ...copied, items: copied.items.map(upgradeItem) }, raw)
    return true
  }
  const text = data.getData('text/plain')
  if (!text.trim()) return false
  const area = visibleArea()
  const id = newId()
  const item = { ...newItemAt('text', id, area.x + area.w / 2, area.y + area.h / 2), text: fromPlainText(text.trim()) }
  change((doc, tabId) => addItems(doc, tabId, [item]), [id])
  return true
}

function pasteItems(copied: Copied, key: string): void {
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
  const copies = copiesOf(copied.items, dx, dy, newId)
  change((doc, tabId) => addItems(doc, tabId, copies), copies.map((c) => c.id))
}
