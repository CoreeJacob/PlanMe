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
import { DEFAULT_VIEW, type ArrowEnd, type ArrowItem, type BoardDoc, type Item, type Rect, type Shape, type View } from '@shared/types'
import { NOTE_COLORS } from '@/app/colors'
import { useContextMenu, type MenuEntry } from '@/app/ContextMenu'
import { Icon } from '@/app/Icon'
import { isPlacingTool, useApp, type PlacingTool } from '@/app/store'
import { arrowPoints, boxOf, crossesBox, isArrow, isShape, lookupIn, nearestPin, pinPoint, pinsOf, type Pin } from '@/board/arrows'
import { besideRect, boundsOf, itemsOf, moveItems, overlaps, rectFrom, resizeRect, updateItems, type Handle } from '@/board/items'
import { drawingOrder, isSection, within, withContents } from '@/board/sections'
import { NO_SELECTION, selectTab, useBoard } from '@/board/store'
import { isTyping } from '@/lib/dom'
import { useElementSize } from '@/lib/useElementSize'
import {
  addArrow,
  addConnected,
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
import { ArrowView } from './ArrowView'
import { ItemToolbar } from './ItemToolbar'
import { ItemView } from './ItemView'
import { DOT_OFFSET, dotOnScreen, Overlay, type ActiveDot } from './Overlay'
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
  | { kind: 'place'; type: PlacingTool; start: Point; now: Point }
  /** Drawing an arrow. `fromDot`: started from an item's dot, so dropping on empty space builds a new item there. */
  | { kind: 'arrow'; from: ArrowEnd; start: Point; now: Point; to: ArrowEnd; fromDot: boolean }
  | {
      kind: 'arrowEnd'
      base: BoardDoc
      arrow: ArrowItem
      end: 'from' | 'to'
      /**
       * When the arrow was picked up by its line rather than its end handle: how far the end is
       * from the pointer (board units), and whether it has moved enough to count as a drag.
       */
      grab?: { offset: Point; startScreen: Point; moving: boolean }
    }
  | { kind: 'select'; start: Point; keep: string[] }
  | { kind: 'move'; start: Point; startScreen: Point; base: BoardDoc; ids: string[]; moving: boolean }
  | { kind: 'resize'; start: Point; base: BoardDoc; item: Shape; handle: Handle }

const NO_ITEMS: Item[] = []
const NO_SHAPES: Shape[] = []
const NO_GUIDES: Guide[] = []

/** The shape (not arrow) under a window point, skipping `except`. The canvas holds the pointer during a press, so look. */
function shapeUnder(x: number, y: number, except: string | null = null): Shape | null {
  const { doc, tabId } = useBoard.getState()
  const items = itemsOf(doc, tabId)
  for (const el of document.elementsFromPoint(x, y)) {
    const id = el.closest<HTMLElement | SVGElement>('[data-item-id]')?.dataset.itemId
    const item = id && id !== except ? items.find((i) => i.id === id) : undefined
    // Arrows join notes, text and shapes; sections are only backgrounds.
    if (item && isShape(item) && !isSection(item)) return item
  }
  return null
}

/** An arrow end at a board point: attached to `shape` if there is one, otherwise loose there. */
const endAt = (p: Point, shape: Shape | null): ArrowEnd => ({ item: shape?.id ?? null, x: p.x, y: p.y })

/** An arrow end pinned to one of an item's dots. */
const endOnDot = (shape: Shape, pin: Pin): ArrowEnd => ({ item: shape.id, ...pinPoint(shape, pin), pin })

/** How close (in screen pixels) the pointer must be to a dot for an arrow to snap to it. */
const DOT_SNAP = 14
/** How far outside an item (in screen pixels) the pointer can go and still show its dots. */
const DOT_REACH = DOT_OFFSET + 12

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
  const [target, setTarget] = useState<Shape | null>(null)
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const [activeDot, setActiveDot] = useState<ActiveDot | null>(null)
  /** The item under (or just around) the pointer, which shows its dots. */
  const [hovered, setHovered] = useState<string | null>(null)
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
    setTarget(null)
    setDrawing(null)
    setActiveDot(null)
  }

  /** The dot nearest the pointer (within DOT_SNAP), on any item but `except`. */
  const dotNear = (e: { clientX: number; clientY: number }, except: string | null): { shape: Shape; pin: Pin } | null => {
    const r = ref.current!.getBoundingClientRect()
    const at = { x: e.clientX - r.left, y: e.clientY - r.top }
    const { doc, tabId } = useBoard.getState()
    const view = currentView()
    let best: { shape: Shape; pin: Pin } | null = null
    let bestDistance = DOT_SNAP
    for (const shape of itemsOf(doc, tabId).filter(isShape)) {
      if (shape.id === except || isSection(shape)) continue
      for (const pin of pinsOf(shape)) {
        // Near the dot itself, or the spot on the edge it stands for.
        const dot = dotOnScreen(view, sizeRef.current, shape, pin)
        const edge = toScreen(view, sizeRef.current, pinPoint(shape, pin))
        const distance = Math.min(Math.hypot(dot.x - at.x, dot.y - at.y), Math.hypot(edge.x - at.x, edge.y - at.y))
        if (distance <= bestDistance) {
          best = { shape, pin }
          bestDistance = distance
        }
      }
    }
    return best
  }

  /**
   * Where an arrow end being dragged would join: a dot if one's close, otherwise the item under
   * the pointer (choosing its side as things move), otherwise loose. Shows which.
   */
  const endUnderPointer = (e: { clientX: number; clientY: number }, p: Point, except: string | null): ArrowEnd => {
    const dot = dotNear(e, except)
    if (dot) {
      setTarget(dot.shape)
      setActiveDot({ item: dot.shape.id, pin: dot.pin })
      return endOnDot(dot.shape, dot.pin)
    }
    const over = shapeUnder(e.clientX, e.clientY, except)
    setTarget(over)
    setActiveDot(null)
    return endAt(p, over)
  }

  /** Keeps track of which item the pointer is over (or just around), to show its dots. */
  const trackHover = (e: React.PointerEvent): void => {
    if ((tool !== 'select' && tool !== 'arrow') || spaceDown) return void setHovered(null)
    const p = boardPoint(e)
    const reach = DOT_REACH / currentView().zoom
    const { doc, tabId } = useBoard.getState()
    const shapes = itemsOf(doc, tabId).filter((i): i is Shape => isShape(i) && !isSection(i))
    // The top-most item the pointer is over, or close enough to reach its dots.
    let found: string | null = null
    for (let k = shapes.length - 1; k >= 0; k--) {
      const s = shapes[k]
      if (p.x >= s.x - reach && p.x <= s.x + s.w + reach && p.y >= s.y - reach && p.y <= s.y + s.h + reach) {
        found = s.id
        break
      }
    }
    if (found !== hovered) setHovered(found)
  }

  /** Escape during a drag puts things back as they were. */
  const cancelDrag = (): void => {
    const d = dragRef.current
    if (d?.kind === 'move' || d?.kind === 'resize' || d?.kind === 'arrowEnd') useBoard.getState().cancelGesture()
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
    // A dot around an item: drag from it to draw an arrow, with any tool that shows dots.
    const dotItem = target.closest<HTMLElement>('[data-dot]')
    if (dotItem) {
      const shape = itemsOf(board.doc, board.tabId).find((i) => i.id === dotItem.dataset.dotItem)
      const [x, y] = dotItem.dataset.dot!.split(',').map(Number)
      if (shape && isShape(shape)) {
        const from = endOnDot(shape, { x, y })
        setDrag({ kind: 'arrow', from, start, now: start, to: endAt(start, null), fromDot: true })
        return
      }
    }
    if (tool === 'arrow') {
      // Start on an item to attach the arrow to it, or on empty space for a loose end.
      const from = endAt(start, shapeUnder(e.clientX, e.clientY))
      setDrag({ kind: 'arrow', from, start, now: start, to: endAt(start, null), fromDot: false })
      return
    }

    // The round handle at either end of a selected arrow: drag it to attach that end elsewhere.
    const end = target.closest<HTMLElement>('[data-end]')?.dataset.end as 'from' | 'to' | undefined
    const selectedArrow = board.selected.length === 1 ? itemsOf(board.doc, board.tabId).find((i) => i.id === board.selected[0]) : undefined
    if (end && selectedArrow && isArrow(selectedArrow)) {
      setDrag({ kind: 'arrowEnd', base: board.doc, arrow: selectedArrow, end })
      return
    }

    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    const item = board.selected.length === 1 ? itemsOf(board.doc, board.tabId).find((i) => i.id === board.selected[0]) : undefined
    if (handle && item && isShape(item)) {
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
      const selected = useBoard.getState().selected
      // A section takes whatever's inside it along.
      const ids = withContents(selected, itemsOf(board.doc, board.tabId), lookupIn(itemsOf(board.doc, board.tabId)))
      // An arrow on its own with one loose end, picked up by its line: pull that end along, so it
      // can be joined to an item like dragging its end handle.
      const picked = selected.length === 1 ? itemsOf(board.doc, board.tabId).find((i) => i.id === selected[0]) : undefined
      if (picked && isArrow(picked) && !picked.from.item !== !picked.to.item) {
        const end = picked.from.item ? 'to' : 'from'
        const offset = { x: picked[end].x - start.x, y: picked[end].y - start.y }
        setDrag({ kind: 'arrowEnd', base: board.doc, arrow: picked, end, grab: { offset, startScreen: { x: e.clientX, y: e.clientY }, moving: false } })
        return
      }
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
    if (!d) return trackHover(e)
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
    } else if (d.kind === 'arrow') {
      const lookup = lookupIn(itemsOf(board.doc, board.tabId))
      let from = d.from
      // Swinging round behind the item it starts from: move the start to the dot facing the pointer,
      // so the arrow doesn't cut back across its own item.
      const home = from.item ? lookup(from.item) : undefined
      if (home && from.pin && crossesBox(pinPoint(home, from.pin), p, home)) from = endOnDot(home, nearestPin(home, p))
      const to = endUnderPointer(e, p, from.item)
      setDrag({ ...d, from, now: p, to })
      setDrawing(arrowPoints({ from, to, route: 'straight' }, lookup))
      // From a dot over empty space: outline where a new item will go (⌥ for just an arrow).
      setGhost(d.fromDot && home && !to.item && !e.altKey ? besideRect(home, p) : null)
    } else if (d.kind === 'arrowEnd') {
      const other = d.arrow[d.end === 'from' ? 'to' : 'from'].item
      let at = p
      let pointer: { clientX: number; clientY: number } = e
      if (d.grab) {
        // Picked up by the line: the end keeps its distance from the pointer, and looks for dots where it is.
        if (!d.grab.moving) {
          if (Math.hypot(e.clientX - d.grab.startScreen.x, e.clientY - d.grab.startScreen.y) < DRAG_START) return
          setDrag({ ...d, grab: { ...d.grab, moving: true } })
        }
        at = { x: p.x + d.grab.offset.x, y: p.y + d.grab.offset.y }
        pointer = { clientX: e.clientX + d.grab.offset.x * zoom, clientY: e.clientY + d.grab.offset.y * zoom }
      }
      const end = endUnderPointer(pointer, at, other)
      board.preview(updateItems(d.base, board.tabId, [d.arrow.id], (a) => ({ ...a, [d.end]: end })))
    } else if (d.kind === 'select') {
      const r = rectFrom(d.start.x, d.start.y, p.x, p.y)
      setMarquee(r)
      const all = itemsOf(board.doc, board.tabId)
      const lookup = lookupIn(all)
      // Anything the box touches, except sections, which it must go all the way round.
      const crossed = all.filter((i) => (isSection(i) ? within(i, r) : overlaps(boxOf(i, lookup), r))).map((i) => i.id)
      board.select([...d.keep, ...crossed.filter((id) => !d.keep.includes(id))])
    } else if (d.kind === 'move') {
      if (!d.moving) {
        if (Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y) < DRAG_START) return
        setDrag({ ...d, moving: true })
      }
      let dx = p.x - d.start.x
      let dy = p.y - d.start.y
      const baseShapes = itemsOf(d.base, board.tabId).filter(isShape)
      const moving = new Set(d.ids)
      // Line up by the shapes being moved (arrows follow them).
      const box = boundsOf(baseShapes.filter((i) => moving.has(i.id)))
      if (box && !e.metaKey) {
        const others = baseShapes.filter((i) => !moving.has(i.id))
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
        const others = itemsOf(d.base, board.tabId).filter((i): i is Shape => isShape(i) && i.id !== d.item.id)
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

  const onPointerUp = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'place') {
      const r = rectFrom(d.start.x, d.start.y, d.now.x, d.now.y)
      const zoom = currentView().zoom
      const dragged = r.w * zoom > DRAG_START || r.h * zoom > DRAG_START
      // A text item's height follows its words, so only the dragged width counts.
      addItem(d.type, dragged ? (d.type === 'text' ? { ...r, h: 30 } : r) : d.start, useApp.getState().boxShape)
      useApp.getState().setTool('select')
    } else if (d.kind === 'arrow' && e.type !== 'pointercancel') {
      const zoom = currentView().zoom
      const dragged = Math.hypot(d.now.x - d.start.x, d.now.y - d.start.y) * zoom > DRAG_START * 4
      const home = d.from.item ? itemsOf(useBoard.getState().doc, useBoard.getState().tabId).find((i) => i.id === d.from.item) : undefined
      if (d.fromDot && home && isShape(home) && !d.to.item && dragged && !e.altKey) {
        // Dropped on empty space from a dot: build a new item there, joined to this one.
        addConnected(home, d.from, besideRect(home, d.now))
      } else if (d.to.item || dragged) {
        // An arrow needs somewhere to go: another item, or a proper drag.
        addArrow(d.from, d.to)
      }
      useApp.getState().setTool('select')
    } else if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'arrowEnd') {
      useBoard.getState().endGesture()
    }
    endDrag()
  }

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (tool !== 'select' || spaceDown) return
    // The canvas holds on to the pointer during a press, so the event says it was on the canvas.
    // Look at what's really under the pointer.
    const target = document.elementFromPoint(e.clientX, e.clientY)
    // Handles (for resizing, or an arrow's ends) aren't empty space: no new note there.
    if (!target || target.closest('.item-editor, .zoom-controls, .item-toolbar, [data-handle], [data-end], [data-dot]')) return
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
        { label: 'Add Shape Here', icon: 'box', onSelect: () => addItem('box', at, useApp.getState().boxShape) },
        { label: 'Add Section Here', icon: 'section', onSelect: () => addItem('section', at) },
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
    const editLabel = isArrow(chosen[0]) ? 'Edit Label' : isSection(chosen[0]) ? 'Edit Title' : 'Edit Text'
    if (chosen.length === 1) entries.push({ label: editLabel, icon: 'rename', hint: '↩', onSelect: () => startEditing(hit) })
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
  // A press that hasn't become a drag yet (it may just be a click) doesn't count.
  const pressOnly = (drag?.kind === 'move' && !drag.moving) || (drag?.kind === 'arrowEnd' && drag.grab && !drag.grab.moving)
  const busy = drag !== null && drag.kind !== 'pan' && !pressOnly
  const cursor = drag?.kind === 'pan' ? 'panning' : tool === 'hand' || spaceDown ? 'can-pan' : isPlacingTool(tool) || tool === 'arrow' ? 'placing' : ''
  const lookup = lookupIn(items)
  // Dots show on every item while an arrow is being drawn or moved; otherwise on the item under
  // the pointer and the one selected (not while typing in it, or during other drags).
  const drawingArrow = drag?.kind === 'arrow' || (drag?.kind === 'arrowEnd' && !pressOnly)
  const dotsShow = (tool === 'select' || tool === 'arrow') && !spaceDown && (drawingArrow || !busy)
  const dotted = !dotsShow
    ? NO_SHAPES
    : drawingArrow
      ? items.filter((i): i is Shape => isShape(i) && !isSection(i))
      : items.filter(
          (i): i is Shape => isShape(i) && !isSection(i) && i.id !== editingId && (i.id === hovered || (selectedIds.length === 1 && selectedIds[0] === i.id))
        )

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
      onPointerLeave={() => !dragRef.current && setHovered(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onAuxClick={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.zoom})`, ['--zoom' as string]: view.zoom }}>
        {drawingOrder(items).map((item) =>
          isArrow(item) ? (
            <ArrowView
              key={item.id}
              arrow={item}
              from={item.from.item ? lookup(item.from.item) : undefined}
              to={item.to.item ? lookup(item.to.item) : undefined}
              editing={item.id === editingId}
            />
          ) : (
            <ItemView key={item.id} item={item} editing={item.id === editingId} />
          )
        )}
      </div>

      <Overlay
        view={view}
        size={size}
        selected={selectedItems}
        lookup={lookup}
        editingId={editingId}
        marquee={marquee}
        ghost={ghost}
        guides={guides}
        target={target}
        drawing={drawing}
        dotted={dotted}
        activeDot={activeDot}
      />

      {selectedItems.length > 0 && !busy && <ItemToolbar view={view} size={size} items={selectedItems} lookup={lookup} editing={editingId !== null} />}

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
