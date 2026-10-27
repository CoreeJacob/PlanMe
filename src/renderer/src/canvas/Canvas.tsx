// A tab's endless canvas and everything on it.
//
// Moving around: scroll (two fingers on a trackpad), or drag with the Hand tool, with Space held,
// or with the middle mouse button. Zoom by pinching, with ⌘ and scroll, or with the corner buttons.
//
// With the Select tool: click an item to select it (Shift adds), drag across empty space to
// select what you cross, drag items to move them (they line up with others; hold ⌘ not to),
// drag a handle to resize, double-click to type. Drag from the dots round an item to draw an
// arrow; dropped on empty space, it builds a new item there (⌥ for just the arrow). With a note,
// text, shape or section tool: click to place one, or drag to choose its size.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DEFAULT_VIEW, type ArrowEnd, type ArrowItem, type BoardDoc, type Item, type Rect, type Shape } from '@shared/types'
import { useContextMenu, type MenuEntry } from '@/app/ContextMenu'
import { Icon } from '@/app/Icon'
import { isPlacingTool, useApp, type PlacingTool } from '@/app/store'
import { arrowPoints, boxOf, crossesBox, isArrow, isShape, lookupIn, nearestPin, pinPoint } from '@/board/arrows'
import { besideRect, itemsOf, moveItems, resizeRect, updateItems, type Handle } from '@/board/items'
import { drawingOrder, isSection, withContents } from '@/board/sections'
import { statusOf } from '@/board/statuses'
import { NO_SELECTION, selectTab, useBoard } from '@/board/store'
import { boundsOf, overlaps, rectFrom, within, type Point } from '@/lib/geometry'
import { useElementSize } from '@/lib/useElementSize'
import {
  addArrow,
  addConnected,
  addItem,
  bringSelectedToFront,
  deleteSelected,
  duplicateSelected,
  finishEditing,
  selectAll,
  sendSelectedToBack,
  setOnSelected,
  setStatusOnSelected,
  startEditing,
  tickEntry,
  viewport
} from './actions'
import { ArrowView } from './ArrowView'
import { ItemToolbar } from './ItemToolbar'
import { ItemView } from './ItemView'
import { palettesFor, paletteName, statusChoicesFor, statusValue } from './looks'
import { canJoin, currentView, itemById, onlySelected, setCurrentView, zoomReset, zoomStep } from './current'
import { useCanvasKeys, useClipboard } from './keys'
import { Overlay, type ActiveDot } from './Overlay'
import { snapMove, snapResize, type Guide } from './snap'
import { dotNear, endAt, endOnDot, shapeAround, shapeUnder } from './targets'
import { gridSpacing, panBy, toBoard, toScreen, zoomAt } from './view'

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

