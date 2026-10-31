// The app around the board: which screen is showing, the board list, the side panel, the tool,
// and pop-ups (messages and name prompts).

import { create } from 'zustand'
import type { BoardSummary, BoxShape, Theme, View } from '@shared/types'
import { readPref, writePref } from '@/lib/prefs'

export type Screen = 'loading' | 'boards' | 'board'
export type LowerPanel = 'tasks' | 'images' | 'groups'
export type Tool = 'select' | 'hand' | 'note' | 'text' | 'box' | 'arrow' | 'section' | 'todo' | 'image'
export type PlacingTool = Extract<Tool, 'note' | 'text' | 'box' | 'section' | 'todo' | 'image'>

/** Tools that place a new item where you click. */
export const isPlacingTool = (tool: Tool): tool is PlacingTool =>
  tool === 'note' || tool === 'text' || tool === 'box' || tool === 'section' || tool === 'todo' || tool === 'image'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
}

/** Where a link was followed from, for the Back chip: the tab, where it was looking, and the item. */
export interface BackSpot {
  tabId: string
  view: View
  itemId: string
}

export interface PromptRequest {
  id: number
  title: string
  label?: string
  value: string
  confirmLabel?: string
  resolve: (value: string | null) => void
}

interface AppState {
  screen: Screen
  /** The folder boards are kept in. */
  root: string
  boards: BoardSummary[]
  panelOpen: boolean
  tool: Tool
  /** The outline the Shape tool makes. */
  boxShape: BoxShape
  /** The tab whose name is being edited in the tab bar. */
  editingTab: string | null
  /** The board's statuses are being edited. */
  statusEditorOpen: boolean
  /** The Tasks panel shows only this status (an id), or everything. */
  taskFilter: string | null
  /** …and only things with this tag (an id), or any. */
  tagFilter: string | null
  /** Tags show as chips on the board (on every board). */
  showTags: boolean
  /** The board's tags are being edited. */
  tagEditorOpen: boolean
  /** The Details pane is showing, on the right. */
  detailsOpen: boolean
  /** While filtering, fade everything on the board that doesn't match. */
  dimRest: boolean
  /** The Done list at the bottom of the Tasks panel is open. */
  doneOpen: boolean
  /** Items that flash briefly: one just gone to (from the Tasks panel, search or a link), or ones changed from outside. */
  flashIds: readonly string[]
  /** What the side panel shows below the tools. */
  lowerPanel: LowerPanel
  /** In the Images part of the side panel: the board's own pictures, or the SpriteBuilder library. */
  picturesFrom: 'board' | 'sprites'
  /** The words being searched for (in the side panel, or the ⌘F box when the panel is hidden). */
  search: string
  /** The ⌘F box at the top of the board is open (only while the side panel is hidden). */
  findOpen: boolean
  /** Goes up by one each time ⌘F asks the side panel's search field to take the keyboard. */
  findRequest: number
  /** The items whose link is being chosen in the Link picker. */
  linking: string[] | null
  /** Where links were followed from, the latest last. */
  backStack: BackSpot[]
  /** Light, dark, or as the Mac is set. */
  theme: Theme
  /** The keyboard shortcuts sheet is showing. */
  shortcutsOpen: boolean
  /** The Backups dialog is showing: for one board (its name), or every board (''). */
  backupsFor: string | null
  toasts: Toast[]
  prompt: PromptRequest | null

  setScreen(screen: Screen): void
  setPanelOpen(open: boolean): void
  setTool(tool: Tool): void
  setBoxShape(shape: BoxShape): void
  setEditingTab(id: string | null): void
  setStatusEditorOpen(open: boolean): void
  setTaskFilter(filter: string | null): void
  setTagFilter(filter: string | null): void
  setShowTags(show: boolean): void
  setTagEditorOpen(open: boolean): void
  setDetailsOpen(open: boolean): void
  setDimRest(dim: boolean): void
  setDoneOpen(open: boolean): void
  flash(ids: readonly string[]): void
  setLowerPanel(which: LowerPanel): void
  setPicturesFrom(from: 'board' | 'sprites'): void
  setSearch(search: string): void
  setFindOpen(open: boolean): void
  /** ⌘F: the side panel's search field if the panel is showing, otherwise the box at the top of the board. */
  find(): void
  setLinking(ids: string[] | null): void
  pushBack(spot: BackSpot): void
  /** Takes the latest place off the Back list and returns it. */
  popBack(): BackSpot | undefined
  clearBack(): void
  setTheme(theme: Theme): void
  setShortcutsOpen(open: boolean): void
  setBackupsFor(board: string | null): void
  toast(message: string, options?: { kind?: Toast['kind']; action?: Toast['action'] }): void
  dismissToast(id: number): void
  /** Asks for a name; resolves with it, or null if cancelled. */
  ask(request: Omit<PromptRequest, 'id' | 'resolve'>): Promise<string | null>
  closePrompt(value: string | null): void
}

