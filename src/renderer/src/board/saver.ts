// Saves the open board shortly after each change, one save at a time. Only what changed is
// written (see changes.ts). Closing the window or the board waits for the last save.

import { changes, type Saved } from './changes'
import { useBoard } from './store'

const DELAY = 300

let saved: Saved | null = null
let path: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> = Promise.resolve()
let onError: (message: string) => void = console.error

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

/** Writes any unsaved changes now and resolves once they're on disk. */
export function flushSave(): Promise<void> {
  clearTimeout(timer)
  running = running.then(async () => {
    if (!saved || !path) return
    const { doc, views } = useBoard.getState()
    const next = { doc, views }
    const request = changes(saved, next)
    if (!request) return
    try {
      await window.api.saveBoard(path, request)
      saved = next
    } catch (err) {
      onError(`Couldn’t save: ${err instanceof Error ? err.message : String(err)}`)
      // Try again a little later; the changes are still in memory.
      timer = setTimeout(() => void flushSave(), 3000)
    }
  })
  return running
}
