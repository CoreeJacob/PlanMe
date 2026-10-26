// What can be done to items on the tab showing: adding, typing, deleting, copying, colouring…
// Shared by the keys, the menus, the floating toolbar and the right-click menu.

import { DEFAULT_VIEW, type Item, type ItemType, type Rect } from '@shared/types'
import {
  addItems,
  boundsOf,
  bringToFront,
  copiesOf,
  itemsOf,
  moveItems,
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
export function addItem(type: ItemType, at: { x: number; y: number } | Rect): void {
  const id = newId()
  const item = 'w' in at ? newItem(type, id, at) : newItemAt(type, id, at.x, at.y)
  const { beginGesture, preview, select, setEditing, tabId } = state()
  // Adding it and typing its words are one undo step.
  beginGesture()
  preview(addItems(state().doc, tabId, [item]))
  select([id])
  setEditing(id)
}

/** Starts typing in an item. */
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

export function deleteSelected(): void {
  finishEditing()
  const { doc, tabId, selected, commit, select } = state()
  if (!selected.length) return
  commit(removeItems(doc, tabId, selected))
  select([])
}

export function duplicateSelected(): void {
  const copies = copiesOf(selectedItems(), 24, 24, newId)
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

/** Sets a property (like a note's colour) on every selected item that has it. */
export function setOnSelected<K extends 'color' | 'fill' | 'border' | 'rounded'>(key: K, value: K extends 'rounded' ? boolean : string): void {
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
  const items = selectedItems()
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
  const bounds = boundsOf(copied.items)
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
