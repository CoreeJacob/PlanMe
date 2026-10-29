// Saves the open board shortly after each change, one save at a time. Only what changed is
// written (see changes.ts). Closing the window or the board waits for the last save.

import type { BoardDoc } from '@shared/types'
import { changes, type Saved } from './changes'
import { useBoard } from './store'

const DELAY = 300

let saved: Saved | null = null
let path: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> = Promise.resolve()
let onError: (message: string) => void = console.error
let bringInOutside: () => Promise<void> = async () => {}

/** What to do when a save finds the files changed outside PlanMe: bring that change in (keeping what's in the app). */
export function onChangedOutside(bringIn: () => Promise<void>): void {
  bringInOutside = bringIn
}

/** Starts saving changes to the board that was just loaded. */
export function startSaving(report: (message: string) => void): () => void {
  onError = report
  const take = (): void => {
    const { board, doc, views } = useBoard.getState()
    path = board?.path ?? null
    saved = board ? { doc, views } : null
  }
  take()
  return useBoard.subscribe((s, prev) => {
    if (s.board?.path !== prev.board?.path) {
      // A different board was loaded: what's in memory is what's on disk.
      clearTimeout(timer)
      take()
    } else if (s.doc !== prev.doc || s.views !== prev.views) {
      clearTimeout(timer)
      timer = setTimeout(() => void flushSave(), DELAY)
    }
  })
}

/** The board as it was last saved (what's on disk, as far as PlanMe knows). */
export const lastSaved = (): BoardDoc | null => saved?.doc ?? null

/** Writes any unsaved changes now and resolves once they're on disk. */
export function flushSave(): Promise<void> {
  clearTimeout(timer)
  running = running.then(async () => {
    try {
      // If the files changed outside PlanMe, that's brought in first (merged with what's in the
      // app) and then it's all saved.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!saved || !path) return
        const { doc, views } = useBoard.getState()
        const next = { doc, views }
        const request = changes(saved, next)
        if (!request) return
        if ((await window.api.saveBoard(path, request)) === 'saved') {
          saved = next
          return
        }
        await bringInOutside()
      }
    } catch (err) {
      onError(`Couldn’t save: ${err instanceof Error ? err.message : String(err)}`)
      // Try again a little later; the changes are still in memory.
      timer = setTimeout(() => void flushSave(), 3000)
    }
  })
  return running
}
