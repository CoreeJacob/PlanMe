// What can be done to items on the tab showing: adding, typing, deleting, copying, colouring…
// Shared by the keys, the menus, the floating toolbar and the right-click menu.

import { DEFAULT_VIEW, type ArrowEnd, type Item, type Rect, type ShapeType } from '@shared/types'
import { arrowsAttached, boxOf, detach, isArrow, lookupIn } from '@/board/arrows'
import {
  addItems,
  boundsOf,
  bringToFront,
  copiesOf,
  itemsOf,
  moveItems,
  newArrow,
  newItem,
  newItemAt,
  overlaps,
  removeItems,
  sendToBack,
  updateItems
} from '@/board/items'
import { cleanHtml, fromPlainText, isAllStyled, plainText, setWholeStyle, type TextStyle } from '@/board/richtext'
import { useBoard } from '@/board/store'

const newId = (): string => crypto.randomUUID()

/** The canvas's size on screen, kept up to date by the Canvas (for placing pasted items). */
export const viewport = { width: 0, height: 0 }

const state = () => useBoard.getState()
const currentItems = (): Item[] => itemsOf(state().doc, state().tabId)
export const selectedItems = (): Item[] => {
  const ids = new Set(state().selected)
  return currentItems().filter((i) => ids.has(i.id))
}

/** The part of the board on screen, in board units. */
function visibleArea(): Rect {
  const { views, tabId } = state()
  const view = views[tabId] ?? DEFAULT_VIEW
  const w = viewport.width / view.zoom
  const h = viewport.height / view.zoom
  return { x: view.x - w / 2, y: view.y - h / 2, w, h }
}

// ---------- adding and typing ----------

/** Adds an item (at a point, at its usual size, or filling a rectangle) and starts typing in it. */
export function addItem(type: ShapeType, at: { x: number; y: number } | Rect): void {
  const id = newId()
  const item = 'w' in at ? newItem(type, id, at) : newItemAt(type, id, at.x, at.y)
  const { beginGesture, preview, select, setEditing, tabId } = state()
  // Adding it and typing its words are one undo step.
  beginGesture()
  preview(addItems(state().doc, tabId, [item]))
  select([id])
  setEditing(id)
}

/** Adds an arrow between two ends and selects it. */
export function addArrow(from: ArrowEnd, to: ArrowEnd): void {
  const arrow = newArrow(newId(), from, to)
  const { doc, tabId, commit, select } = state()
  commit(addItems(doc, tabId, [arrow]))
  select([arrow.id])
}

/** Starts typing in an item (or an arrow's label). */
export function startEditing(id: string): void {
  if (state().editingId === id) return
  finishEditing()
  state().select([id])
  state().beginGesture()
  state().setEditing(id)
}

/** The editor's words changed. */
export function editText(id: string, html: string): void {
  const { doc, tabId, preview } = state()
  const text = cleanHtml(html)
  preview(updateItems(doc, tabId, [id], (i) => (i.text === text ? i : { ...i, text })))
}

/** Stops typing. A text item left empty isn't worth keeping, so it goes. */
export function finishEditing(): void {
  const { editingId, doc, tabId } = state()
  if (!editingId) return
  const item = currentItems().find((i) => i.id === editingId)
  if (item?.type === 'text' && !plainText(item.text).trim()) {
    state().preview(removeItems(doc, tabId, [item.id]))
    state().select([])
  }
  state().setEditing(null)
  state().endGesture()
}

// ---------- selection ----------

export function selectAll(): void {
  state().select(currentItems().map((i) => i.id))
}

/**
 * Deletes the selection. If arrows are attached to what's going, asks whether they go too or
 * stay with loose ends.
 */
