// A tab's endless canvas. Move around by scrolling (two fingers on a trackpad), by dragging
// with the Hand tool, with Space held, or with the middle mouse button. Zoom by pinching,
// with ⌘ and scroll, or with the buttons in the corner.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_VIEW, type View } from '@shared/types'
import { useApp } from '@/app/store'
import { Icon } from '@/app/Icon'
import { selectTab, useBoard } from '@/board/store'
import { isTyping } from '@/lib/dom'
import { useElementSize } from '@/lib/useElementSize'
import { gridSpacing, panBy, stepZoom, toScreen, zoomAt } from './view'

/** The current tab's view, read fresh (event handlers run between renders). */
function currentView(): View {
  const { views, tabId } = useBoard.getState()
  return views[tabId] ?? DEFAULT_VIEW
}

function setCurrentView(view: View): void {
  const { tabId, setView } = useBoard.getState()
  setView(tabId, view)
}

/** Zooms in or out a step, keeping the middle of the screen where it is. */
export function zoomStep(dir: 1 | -1): void {
  const view = currentView()
  setCurrentView({ ...view, zoom: stepZoom(view.zoom, dir) })
}

export function zoomReset(): void {
  setCurrentView({ ...currentView(), zoom: 1 })
}

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  const tab = useBoard(selectTab)
  const view = useBoard((s) => s.views[s.tabId] ?? DEFAULT_VIEW)
  const tool = useApp((s) => s.tool)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const sizeRef = useRef(size)
  sizeRef.current = size

  // Scrolling moves around; pinching (which arrives as scroll with Ctrl) or ⌘-scroll zooms.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const view = currentView()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        // Pinches give small steps and mouse wheels big ones; cap each so neither jumps.
        const delta = Math.max(-50, Math.min(50, e.deltaY))
        setCurrentView(zoomAt(view, sizeRef.current, { x: e.clientX - r.left, y: e.clientY - r.top }, view.zoom * Math.exp(-delta * 0.01)))
      } else {
        setCurrentView(panBy(view, -e.deltaX, -e.deltaY))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Holding Space turns any drag into moving around.
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTyping() || useApp.getState().prompt) return
      e.preventDefault()
      setSpaceDown(true)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    const blur = (): void => setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const last = useRef({ x: 0, y: 0 })
  const onPointerDown = (e: React.PointerEvent): void => {
    const pans = e.button === 1 || (e.button === 0 && (tool === 'hand' || spaceDown))
    if (!pans) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = { x: e.clientX, y: e.clientY }
    setPanning(true)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!panning) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    if (dx || dy) setCurrentView(panBy(currentView(), dx, dy))
  }
  // A drag ends only when the button comes up (or the system cancels it), never on a move.
  const endPan = (): void => setPanning(false)

  const origin = toScreen(view, size, { x: 0, y: 0 })
  const spacing = gridSpacing(view.zoom)
  const empty = !tab || tab.items.length === 0

  return (
    <div
      ref={ref}
      className={`canvas ${panning ? 'panning' : tool === 'hand' || spaceDown ? 'can-pan' : ''}`}
      data-view={`${view.x},${view.y},${view.zoom}`}
      style={{ backgroundSize: `${spacing}px ${spacing}px`, backgroundPosition: `${origin.x - spacing / 2}px ${origin.y - spacing / 2}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onAuxClick={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.zoom})` }} />

      {empty && (
        <div className="canvas-hint muted">
          Scroll to move around · pinch or ⌘-scroll to zoom · or hold Space and drag
        </div>
      )}

      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Zoom out (⌘−)" onClick={() => zoomStep(-1)}>
          <Icon name="minus" size={16} />
        </button>
        <button className="zoom-level" title="Actual size (⌘0)" onClick={zoomReset}>
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="icon-btn" title="Zoom in (⌘=)" onClick={() => zoomStep(1)}>
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  )
}
