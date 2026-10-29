// Which of bold, italic and underline are on where the caret is, while typing (so the B, I and
// U buttons can look pressed).

import { useCallback, useEffect, useState } from 'react'
import type { TextStyle } from '@/board/richtext'

const NO_STYLES: Record<TextStyle, boolean> = { b: false, i: false, u: false }

/** While typing: which of bold, italic and underline are on where the caret is (and a way to look again). */
export function useCaretStyles(editing: boolean): [Record<TextStyle, boolean>, () => void] {
  const [styles, setStyles] = useState(NO_STYLES)
  const read = useCallback(() => {
    const next = { b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline') }
    setStyles((s) => (s.b === next.b && s.i === next.i && s.u === next.u ? s : next))
  }, [])
  useEffect(() => {
    if (!editing) return
    read()
    // The caret moving, or typing (⌘B with nothing picked changes what comes next, not the selection).
    for (const type of ['selectionchange', 'keyup', 'input']) document.addEventListener(type, read)
    return () => {
      for (const type of ['selectionchange', 'keyup', 'input']) document.removeEventListener(type, read)
    }
  }, [editing, read])
  return [styles, read]
}

