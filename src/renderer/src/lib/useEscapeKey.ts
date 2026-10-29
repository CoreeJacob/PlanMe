import { useEffect, useRef } from 'react'

/** Calls `onEscape` when Escape is pressed anywhere in the window, while `active`. */
export function useEscapeKey(onEscape: () => void, active = true): void {
  const latest = useRef(onEscape)
  latest.current = onEscape
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
