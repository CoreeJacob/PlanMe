// The app around the board: which screen is showing, the board list, the side panel, the tool,
// and pop-ups (messages and name prompts).

import { create } from 'zustand'
import type { BoardSummary } from '@shared/types'

export type Screen = 'loading' | 'boards' | 'board'
export type Tool = 'select' | 'hand' | 'note' | 'text' | 'box' | 'arrow'
export type PlacingTool = Extract<Tool, 'note' | 'text' | 'box'>

/** Tools that place a new item where you click. */
export const isPlacingTool = (tool: Tool): tool is PlacingTool => tool === 'note' || tool === 'text' || tool === 'box'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
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
  /** The tab whose name is being edited in the tab bar. */
  editingTab: string | null
  toasts: Toast[]
  prompt: PromptRequest | null

  setScreen(screen: Screen): void
  setPanelOpen(open: boolean): void
  setTool(tool: Tool): void
  setEditingTab(id: string | null): void
  toast(message: string, options?: { kind?: Toast['kind']; action?: Toast['action'] }): void
  dismissToast(id: number): void
  /** Asks for a name; resolves with it, or null if cancelled. */
  ask(request: Omit<PromptRequest, 'id' | 'resolve'>): Promise<string | null>
  closePrompt(value: string | null): void
}

const PANEL_KEY = 'planme.panelOpen'

function readPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'false'
  } catch {
    return true
  }
}

let nextToast = 1
let nextPrompt = 1

export const useApp = create<AppState>((set, get) => ({
  screen: 'loading',
  root: '',
  boards: [],
  panelOpen: readPanelOpen(),
  tool: 'select',
  editingTab: null,
  toasts: [],
  prompt: null,

  setScreen: (screen) => set({ screen }),

  setPanelOpen: (panelOpen) => {
    set({ panelOpen })
    try {
      localStorage.setItem(PANEL_KEY, String(panelOpen))
    } catch {
      // Only a convenience; fine to lose.
    }
  },

  setTool: (tool) => set({ tool }),

  setEditingTab: (editingTab) => set({ editingTab }),

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
