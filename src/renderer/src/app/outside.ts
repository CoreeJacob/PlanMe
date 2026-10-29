// Changes made to the open board's files from outside PlanMe (say, by an assistant) show up
// while it's open: the board is read again and merged with what's in the app (see merge.ts),
// as one undo step. What changed flashes, and a message says where. While something is being
// dragged or typed, the change waits until that's finished.

import { useEffect } from 'react'
import { mergeOutside, type OutsideChange } from '@/board/merge'
import { flushSave, lastSaved, onChangedOutside } from '@/board/saver'
import { useBoard } from '@/board/store'
import { goToItem } from '@/canvas/actions'
import { count } from '@/lib/format'
import { useApp } from './store'

/** A change came in while busy; bring it in once not. */
let waiting = false
/** The last "couldn't read" message, so a broken file isn't reported on every change. */
let lastProblem = ''

const busy = (): boolean => {
  const { gesture, editingId } = useBoard.getState()
  return gesture !== null || editingId !== null
}

/** What came in, in words: "Level 1 (3 changes), new tab “Bosses”". */
function describe(change: OutsideChange): string {
  const names = new Map(change.doc.tabs.map((t) => [t.id, t.name]))
  const parts: string[] = []
  for (const [id, { changed, deleted }] of change.tabs) {
    if (change.addedTabs.includes(names.get(id) ?? '')) continue
    parts.push(`${names.get(id)} (${count(changed.length + deleted, 'change')})`)
  }
  parts.push(...change.addedTabs.map((n) => `new tab “${n}”`), ...change.removedTabs.map((n) => `removed tab “${n}”`))
  if (change.tabList) parts.push('tab names')
  if (change.statuses) parts.push('statuses')
  if (change.tags) parts.push('tags')
  return parts.join(', ')
}

async function bringIn(): Promise<void> {
  const path = useBoard.getState().board?.path
  if (!path) return
  if (busy()) {
    waiting = true
    return
  }
  waiting = false
  let fresh
  try {
    fresh = await window.api.readBoard(path)
    lastProblem = ''
  } catch (err) {
    // Most likely still being written: the next change brings it in. Say so once.
    const problem = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
    if (problem !== lastProblem) useApp.getState().toast(`A change made outside PlanMe couldn’t be read yet (${problem}). It’ll show up once it’s fixed.`, { kind: 'error' })
    lastProblem = problem
    return
  }
  const board = useBoard.getState()
  if (board.board?.path !== path) return
  if (busy()) {
    waiting = true
    return
  }
  const change = mergeOutside(lastSaved() ?? board.doc, board.doc, fresh.doc)
  // Changes made in the app may have been held back from saving until now. (Not waited for:
  // this can run inside a save.)
  void flushSave()
  if (!change) return
  board.applyOutside(change.doc, fresh.views)

  // Show what changed: it flashes, and the message can take you to it on another tab.
  const changed = [...change.tabs.entries()].flatMap(([tabId, t]) => t.changed.map((id) => ({ tabId, id })))
  useApp.getState().flash(changed.map((c) => c.id))
  const elsewhere = changed.find((c) => c.tabId !== useBoard.getState().tabId)
  const here = changed.some((c) => c.tabId === useBoard.getState().tabId)
  useApp.getState().toast(`Updated from outside: ${describe(change)}`, {
    action: elsewhere && !here ? { label: 'Show', run: () => goToItem(elsewhere.tabId, elsewhere.id) } : undefined
  })
}

/** Keeps the open board in step with changes made to its files from outside PlanMe. */
export function useOutsideChanges(): void {
  const board = useBoard((s) => s.board?.path)
  useEffect(() => {
    if (!board) return
    void window.api.watchBoard(board)
    onChangedOutside(bringIn)
    const off = window.api.onBoardChangedOutside(() => void bringIn())
    // A change that waited for a drag or typing to finish.
    const unsubscribe = useBoard.subscribe((s, prev) => {
      const wasBusy = prev.gesture !== null || prev.editingId !== null
      if (waiting && wasBusy && !busy()) void bringIn()
    })
    return () => {
      off()
      unsubscribe()
      waiting = false
      void window.api.watchBoard(null)
    }
  }, [board])
}
