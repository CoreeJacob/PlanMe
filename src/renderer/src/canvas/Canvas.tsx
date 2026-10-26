// A tab's endless canvas and everything on it.
//
// Moving around: scroll (two fingers on a trackpad), or drag with the Hand tool, with Space held,
// or with the middle mouse button. Zoom by pinching, with ⌘ and scroll, or with the corner buttons.
//
// With the Select tool: click an item to select it (Shift adds), drag across empty space to
// select what you cross, drag items to move them (they line up with others; hold ⌘ not to),
// drag a handle to resize, double-click to type. With a note, text or box tool: click to place
// one, or drag to choose its size.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_VIEW, type BoardDoc, type Item, type Rect, type View } from '@shared/types'
import { NOTE_COLORS } from '@/app/colors'
import { useContextMenu, type MenuEntry } from '@/app/ContextMenu'
import { Icon } from '@/app/Icon'
import { isPlacingTool, useApp } from '@/app/store'
import { boundsOf, itemsOf, moveItems, overlaps, rectFrom, resizeRect, updateItems, type Handle } from '@/board/items'
import { NO_SELECTION, selectTab, useBoard } from '@/board/store'
import { isTyping } from '@/lib/dom'
import { useElementSize } from '@/lib/useElementSize'
import {
  addItem,
  bringSelectedToFront,
  copySelected,
  deleteSelected,
  duplicateSelected,
  finishEditing,
  nudgeSelected,
  paste,
  selectAll,
  sendSelectedToBack,
  setOnSelected,
  startEditing,
  viewport
} from './actions'
import { ItemToolbar } from './ItemToolbar'
import { ItemView } from './ItemView'
import { Overlay } from './Overlay'
import { snapMove, snapResize, type Guide } from './snap'
import { gridSpacing, panBy, stepZoom, toBoard, toScreen, zoomAt, type Point } from './view'

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

/** How close (in screen pixels) things must be to line up, and to count as a drag rather than a click. */
const SNAP_DISTANCE = 6
const DRAG_START = 3

/** What a press on the canvas turned into. */
type Drag =
  | { kind: 'pan'; last: Point }
  | { kind: 'place'; type: Item['type']; start: Point; now: Point }
  | { kind: 'select'; start: Point; keep: string[] }
  | { kind: 'move'; start: Point; startScreen: Point; base: BoardDoc; ids: string[]; moving: boolean }
  | { kind: 'resize'; start: Point; base: BoardDoc; item: Item; handle: Handle }