export async function deleteSelected(): Promise<void> {
  finishEditing()
  const { doc, tabId, selected } = state()
  if (!selected.length) return
  const ids = new Set(selected)
  const items = itemsOf(doc, tabId)
  const arrows = arrowsAttached(items, ids)
  let next = removeItems(doc, tabId, selected)
  if (arrows.length) {
    const n = arrows.length
    const choice = await window.api.ask({
      message: n === 1 ? 'Delete the arrow joined to this too?' : `Delete the ${n} arrows joined to these too?`,
      detail: 'If you keep them, their ends stay where they are, joined to nothing.',
      buttons: [n === 1 ? 'Delete Arrow' : 'Delete Arrows', n === 1 ? 'Keep Arrow' : 'Keep Arrows', 'Cancel']
    })
    if (choice === 2) return
    const lookup = lookupIn(items)
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

/** The selected items, with arrows that reach outside the selection let go at that end. */
function selectionToCopy(): Item[] {
  const items = selectedItems()
  const ids = new Set(items.map((i) => i.id))
  const lookup = lookupIn(currentItems())
  const outside = new Set(currentItems().map((i) => i.id).filter((id) => !ids.has(id)))
  return items.map((i) => (isArrow(i) ? detach(i, outside, lookup) : i))
}

export function duplicateSelected(): void {
  const copies = copiesOf(selectionToCopy(), 24, 24, newId)
  if (!copies.length) return
  const { doc, tabId, commit, select } = state()
  commit(addItems(doc, tabId, copies))
  select(copies.map((c) => c.id))
}

export function nudgeSelected(dx: number, dy: number): void {
  const { doc, tabId, selected, commit } = state()
  commit(moveItems(doc, tabId, selected, dx, dy))
}

export function bringSelectedToFront(): void {
  const { doc, tabId, selected, commit } = state()
  commit(bringToFront(doc, tabId, selected))
}

export function sendSelectedToBack(): void {
  const { doc, tabId, selected, commit } = state()
  commit(sendToBack(doc, tabId, selected))
}

// ---------- looks ----------

/** A setting some kinds of item have, like a note's colour or an arrow's heads. */
export type LookKey = 'color' | 'fill' | 'border' | 'rounded' | 'route' | 'heads' | 'dashed' | 'width'

/** Sets a look (like a note's colour) on every selected item that has it. */
export function setOnSelected(key: LookKey, value: string | number | boolean): void {
  const { doc, tabId, selected, commit } = state()
  commit(updateItems(doc, tabId, selected, (i) => (key in i && (i as never)[key] !== value ? ({ ...i, [key]: value } as Item) : i)))
}

/** True if every selected item's words are all in this style. */
export const allStyled = (style: TextStyle): boolean => {
  const items = selectedItems()
  return items.length > 0 && items.every((i) => isAllStyled(i.text, style))
}

/** Bold, italic or underline for all the words of the selected items (on unless they all have it). */
export function toggleStyleOnSelected(style: TextStyle): void {
  const on = !allStyled(style)
  const { doc, tabId, selected, commit } = state()
  commit(updateItems(doc, tabId, selected, (i) => {
    const text = setWholeStyle(i.text, style, on)
    return text === i.text ? i : { ...i, text }
  }))
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
    pasteItems(JSON.parse(raw) as Copied, raw)
    return true
  }
  const text = data.getData('text/plain')
  if (!text.trim()) return false
  const area = visibleArea()
  const id = newId()
  const item = { ...newItemAt('text', id, area.x + area.w / 2, area.y + area.h / 2), text: fromPlainText(text.trim()) }
  const { doc, tabId, commit, select } = state()
  commit(addItems(doc, tabId, [item]))
  select([id])
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
    dx = dy = 24 * pastes.count
  } else {
    // Elsewhere: paste in the middle of the screen.
    dx = Math.round(area.x + area.w / 2 - (bounds.x + bounds.w / 2))
    dy = Math.round(area.y + area.h / 2 - (bounds.y + bounds.h / 2))
  }
  const copies = copiesOf(copied.items, dx, dy, newId)
  const { doc, tabId, commit, select } = state()
  commit(addItems(doc, tabId, copies))
  select(copies.map((c) => c.id))
}
