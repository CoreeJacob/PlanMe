// Undo and redo. A step remembers the whole board as it was (cheap, because unchanged tabs are
// shared between versions) and which tab was showing, so undo can take you back to it.

import type { BoardDoc } from '@shared/types'

export interface Step {
  doc: BoardDoc
  tabId: string
}

export interface History {
  past: Step[]
  future: Step[]
}

export const LIMIT = 500
export const EMPTY_HISTORY: History = { past: [], future: [] }

/** Remembers `before` as the state to undo back to. Anything that could be redone is dropped. */
export function record(history: History, before: Step): History {
  return { past: [...history.past, before].slice(-LIMIT), future: [] }
}

/** Steps back: returns the state to show and the updated history, or null if there's nothing to undo. */
export function undo(history: History, current: Step): { step: Step; history: History } | null {
  const step = history.past.at(-1)
  if (!step) return null
  return { step, history: { past: history.past.slice(0, -1), future: [...history.future, current] } }
}

export function redo(history: History, current: Step): { step: Step; history: History } | null {
  const step = history.future.at(-1)
  if (!step) return null
  return { step, history: { past: [...history.past, current], future: history.future.slice(0, -1) } }
}