const NO_ITEMS: Item[] = []
const NO_GUIDES: Guide[] = []

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  viewport.width = size.width
  viewport.height = size.height
  const items = useBoard((s) => selectTab(s)?.items ?? NO_ITEMS)
  const view = useBoard((s) => s.views[s.tabId] ?? DEFAULT_VIEW)
  const selectedIds = useBoard((s) => s.selected)
  const editingId = useBoard((s) => s.editingId)
  const tool = useApp((s) => s.tool)
  const [spaceDown, setSpaceDown] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [ghost, setGhost] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<Guide[]>(NO_GUIDES)
  const menu = useContextMenu()
  const sizeRef = useRef(size)
  sizeRef.current = size
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag

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

  // Keys: Space to pan; Escape, Delete, Return and the arrows for the selection.
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (isTyping() || useApp.getState().prompt) return
      const { selected } = useBoard.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        setSpaceDown(true)
      } else if (e.key === 'Escape') {
        if (dragRef.current) cancelDrag()
        else if (useApp.getState().tool !== 'select') useApp.getState().setTool('select')
        else useBoard.getState().select([])
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selected.length) {
        e.preventDefault()
        deleteSelected()
      } else if (e.key === 'Enter' && selected.length === 1) {
        e.preventDefault()
        startEditing(selected[0])
      } else if (e.key.startsWith('Arrow') && selected.length && !e.metaKey) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0]
        nudgeSelected(dx, dy)
      }
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

  // Copy, cut and paste items (text boxes keep their own).
  useEffect(() => {
    const busy = (): boolean => isTyping() || !!useApp.getState().prompt
    const onCopy = (e: ClipboardEvent): void => {
      if (busy() || !e.clipboardData) return
      if (copySelected(e.clipboardData)) e.preventDefault()
    }
    const onCut = (e: ClipboardEvent): void => {
      if (busy() || !e.clipboardData) return
      if (copySelected(e.clipboardData)) {
        e.preventDefault()
        deleteSelected()
      }
    }
    const onPaste = (e: ClipboardEvent): void => {
      if (busy() || !e.clipboardData) return
      if (paste(e.clipboardData)) e.preventDefault()
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

  /** A pointer position as a board point. */
  const boardPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current!.getBoundingClientRect()
    return toBoard(currentView(), sizeRef.current, { x: e.clientX - r.left, y: e.clientY - r.top })
  }

  const endDrag = (): void => {
    setDrag(null)
    setMarquee(null)
    setGhost(null)
    setGuides(NO_GUIDES)
  }

  /** Escape during a drag puts things back as they were. */
  const cancelDrag = (): void => {
    const d = dragRef.current
    if (d?.kind === 'move' || d?.kind === 'resize') useBoard.getState().cancelGesture()
    endDrag()
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    const target = e.target as Element
    const pans = e.button === 1 || (e.button === 0 && (tool === 'hand' || spaceDown))
    if (pans) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ kind: 'pan', last: { x: e.clientX, y: e.clientY } })
      return
    }
    if (e.button !== 0) return
    // Clicking inside the words being typed moves the caret, as usual.
    if (target.closest('.item-editor')) return
    finishEditing()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const board = useBoard.getState()
    const start = boardPoint(e)

    if (isPlacingTool(tool)) {
      setDrag({ kind: 'place', type: tool, start, now: start })
      return
    }

    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    const item = board.selected.length === 1 ? itemsOf(board.doc, board.tabId).find((i) => i.id === board.selected[0]) : undefined
    if (handle && item) {
      setDrag({ kind: 'resize', start, base: board.doc, item, handle })
      return
    }

    const hit = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (hit) {
      if (e.shiftKey) {
        // Shift-click adds to (or takes away from) the selection.
        if (board.selected.includes(hit)) return board.select(board.selected.filter((id) => id !== hit))
        board.select([...board.selected, hit])
      } else if (!board.selected.includes(hit)) {
        board.select([hit])
      }
      const ids = useBoard.getState().selected
      setDrag({ kind: 'move', start, startScreen: { x: e.clientX, y: e.clientY }, base: board.doc, ids, moving: false })
      return
    }

    // Empty space: drag across items to select them.
    const keep = e.shiftKey ? board.selected : NO_SELECTION
    if (!e.shiftKey) board.select([])
    setDrag({ kind: 'select', start, keep })
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      const dx = e.clientX - d.last.x
      const dy = e.clientY - d.last.y
      setDrag({ ...d, last: { x: e.clientX, y: e.clientY } })
      if (dx || dy) setCurrentView(panBy(currentView(), dx, dy))
      return
    }
    const p = boardPoint(e)
    const zoom = currentView().zoom
    const board = useBoard.getState()

    if (d.kind === 'place') {
      setDrag({ ...d, now: p })
      const r = rectFrom(d.start.x, d.start.y, p.x, p.y)
      setGhost(r.w * zoom > DRAG_START || r.h * zoom > DRAG_START ? r : null)
    } else if (d.kind === 'select') {
      const r = rectFrom(d.start.x, d.start.y, p.x, p.y)
      setMarquee(r)
      const crossed = itemsOf(board.doc, board.tabId)
        .filter((i) => overlaps(i, r))
        .map((i) => i.id)
      board.select([...d.keep, ...crossed.filter((id) => !d.keep.includes(id))])
    } else if (d.kind === 'move') {
      if (!d.moving) {
        if (Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y) < DRAG_START) return
        setDrag({ ...d, moving: true })
      }
      let dx = p.x - d.start.x
      let dy = p.y - d.start.y
      const baseItems = itemsOf(d.base, board.tabId)
      const moving = new Set(d.ids)
      const box = boundsOf(baseItems.filter((i) => moving.has(i.id)))
      if (box && !e.metaKey) {
        const others = baseItems.filter((i) => !moving.has(i.id))
        const snap = snapMove({ ...box, x: box.x + dx, y: box.y + dy }, others, SNAP_DISTANCE / zoom)
        dx += snap.dx
        dy += snap.dy
        setGuides(snap.guides)
      } else setGuides(NO_GUIDES)
      board.preview(moveItems(d.base, board.tabId, d.ids, dx, dy))
    } else if (d.kind === 'resize') {
      const isText = d.item.type === 'text'
      const corner = d.handle.length === 2
      // Text corners scale the words, so they keep the shape; Shift keeps it for anything.
      const keepShape = (isText && corner) || e.shiftKey
      let r = resizeRect(d.item, d.handle, p.x - d.start.x, p.y - d.start.y, keepShape)
      if (!keepShape && !e.metaKey) {
        const others = itemsOf(d.base, board.tabId).filter((i) => i.id !== d.item.id)
        const snap = snapResize(r, d.handle, others, SNAP_DISTANCE / zoom)
        r = snap.rect
        setGuides(snap.guides)
      } else setGuides(NO_GUIDES)
      const scale = r.w / d.item.w
      board.preview(
        updateItems(d.base, board.tabId, [d.item.id], (i) =>
          i.type === 'text' ? { ...i, x: r.x, y: r.y, w: r.w, fontSize: corner ? Math.max(4, i.fontSize * scale) : i.fontSize } : { ...i, ...r }
        )
      )
    }
  }

  const onPointerUp = (): void => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'place') {
      const r = rectFrom(d.start.x, d.start.y, d.now.x, d.now.y)
      const zoom = currentView().zoom
      const dragged = r.w * zoom > DRAG_START || r.h * zoom > DRAG_START
      // A text item's height follows its words, so only the dragged width counts.
      addItem(d.type, dragged ? (d.type === 'text' ? { ...r, h: 30 } : r) : d.start)
      useApp.getState().setTool('select')
    } else if (d.kind === 'move' || d.kind === 'resize') {
      useBoard.getState().endGesture()
    }
    endDrag()
  }

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (tool !== 'select' || spaceDown) return
    // The canvas holds on to the pointer during a press, so the event says it was on the canvas.
    // Look at what's really under the pointer.
    const target = document.elementFromPoint(e.clientX, e.clientY)
    if (!target || target.closest('.item-editor, .zoom-controls, .item-toolbar')) return
    const hit = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    // Double-click an item to type in it, or empty space for a new sticky note.
    if (hit) startEditing(hit)
    else addItem('note', boardPoint(e))
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    const target = e.target as Element
    if (target.closest('.item-editor')) return
    const board = useBoard.getState()
    const hit = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    const at = boardPoint(e)
    if (!hit) {
      finishEditing()
      menu.show(e.clientX, e.clientY, [
        { label: 'Add Sticky Note Here', icon: 'note', onSelect: () => addItem('note', at) },
        { label: 'Add Text Here', icon: 'text', onSelect: () => addItem('text', at) },
        { label: 'Add Box Here', icon: 'box', onSelect: () => addItem('box', at) },
        'separator',
        { label: 'Select All', hint: '⌘A', disabled: !items.length, onSelect: selectAll }
      ])
      return
    }
    if (!board.selected.includes(hit)) {
      finishEditing()
      board.select([hit])
    }
    const chosen = itemsOf(board.doc, board.tabId).filter((i) => useBoard.getState().selected.includes(i.id))
    const entries: MenuEntry[] = []
    if (chosen.length === 1) entries.push({ label: 'Edit Text', icon: 'rename', hint: '↩', onSelect: () => startEditing(hit) })
    if (chosen.every((i) => i.type === 'note')) {
      entries.push({
        label: 'Colour',
        submenu: NOTE_COLORS.map((c) => ({ label: c.label, onSelect: () => setOnSelected('color', c.name) }))
      })
    }
    entries.push(
      'separator',
      { label: 'Bring to Front', icon: 'toFront', hint: '⌘]', onSelect: bringSelectedToFront },
      { label: 'Send to Back', icon: 'toBack', hint: '⌘[', onSelect: sendSelectedToBack },
      { label: 'Duplicate', icon: 'copy', hint: '⌘D', onSelect: duplicateSelected },
      'separator',
      { label: 'Delete', icon: 'trash', hint: '⌫', danger: true, onSelect: deleteSelected }
    )
    menu.show(e.clientX, e.clientY, entries)
  }

  const origin = toScreen(view, size, { x: 0, y: 0 })
  const spacing = gridSpacing(view.zoom)
  const selectedItems = selectedIds.length ? items.filter((i) => selectedIds.includes(i.id)) : NO_ITEMS
  const busy = drag !== null && drag.kind !== 'pan' && !(drag.kind === 'move' && !drag.moving)
  const cursor = drag?.kind === 'pan' ? 'panning' : tool === 'hand' || spaceDown ? 'can-pan' : isPlacingTool(tool) ? 'placing' : ''

  return (
    <div
      ref={ref}
      className={`canvas ${cursor}`}
      data-view={`${view.x},${view.y},${view.zoom}`}
      style={{ backgroundSize: `${spacing}px ${spacing}px`, backgroundPosition: `${origin.x - spacing / 2}px ${origin.y - spacing / 2}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onAuxClick={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.zoom})`, ['--zoom' as string]: view.zoom }}>
        {items.map((item) => (
          <ItemView key={item.id} item={item} editing={item.id === editingId} />
        ))}
      </div>

      <Overlay view={view} size={size} selected={selectedItems} editingId={editingId} marquee={marquee} ghost={ghost} guides={guides} />

      {selectedItems.length > 0 && !busy && <ItemToolbar view={view} size={size} items={selectedItems} editing={editingId !== null} />}

      {items.length === 0 && (
        <div className="canvas-hint muted">
          Double-click to add a sticky note · scroll to move around · pinch or ⌘-scroll to zoom
        </div>
      )}

      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Zoom out (⌘−)" onClick={() => zoomStep(-1)}>
          <Icon name="minus" size={16} />
        </button>
        <button className="zoom-level" title="Actual size — back to 100% (⌘0)" onClick={zoomReset}>
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="icon-btn" title="Zoom in (⌘=)" onClick={() => zoomStep(1)}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {/* The menu sits inside the canvas, so keep its clicks from reaching the canvas too. */}
      <div onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {menu.element}
      </div>
    </div>
  )
}