export function Canvas() {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  // Pasting needs to know how much of the board is on screen.
  useLayoutEffect(() => {
    viewport.width = size.width
    viewport.height = size.height
  }, [size])
  const items = useBoard((s) => selectTab(s)?.items ?? NO_ITEMS)
  const view = useBoard((s) => s.views[s.tabId] ?? DEFAULT_VIEW)
  const selectedIds = useBoard((s) => s.selected)
  const editingId = useBoard((s) => s.editingId)
  const editingPart = useBoard((s) => s.editingPart)
  const statuses = useBoard((s) => s.doc.statuses)
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

  useCanvasKeys(setSpaceDown, () => {
    if (!dragRef.current) return false
    cancelDrag()
    return true
  })
  useClipboard()

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

  /**
   * Where an arrow end being dragged would join: a dot if one's close, otherwise the item under
   * the pointer (choosing its side as things move), otherwise loose. Shows which.
   */
  const endUnderPointer = (e: { clientX: number; clientY: number }, p: Point, except: string | null): ArrowEnd => {
    const r = ref.current!.getBoundingClientRect()
    const dot = dotNear({ x: e.clientX - r.left, y: e.clientY - r.top }, currentView(), sizeRef.current, except)
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
    const found = shapeAround(boardPoint(e), currentView().zoom)
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
    if (target.closest('.item-editor, .todo-input')) return
    // A to-do list's tick box: tick it (keeping the list open if it's being typed in).
    const tick = target.closest<HTMLElement>('[data-tick]')
    const tickIn = tick?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (tick && tickIn) {
      e.preventDefault()
      if (useBoard.getState().editingId !== tickIn) finishEditing()
      tickEntry(tickIn, tick.dataset.tick!)
      return
    }
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
      const shape = itemById(dotItem.dataset.dotItem)
      const [x, y] = dotItem.dataset.dot!.split(',').map(Number)
      if (canJoin(shape)) {
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
    // The handles on the one selected item: an arrow's ends, or a shape's resize handles.
    const only = onlySelected()
    const end = target.closest<HTMLElement>('[data-end]')?.dataset.end as 'from' | 'to' | undefined
    if (end && only && isArrow(only)) {
      setDrag({ kind: 'arrowEnd', base: board.doc, arrow: only, end })
      return
    }
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    if (handle && only && isShape(only)) {
      setDrag({ kind: 'resize', start, base: board.doc, item: only, handle })
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
      // An arrow on its own with one loose end, picked up by its line: pull that end along, so it
      // can be joined to an item like dragging its end handle.
      const picked = onlySelected()
      if (picked && isArrow(picked) && !picked.from.item !== !picked.to.item) {
        const end = picked.from.item ? 'to' : 'from'
        const offset = { x: picked[end].x - start.x, y: picked[end].y - start.y }
        setDrag({ kind: 'arrowEnd', base: board.doc, arrow: picked, end, grab: { offset, startScreen: { x: e.clientX, y: e.clientY }, moving: false } })
        return
      }
      // A section takes whatever's inside it along.
      const items = itemsOf(board.doc, board.tabId)
      const ids = withContents(useBoard.getState().selected, items, lookupIn(items))
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
        updateItems(d.base, board.tabId, [d.item.id], (i) => {
          if (i.type === 'text') return { ...i, x: r.x, y: r.y, w: r.w, fontSize: corner ? Math.max(4, i.fontSize * scale) : i.fontSize }
          // A to-do list's height follows its lines: only its width changes.
          if (i.type === 'todo') return { ...i, x: r.x, w: r.w }
          return { ...i, ...r }
        })
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
      const home = itemById(d.from.item)
      if (d.fromDot && canJoin(home) && !d.to.item && dragged && !e.altKey) {
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
    // Double-click an item to type in it (in a to-do list, the line or title clicked), or empty
    // space for a new sticky note.
    const part = target.closest<HTMLElement>('[data-entry]')?.dataset.entry ?? (target.closest('.todo-head') ? 'title' : null)
    if (hit) startEditing(hit, part)
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
        { label: 'Add To-do List Here', icon: 'tasks', onSelect: () => addItem('todo', at) },
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
    // The same colour and status choices as the floating toolbar.
    for (const p of palettesFor(chosen)) {
      entries.push({ label: paletteName(p), submenu: p.choices.map((c) => ({ label: c.label, onSelect: () => setOnSelected(p.key, c.name) })) })
    }
    const statusChoices = statusChoicesFor(chosen, statuses)
    if (statusChoices) {
      entries.push({
        label: 'Status',
        icon: 'flag',
        submenu: [
          ...statusChoices.map((c) => ({ label: c.label.split(' — ')[0], onSelect: () => setStatusOnSelected(statusValue(c.value)) })),
          'separator' as const,
          { label: 'Edit Statuses…', onSelect: () => useApp.getState().setStatusEditorOpen(true) }
        ]
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
    : items.filter(
        (i): i is Shape =>
          canJoin(i) && (drawingArrow || (i.id !== editingId && (i.id === hovered || (selectedIds.length === 1 && selectedIds[0] === i.id))))
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
            <ItemView
              key={item.id}
              item={item}
              editing={item.id === editingId}
              part={item.id === editingId ? editingPart : null}
              status={statusOf(item, statuses)}
            />
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

      {selectedItems.length > 0 && !busy && <ItemToolbar view={view} size={size} items={selectedItems} lookup={lookup} editing={editingId !== null} statuses={statuses} />}

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
