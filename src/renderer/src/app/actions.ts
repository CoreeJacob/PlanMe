// Things the menus and buttons do: opening and switching boards, and working with tabs.

import { DEFAULT_VIEW, type OpenedBoard } from '@shared/types'
import { addTab, copyName, duplicateTab, isUntouched, moveTab, neighbourTab, nextTabName, removeTab, renameTab, tabIndex } from '@/board/doc'
import { flushSave } from '@/board/saver'
import { useBoard } from '@/board/store'
import { count } from '@/lib/format'
import { attempt, useApp } from './store'

// ---------- boards ----------

export async function refreshBoards(): Promise<void> {
  const boards = await attempt(() => window.api.listBoards())
  if (boards) useApp.setState({ boards })
}

function show(board: OpenedBoard): void {
  useBoard.getState().load(board)
  useApp.getState().setScreen('board')
}

export async function openBoard(path: string): Promise<void> {
  if (useBoard.getState().board?.path === path) return useApp.getState().setScreen('board')
  await flushSave()
  const board = await attempt(() => window.api.openBoard(path))
  if (board) show(board)
}

export async function newBoard(): Promise<void> {
  const name = await useApp.getState().ask({ title: 'New Board', label: 'What’s it for? A game, an idea…', value: 'My Game', confirmLabel: 'Create' })
  if (!name?.trim()) return
  await flushSave()
  const board = await attempt(() => window.api.createBoard(name))
  if (board) show(board)
}

/** Saves and closes the open board, and shows the Boards screen. */
export async function goToBoards(): Promise<void> {
  await flushSave()
  useBoard.getState().unload()
  useApp.getState().setScreen('boards')
  void window.api.setLastBoard(null)
  await refreshBoards()
}

export async function renameBoard(path: string, current: string): Promise<void> {
  const name = await useApp.getState().ask({ title: 'Rename Board', value: current, confirmLabel: 'Rename' })
  if (!name?.trim() || name.trim() === current) return
  await attempt(() => window.api.renameBoard(path, name))
  await refreshBoards()
}

export async function trashBoard(path: string, name: string): Promise<void> {
  if (!confirm(`Move “${name}” to the Trash?\n\nYou can put it back from the Trash in Finder.`)) return
  await attempt(() => window.api.trashBoard(path))
  await refreshBoards()
}

export async function chooseRoot(): Promise<void> {
  const root = await attempt(() => window.api.chooseRoot())
  if (!root) return
  useApp.setState({ root })
  await refreshBoards()
}

// ---------- tabs ----------

/** Adds a tab after the current one, shows it, and returns its id (so its name can be edited). */
export function newTab(): string {
  const { doc, tabId, commit } = useBoard.getState()
  const id = crypto.randomUUID()
  commit(addTab(doc, { id, name: nextTabName(doc) }, tabIndex(doc, tabId) + 1), id)
  return id
}

/** Copies a tab, with everything on it, just after it, and shows the copy (looking where the original was). One undo step. */
export function duplicateTabNow(id: string): void {
  const { doc, views, commit, setView } = useBoard.getState()
  const tab = doc.tabs.find((t) => t.id === id)
  if (!tab) return
  const copy = crypto.randomUUID()
  commit(duplicateTab(doc, id, { id: copy, name: copyName(doc, tab.name) }, () => crypto.randomUUID()), copy)
  setView(copy, views[id] ?? DEFAULT_VIEW)
}

export function renameTabTo(id: string, name: string): void {
  const { doc, commit } = useBoard.getState()
  commit(renameTab(doc, id, name))
}

export function moveTabTo(id: string, index: number): void {
  const { doc, commit } = useBoard.getState()
  commit(moveTab(doc, id, index))
}

/** Deletes a tab, asking first unless it's still blank with the name it was given. */
export function deleteTab(id: string): void {
  const { doc, tabId, commit } = useBoard.getState()
  const tab = doc.tabs.find((t) => t.id === id)
  if (!tab || doc.tabs.length <= 1) return
  if (!isUntouched(tab)) {
    const n = tab.items.length
    const what = n ? ` and the ${count(n, 'item')} on it` : ''
    if (!confirm(`Delete the tab “${tab.name}”${what}?\n\nYou can undo this with ⌘Z.`)) return
  }
  commit(removeTab(doc, id), id === tabId ? neighbourTab(doc, id) : tabId)
  const after = useBoard.getState().doc
  // The message's Undo only applies while the deletion is still the latest change.
  const undoDelete = (): void => {
    if (useBoard.getState().doc === after) useBoard.getState().undo()
  }
  useApp.getState().toast(`Deleted “${tab.name}”`, { action: { label: 'Undo', run: undoDelete } })
}

/** Shows the next (1) or previous (-1) tab, wrapping round. */
export function cycleTab(dir: 1 | -1): void {
  const { doc, tabId, setTab } = useBoard.getState()
  const i = tabIndex(doc, tabId)
  setTab(doc.tabs[(i + dir + doc.tabs.length) % doc.tabs.length].id)
}
