// Quick, styled tooltips for anything with a `title`, written as "Name — what it does (Key)".
// The title moves to `data-tip` on first hover so the slow native tooltip never shows.

import { useEffect, useState } from 'react'
import { parseTip, type TipText } from '@/lib/tips'

interface Tip extends TipText {
  x: number
  y: number
  side: 'above' | 'below' | 'right'
}

const DELAY_MS = 400
const EDGE = 160 // keep the tooltip's centre this far from the window's sides

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const hide = (): void => {
      clearTimeout(timer)
      current = null
      setTip(null)
    }

    const show = (el: HTMLElement): void => {
      if (!el.isConnected) return
      const parts = parseTip(el.dataset.tip ?? '')
      const rect = el.getBoundingClientRect()
      // The side panel's tools get their tooltip to the side, over the canvas.
      if (el.closest('.side-panel')) {
        setTip({ ...parts, x: rect.right + 8, y: rect.top + rect.height / 2, side: 'right' })
        return
      }
      const below = rect.top < 64
      setTip({
        ...parts,
        x: Math.min(Math.max(rect.left + rect.width / 2, EDGE), window.innerWidth - EDGE),
        y: below ? rect.bottom + 8 : rect.top - 8,
        side: below ? 'below' : 'above'
      })
    }

    const onOver = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null
      if (el === current) return
      hide()
      if (!el) return
      // React sets `title` again if the text changes, so always take the latest.
      if (el.title) {
        el.dataset.tip = el.title
        el.removeAttribute('title')
      }
      if (!el.dataset.tip) return
      current = el
      timer = setTimeout(() => show(el), DELAY_MS)
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide)
    document.addEventListener('wheel', hide, { passive: true })
    window.addEventListener('blur', hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('wheel', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!tip) return null
  return (
    <div className={`tooltip ${tip.side}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <div className="tooltip-head">
        <span className="tooltip-name">{tip.name}</span>
        {tip.shortcut && <kbd>{tip.shortcut}</kbd>}
      </div>
      {tip.detail && <div className="tooltip-detail">{tip.detail}</div>}
    </div>
  )
}
