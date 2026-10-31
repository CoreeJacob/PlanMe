// The open board: its tabs and what's on them, where each tab is looking, and undo history.

import { create } from 'zustand'
import type { BoardDoc, ImageMoves, OpenedBoard, View } from '@shared/types'
import { readPref, writePref } from '@/lib/prefs'
import { syncGroups, tidyGroups } from './groups'
import { EMPTY_HISTORY, record, redo, undo, type History, type Step } from './history'
import { remapDoc } from './images'
import { remapSprites } from './sprites'

const NO_DOC: BoardDoc = { tabs: [], statuses: [] }
const NO_VIEWS: Record<string, View> = {}

// Which tab each board was last showing, so it reopens there. A convenience kept by the app,
// not part of the board's files.
const lastTabKey = (path: string): string => `planme.lastTab:${path}`

function lastTab(opened: OpenedBoard): string {
  const id = readPref(lastTabKey(opened.path))
  return id && opened.doc.tabs.some((t) => t.id === id) ? id : opened.doc.tabs[0].id
}

function rememberTab(path: string | undefined, id: string): void {
  if (path && id) writePref(lastTabKey(path), id)
}

interface BoardState {
  /** The open board's name and folder, or null on the Boards screen. */
  board: { name: string; path: string } | null
  doc: BoardDoc
  views: Record<string, View>
  /** The tab showing. */
  tabId: string
  history: History
  /** Selected items on the tab showing. */
  selected: string[]
  /** The item whose words are being typed. */
  editingId: string | null
  /** Which part of it: a to-do list's title ('title') or one of its lines (the line's id). */
  editingPart: string | null
  /** The board as it was when the current drag or typing began, or null between them. */
  gesture: Step | null
  /** The copy of a linked group being worked inside (double-clicked into): its parts are picked one at a time. */
  openGroup: string | null

  load(opened: OpenedBoard): void
  unload(): void
  /** Applies a change that undo can step back from. `tabId` switches tab at the same time. */
  commit(doc: BoardDoc, tabId?: string): void
  setTab(id: string): void
  /** Where a tab is looking. Not an undo step: moving around isn't a change to the board. */
  setView(tabId: string, view: View): void
  undo(): void
  redo(): void

  select(ids: string[]): void
  setOpenGroup(copy: string | null): void
  setEditing(id: string | null, part?: string | null): void
  /**
   * A drag or a stretch of typing: `preview` shows each change as it happens, and `endGesture`
   * makes them all one undo step. `cancelGesture` puts things back as they were.
   */
  beginGesture(): void
  preview(doc: BoardDoc): void
  endGesture(): void
  cancelGesture(): void
  /** A change the app makes to keep things tidy (like a text item's height), not an undo step. */
  fixLayout(doc: BoardDoc): void
  /**
   * A change made to the board's files from outside PlanMe, already merged with what's in the app
   * (see merge.ts). One undo step. New tabs bring their views; if the tab showing went, the first shows.
   */
  applyOutside(doc: BoardDoc, views: Record<string, View>): void
  /**
   * Picture files moved: point the board at their new places, and every undo step too (so undo
   * never brings back a picture's old place). Not an undo step itself: the files have moved.
   */
  remapImages(moves: ImageMoves): void
  /** Sprites moved in the SpriteBuilder library (old path → new): the same, for them. */
  remapSprites(moves: Record<string, string>): void
}

export const NO_SELECTION: string[] = []

