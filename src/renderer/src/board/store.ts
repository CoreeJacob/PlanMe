// The open board: its tabs and what's on them, where each tab is looking, and undo history.

import { create } from 'zustand'
import type { BoardDoc, OpenedBoard, View } from '@shared/types'
import { EMPTY_HISTORY, record, redo, undo, type History, type Step } from './history'

const NO_DOC: BoardDoc = { tabs: [] }
const NO_VIEWS: Record<string, View> = {}

// Which tab each board was last showing, so it reopens there. A convenience kept by the app,
// not part of the board's files.
const lastTabKey = (path: string): string => `planme.lastTab:${path}`

function lastTab(opened: OpenedBoard): string {
  try {
    const id = localStorage.getItem(lastTabKey(opened.path))
    if (id && opened.doc.tabs.some((t) => t.id === id)) return id
  } catch {
    // Storage unavailable: start on the first tab.
  }
  return opened.doc.tabs[0].id
}

function rememberTab(path: string | undefined, id: string): void {
  try {
    if (path && id) localStorage.setItem(lastTabKey(path), id)
  } catch {
    // Only a convenience; fine to lose.
  }
}

interface BoardState {
  /** The open board's name and folder, or null on the Boards screen. */
  board: { name: string; path: string } | null
  doc: BoardDoc
  views: Record<string, View>
  /** The tab showing. */
  tabId: string
  history: History

  load(opened: OpenedBoard): void
  unload(): void
  /** Applies a change that undo can step back from. `tabId` switches tab at the same time. */
  commit(doc: BoardDoc, tabId?: string): void
  setTab(id: string): void
  /** Where a tab is looking. Not an undo step: moving around isn't a change to the board. */
  setView(tabId: string, view: View): void
  undo(): void
  redo(): void
}

export const useBoard = create<BoardState>((set, get) => {
  /** Shows a step from history: its board, and its tab if that still exists. */
  const show = (step: Step, history: History): void => {
    const tabId = step.doc.tabs.some((t) => t.id === step.tabId) ? step.tabId : step.doc.tabs[0].id
    set({ doc: step.doc, tabId, history })
  }
  const current = (): Step => ({ doc: get().doc, tabId: get().tabId })

  return {
    board: null,
    doc: NO_DOC,
    views: NO_VIEWS,
    tabId: '',
    history: EMPTY_HISTORY,

    load: (opened) =>
      set({
        board: { name: opened.name, path: opened.path },
        doc: opened.doc,
        views: opened.views,
        tabId: lastTab(opened),
        history: EMPTY_HISTORY
      }),

    unload: () => set({ board: null, doc: NO_DOC, views: NO_VIEWS, tabId: '', history: EMPTY_HISTORY }),

    commit: (doc, tabId) => {
      if (doc === get().doc && (tabId === undefined || tabId === get().tabId)) return
      set({ doc, tabId: tabId ?? get().tabId, history: record(get().history, current()) })
    },

    setTab: (id) => {
      if (get().doc.tabs.some((t) => t.id === id)) set({ tabId: id })
    },

    setView: (tabId, view) => set({ views: { ...get().views, [tabId]: view } }),

    undo: () => {
      const result = undo(get().history, current())
      if (result) show(result.step, result.history)
    },

    redo: () => {
      const result = redo(get().history, current())
      if (result) show(result.step, result.history)
    }
  }
})

useBoard.subscribe((s, prev) => {
  if (s.tabId !== prev.tabId) rememberTab(s.board?.path, s.tabId)
})

export const selectTab = (s: BoardState) => s.doc.tabs.find((t) => t.id === s.tabId)
