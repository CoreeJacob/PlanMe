// The canvas's keys (Space to move around; ⇧1 and ⇧2 to zoom to fit; Escape, Delete, Return and
// the arrow keys for the selection) and copy, cut and paste. Text being typed keeps its own keys and clipboard.

import { useEffect, useRef } from 'react'
import { dialogOpen, useApp } from '@/app/store'
import { withGroupMates } from '@/board/groups'
import { itemsOf } from '@/board/items'
import { useBoard } from '@/board/store'
import { isTyping } from '@/lib/dom'
import { copySelected, deleteSelected, nudgeSelected, paste, startEditing } from './actions'
import { zoomToFit, zoomToSelection } from './current'

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** True while the board isn't taking keys: text is being typed, or a question is up. */
const keysElsewhere = (): boolean => isTyping() || dialogOpen()

/**
 * `onSpace` hears Space going down and up. `cancelDrag` is asked first on Escape, and says
 * whether there was a drag to cancel.
 */
export function useCanvasKeys(onSpace: (down: boolean) => void, cancelDrag: () => boolean): void {
  // The latest callbacks, without re-adding the listeners on every render.
  const latest = useRef({ onSpace, cancelDrag })
  latest.current = { onSpace, cancelDrag }

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (keysElsewhere()) return
      const { selected, select } = useBoard.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        latest.current.onSpace(true)
      } else if (e.key === 'Escape') {
        // Escape backs out one thing at a time: a drag, the tool, working inside a group, then the selection.
        if (latest.current.cancelDrag()) return
        if (useApp.getState().tool !== 'select') useApp.getState().setTool('select')
        else if (useBoard.getState().openGroup) {
          // Out of the group: what was picked inside it becomes the whole group again.
          const { selected: inside, doc, tabId, setOpenGroup } = useBoard.getState()
          setOpenGroup(null)
          select(withGroupMates(inside, itemsOf(doc, tabId), null))
        }
        else select([])
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selected.length) {
        e.preventDefault()
        void deleteSelected()
      } else if (e.key === 'Enter' && selected.length === 1) {
        e.preventDefault()
        startEditing(selected[0])
      } else if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
        // ⇧1: zoom to fit everything; ⇧2: zoom to the selection.
        e.preventDefault()
        if (e.code === 'Digit1') zoomToFit()
        else zoomToSelection()
      } else if (NUDGE[e.key] && selected.length && !e.metaKey) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudgeSelected(NUDGE[e.key][0] * step, NUDGE[e.key][1] * step)
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') latest.current.onSpace(false)
    }
    const blur = (): void => latest.current.onSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
}

/** Copy, cut and paste items. */
export function useClipboard(): void {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent): void => {
      if (!keysElsewhere() && e.clipboardData && copySelected(e.clipboardData)) e.preventDefault()
    }
    const onCut = (e: ClipboardEvent): void => {
      if (keysElsewhere() || !e.clipboardData || !copySelected(e.clipboardData)) return
      e.preventDefault()
      void deleteSelected()
    }
    const onPaste = (e: ClipboardEvent): void => {
      if (!keysElsewhere() && e.clipboardData && paste(e.clipboardData)) e.preventDefault()
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
}