export const useBoard = create<BoardState>((set, get) => {
  /** Shows a step from history: its board, and its tab if that still exists. */
  const show = (step: Step, history: History): void => {
    const tabId = step.doc.tabs.some((t) => t.id === step.tabId) ? step.tabId : step.doc.tabs[0].id
    const items = new Set(step.doc.tabs.find((t) => t.id === tabId)?.items.map((i) => i.id))
    const selected = get().selected.filter((id) => items.has(id))
    set({ doc: step.doc, tabId, history, editingId: null, selected: tabId === get().tabId && selected.length ? selected : NO_SELECTION })
  }
  const current = (): Step => ({ doc: get().doc, tabId: get().tabId })
  /** Changes the board and every undo step the same way (for files that have moved: undo mustn't bring back their old places). */
  const rewriteEverywhere = (needed: boolean, rewrite: (doc: BoardDoc) => BoardDoc): void => {
    if (!needed) return
    const step = (s: Step): Step => ({ ...s, doc: rewrite(s.doc) })
    const { history, gesture } = get()
    set({ doc: rewrite(get().doc), history: { past: history.past.map(step), future: history.future.map(step) }, gesture: gesture && step(gesture) })
  }
  const cleared = { selected: NO_SELECTION, editingId: null, editingPart: null, gesture: null, openGroup: null }

  return {
    board: null,
    doc: NO_DOC,
    views: NO_VIEWS,
    tabId: '',
    history: EMPTY_HISTORY,
    ...cleared,

    load: (opened) =>
      set({
        board: { name: opened.name, path: opened.path },
        doc: tidyGroups(opened.doc),
        views: opened.views,
        tabId: lastTab(opened),
        history: EMPTY_HISTORY,
        ...cleared
      }),

    unload: () => set({ board: null, doc: NO_DOC, views: NO_VIEWS, tabId: '', history: EMPTY_HISTORY, ...cleared }),

    commit: (next, tabId) => {
      get().endGesture()
      if (next === get().doc && (tabId === undefined || tabId === get().tabId)) return
      // Every copy of a linked group follows a change to one of them.
      const doc = syncGroups(get().doc, next)
      const switching = tabId !== undefined && tabId !== get().tabId
      set({ doc, tabId: tabId ?? get().tabId, history: record(get().history, current()), ...(switching ? cleared : {}) })
    },

    setTab: (id) => {
      if (id === get().tabId || !get().doc.tabs.some((t) => t.id === id)) return
      get().endGesture()
      set({ tabId: id, ...cleared })
    },

    setView: (tabId, view) => set({ views: { ...get().views, [tabId]: view } }),

    undo: () => {
      get().endGesture()
      const result = undo(get().history, current())
      if (result) show(result.step, result.history)
    },

    redo: () => {
      get().endGesture()
      const result = redo(get().history, current())
      if (result) show(result.step, result.history)
    },

    select: (ids) => {
      const same = ids.length === get().selected.length && ids.every((id, k) => id === get().selected[k])
      if (!same) set({ selected: ids.length ? ids : NO_SELECTION })
    },

    setOpenGroup: (openGroup) => {
      if (openGroup !== get().openGroup) set({ openGroup })
    },

    setEditing: (editingId, part = null) => set({ editingId, editingPart: editingId ? part : null }),

    beginGesture: () => {
      if (!get().gesture) set({ gesture: current() })
    },

    preview: (doc) => {
      get().beginGesture()
      if (doc !== get().doc) set({ doc })
    },

    endGesture: () => {
      const before = get().gesture
      if (!before) return
      // A drag or typing in one copy of a linked group is made in the others when it's done.
      const doc = before.doc !== get().doc ? syncGroups(before.doc, get().doc) : get().doc
      set({ gesture: null, doc, ...(before.doc !== doc ? { history: record(get().history, before) } : {}) })
    },

    cancelGesture: () => {
      const before = get().gesture
      if (before) set({ doc: before.doc, gesture: null })
    },

    fixLayout: (doc) => {
      if (doc !== get().doc) set({ doc: syncGroups(get().doc, doc) })
    },

    applyOutside: (doc, views) => {
      const { tabId, selected } = get()
      const showing = doc.tabs.some((t) => t.id === tabId)
      get().commit(doc, showing ? undefined : doc.tabs[0].id)
      const fresh = Object.fromEntries(Object.entries(views).filter(([id]) => !get().views[id]))
      if (Object.keys(fresh).length) set({ views: { ...get().views, ...fresh } })
      // Things deleted outside can't stay selected.
      if (showing) {
        const here = new Set(doc.tabs.find((t) => t.id === tabId)!.items.map((i) => i.id))
        get().select(selected.filter((id) => here.has(id)))
      }
    },

    remapImages: (moves) => rewriteEverywhere(Object.keys(moves).length > 0, (doc) => remapDoc(doc, moves)),

    remapSprites: (moves) => rewriteEverywhere(Object.keys(moves).length > 0, (doc) => remapSprites(doc, moves))
  }
})

useBoard.subscribe((s, prev) => {
  if (s.tabId !== prev.tabId) rememberTab(s.board?.path, s.tabId)
})

export const selectTab = (s: BoardState) => s.doc.tabs.find((t) => t.id === s.tabId)