const PANEL_KEY = 'planme.panelOpen'
const DONE_KEY = 'planme.doneOpen'
const LOWER_KEY = 'planme.lowerPanel'
const PICTURES_KEY = 'planme.picturesFrom'
const TAGS_KEY = 'planme.showTags'
const DETAILS_KEY = 'planme.detailsOpen'
/** How long an item jumped to from the Tasks panel flashes. */
const FLASH_MS = 1600
/** How many places back the Back chip remembers. */
const BACK_LIMIT = 30

let nextToast = 1
let nextPrompt = 1

export const useApp = create<AppState>((set, get) => ({
  screen: 'loading',
  root: '',
  boards: [],
  panelOpen: readPref(PANEL_KEY) !== 'false',
  tool: 'select',
  boxShape: 'rect',
  editingTab: null,
  statusEditorOpen: false,
  taskFilter: null,
  tagFilter: null,
  showTags: readPref(TAGS_KEY) !== 'false',
  tagEditorOpen: false,
  detailsOpen: readPref(DETAILS_KEY) === 'true',
  dimRest: false,
  doneOpen: readPref(DONE_KEY) === 'true',
  flashIds: [],
  lowerPanel: (['images', 'groups'] as const).find((p) => p === readPref(LOWER_KEY)) ?? 'tasks',
  picturesFrom: readPref(PICTURES_KEY) === 'sprites' ? 'sprites' : 'board',
  search: '',
  findOpen: false,
  findRequest: 0,
  linking: null,
  backStack: [],
  theme: 'system',
  shortcutsOpen: false,
  backupsFor: null,
  toasts: [],
  prompt: null,

  setScreen: (screen) => set({ screen }),

  setPanelOpen: (panelOpen) => {
    // The ⌘F box is only for when the panel (with its own search field) is hidden.
    set({ panelOpen, findOpen: false })
    writePref(PANEL_KEY, String(panelOpen))
  },

  setTool: (tool) => set({ tool }),

  setBoxShape: (boxShape) => set({ boxShape }),

  setEditingTab: (editingTab) => set({ editingTab }),

  setStatusEditorOpen: (statusEditorOpen) => set({ statusEditorOpen }),

  setTaskFilter: (taskFilter) => set({ taskFilter }),

  setTagFilter: (tagFilter) => set({ tagFilter }),

  setShowTags: (showTags) => {
    set({ showTags })
    writePref(TAGS_KEY, String(showTags))
  },

  setTagEditorOpen: (tagEditorOpen) => set({ tagEditorOpen }),

  setDetailsOpen: (detailsOpen) => {
    set({ detailsOpen })
    writePref(DETAILS_KEY, String(detailsOpen))
  },

  setDimRest: (dimRest) => set({ dimRest }),

  setDoneOpen: (doneOpen) => {
    set({ doneOpen })
    writePref(DONE_KEY, String(doneOpen))
  },

  setPicturesFrom: (picturesFrom) => {
    set({ picturesFrom })
    writePref(PICTURES_KEY, picturesFrom)
  },

  setLowerPanel: (lowerPanel) => {
    set({ lowerPanel })
    writePref(LOWER_KEY, lowerPanel)
  },

  setSearch: (search) => set({ search }),

  setFindOpen: (findOpen) => set({ findOpen }),

  find: () => (get().panelOpen ? set({ findRequest: get().findRequest + 1 }) : set({ findOpen: true })),

  setLinking: (linking) => set({ linking }),

  pushBack: (spot) => set({ backStack: [...get().backStack, spot].slice(-BACK_LIMIT) }),

  popBack: () => {
    const spot = get().backStack.at(-1)
    if (spot) set({ backStack: get().backStack.slice(0, -1) })
    return spot
  },

  clearBack: () => set({ backStack: [] }),

  setTheme: (theme) => {
    set({ theme })
    void window.api.setTheme(theme)
  },

  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  setBackupsFor: (backupsFor) => set({ backupsFor }),

  flash: (ids) => {
    set({ flashIds: ids })
    setTimeout(() => get().flashIds === ids && set({ flashIds: [] }), FLASH_MS)
  },

  toast: (message, { kind = 'info', action } = {}) => {
    const id = nextToast++
    set({ toasts: [...get().toasts, { id, message, kind, action }] })
    setTimeout(() => get().dismissToast(id), action ? 6000 : 3500)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  ask: (request) =>
    new Promise((resolve) => {
      get().prompt?.resolve(null)
      set({ prompt: { ...request, id: nextPrompt++, resolve } })
    }),

  closePrompt: (value) => {
    get().prompt?.resolve(value)
    set({ prompt: null })
  }
}))

/** True while a dialog (a name prompt, the status editor, the Link picker…) is up, so the board's shortcuts wait. */
export const dialogOpen = (): boolean => {
  const { prompt, statusEditorOpen, tagEditorOpen, linking, shortcutsOpen, backupsFor } = useApp.getState()
  return !!prompt || statusEditorOpen || tagEditorOpen || !!linking || shortcutsOpen || backupsFor !== null
}

/** Runs an action, showing its error as a message instead of failing silently. Returns undefined on error. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
    useApp.getState().toast(message, { kind: 'error' })
    return undefined
  }
}
