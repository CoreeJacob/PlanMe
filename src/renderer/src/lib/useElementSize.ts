import { useLayoutEffect, useState, type RefObject } from 'react'

/** An element's width and height on screen, kept up to date as it resizes. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const { width, height } = el.getBoundingClientRect()
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}
