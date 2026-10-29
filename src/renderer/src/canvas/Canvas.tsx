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
import { DEFAULT_VIEW, type ArrowEnd, type ArrowItem, type BoardDoc, type ImportedImage, type Item, type Rect, type Shape } from '@shared/types'
import { useContextMenu, type MenuEntry } from '@/app/ContextMenu'
import { Icon } from '@/app/Icon'
import { isPlacingTool, useApp, type PlacingTool } from '@/app/store'
import { IMAGE_DRAG } from '@/app/ImagesPanel'
import { GROUP_DRAG } from '@/app/GroupsPanel'
import { copyBounds, groupOf, groupsOf, withGroupMates } from '@/board/groups'
import { useDimFilter } from '@/app/TasksPanel'
import { arrowPoints, boxOf, controlPoints, crossesBox, fractionAlong, isArrow, isShape, lookupIn, nearestPin, pinPoint } from '@/board/arrows'
import { scaleItems } from '@/board/arrange'
import { besideRect, isLocked, itemsOf, moveItems, resizeRect, updateItems, type Handle } from '@/board/items'
import { linkTarget, linkTip } from '@/board/links'
import { drawingOrder, isSection, movable } from '@/board/sections'
import { statusOf } from '@/board/statuses'
import { hasTag, tagsOf, tagState } from '@/board/tags'
import { NO_SELECTION, selectTab, useBoard } from '@/board/store'
import { boundsOf, overlaps, rectFrom, within, type Point } from '@/lib/geometry'
import { useElementSize } from '@/lib/useElementSize'
import {
  addArrow,
  addConnected,
  addItem,
  arrangeSelected,
  bringSelectedToFront,
  deleteSelected,
  duplicateSelected,
  finishEditing,
  followLink,
  groupSelected,
  placeGroupCopy,
  takeOutOfGroup,
  ungroupSelected,
  addSelectedToGroup,
  linkSelected,
  newTagForSelected,
  removeBend,
  selectAll,
  sendSelectedToBack,
  setLink,
  setOnSelected,
  setStatusOnSelected,
  showDetails,
  startEditing,
  tickEntry,
  toggleLockOnSelected,
  toggleTagOnSelected
} from './actions'
import { ArrowView } from './ArrowView'
import { addImageFiles, chooseImages, placeImages } from './images'
import { ItemToolbar } from './ItemToolbar'
import { ItemView } from './ItemView'
import { ALIGN_CHOICES, currentStatusChoice, palettesFor, paletteName, SPREAD_CHOICES, statusChoicesFor, statusValue } from './looks'
import { canJoin, currentView, itemById, onlySelected, setCurrentView, viewport, zoomReset, zoomStep, zoomToFit, zoomToSelection } from './current'
import { useCanvasKeys, useClipboard } from './keys'
import { Overlay, type ActiveDot } from './Overlay'
import { snapMove, snapResize, type Guide } from './snap'
import { dotNear, endAt, endOnDot, gripTarget, shapeAround, shapeUnder } from './targets'
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
  /** `from`: started on a locked item, so it only becomes a drag once the pointer has moved away from where it was pressed (screen point). */
  | { kind: 'select'; start: Point; keep: string[]; from?: Point }
  | { kind: 'move'; start: Point; startScreen: Point; base: BoardDoc; ids: string[]; moving: boolean }
  | { kind: 'resize'; start: Point; base: BoardDoc; item: Shape; handle: Handle }
  /**
   * Dragging a bend on an arrow (`index` among its bends), or a place to add one (`insert`), or a
   * right-angled arrow's middle run (`elbow`).
   */
  | { kind: 'bend'; base: BoardDoc; arrow: ArrowItem; index: number; insert: boolean; elbow: boolean; startScreen: Point; moving: boolean }
  /** Sliding an arrow's label along it. */
  | { kind: 'label'; base: BoardDoc; arrow: ArrowItem; startScreen: Point; moving: boolean }
  /** Resizing several things together, by a handle on the box round them all. */
  | { kind: 'groupResize'; start: Point; base: BoardDoc; box: Rect; ids: string[]; handle: Handle }

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
  const openGroup = useBoard((s) => s.openGroup)
  // Links can go to other tabs, so whether one still works depends on the whole board.
  const doc = useBoard((s) => s.doc)
  const dimFilter = useDimFilter()
  const showTags = useApp((s) => s.showTags)
  const flashIds = useApp((s) => s.flashIds)
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
  /** The item showing its move grip. */
  const [gripId, setGripId] = useState<string | null>(null)
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
    if ((tool !== 'select' && tool !== 'arrow') || spaceDown) {
      setHovered(null)
      setGripId(null)
      return
    }
    const p = boardPoint(e)
    const found = shapeAround(p, currentView().zoom)
    if (found !== hovered) setHovered(found)
    const grip = tool === 'select' ? gripTarget(p, currentView().zoom) : null
    if (grip !== gripId) setGripId(grip)
  }

  /** Escape during a drag puts things back as they were. */
  const cancelDrag = (): void => {
    const d = dragRef.current
    if (d && d.kind !== 'pan' && d.kind !== 'place' && d.kind !== 'arrow' && d.kind !== 'select') useBoard.getState().cancelGesture()
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
    // An item's status badge: pick its status right there.
    const badge = target.closest<HTMLElement>('[data-status-badge]')
    const badgeOf = itemById(badge?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)
    if (badge && badgeOf) {
      e.preventDefault()
      finishEditing()
      useBoard.getState().select([badgeOf.id])
      const r = badge.getBoundingClientRect()
      menu.show(r.left, r.bottom + 4, statusMenu([badgeOf]) ?? [])
      return
    }
    // An item's details badge: open the Details pane on it.
    const detailsOf = target.closest('[data-details-badge]')?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (detailsOf) {
      e.preventDefault()
      showDetails(detailsOf)
      return
    }
    // An item's link badge: follow the link.
    const linkBadge = target.closest<HTMLElement>('[data-link-badge]')
    const linkOf = linkBadge?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (linkBadge && linkOf) {
      e.preventDefault()
      finishEditing()
      followLink(linkOf)
      return
    }
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
    // A selected arrow's bends: drag one, or a place between them to add one.
    const bend = target.closest<HTMLElement>('[data-bend], [data-bend-add], [data-elbow]')
    if (bend && only && isArrow(only)) {
      const { bend: at, bendAdd } = bend.dataset
      const index = Number(at ?? bendAdd ?? 0)
      setDrag({ kind: 'bend', base: board.doc, arrow: only, index, insert: bendAdd !== undefined, elbow: 'elbow' in bend.dataset, startScreen: { x: e.clientX, y: e.clientY }, moving: false })
      return
    }
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    if (handle && only && isShape(only)) {
      setDrag({ kind: 'resize', start, base: board.doc, item: only, handle })
      return
    }
    // A handle on the box round several selected things: resize them together.
    const groupHandle = target.closest<HTMLElement>('[data-group-handle]')?.dataset.groupHandle as Handle | undefined
    if (groupHandle) {
      const items = itemsOf(board.doc, board.tabId)
      const box = boundsOf(items.filter((i): i is Shape => isShape(i) && !i.locked && board.selected.includes(i.id)))
      if (box) {
        setDrag({ kind: 'groupResize', start, base: board.doc, box, ids: movable(board.selected, items, lookupIn(items)), handle: groupHandle })
        return
      }
    }

    // An item's move grip, or the item itself.
    const hit = target.closest<HTMLElement>('[data-grip]')?.dataset.grip ?? target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    if (hit) {
      // A part of a linked group picks the whole copy, unless that copy is being worked inside.
      const tabItems = itemsOf(board.doc, board.tabId)
      if (board.openGroup && itemById(hit)?.group?.copy !== board.openGroup) board.setOpenGroup(null)
      const mates = withGroupMates([hit], tabItems, useBoard.getState().openGroup)
      if (e.shiftKey) {
        // Shift-click adds to (or takes away from) the selection.
        if (board.selected.includes(hit)) return board.select(board.selected.filter((id) => !mates.includes(id)))
        board.select([...board.selected, ...mates.filter((id) => !board.selected.includes(id))])
      } else if (mates.some((id) => !board.selected.includes(id))) {
        // (Including when only part of a group was selected, from working inside it.)
        board.select(mates)
      }
      // An arrow's label: slide it along the arrow.
      const labelled = itemById(hit)
      if (target.closest('.arrow-label') && labelled && isArrow(labelled) && !labelled.locked && !e.shiftKey) {
        board.select(mates)
        setDrag({ kind: 'label', base: board.doc, arrow: labelled, startScreen: { x: e.clientX, y: e.clientY }, moving: false })
        return
      }
      // A locked item doesn't move: dragging from it selects things across the board instead, as
      // if it were empty space (and a click just selects it).
      if (itemById(hit)?.locked) {
        if (!e.shiftKey) setDrag({ kind: 'select', start, keep: NO_SELECTION, from: { x: e.clientX, y: e.clientY } })
        return
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
      // A section takes whatever's inside it along; locked things stay put.
      const items = itemsOf(board.doc, board.tabId)
      const ids = movable(useBoard.getState().selected, items, lookupIn(items))
      setDrag({ kind: 'move', start, startScreen: { x: e.clientX, y: e.clientY }, base: board.doc, ids, moving: false })
      return
    }

    // Empty space: drag across items to select them.
    const keep = e.shiftKey ? board.selected : NO_SELECTION
    if (!e.shiftKey) {
      board.select([])
      board.setOpenGroup(null)
    }
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

    if (d.kind === 'place' && d.type !== 'image') {
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
      if (d.from) {
        if (Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < DRAG_START) return
        setDrag({ ...d, from: undefined })
      }
      const r = rectFrom(d.start.x, d.start.y, p.x, p.y)
      setMarquee(r)
      const all = itemsOf(board.doc, board.tabId)
      const lookup = lookupIn(all)
      // Anything the box touches, except sections, which it must go all the way round, and locked things.
      const crossed = all.filter((i) => !i.locked && (isSection(i) ? within(i, r) : overlaps(boxOf(i, lookup), r))).map((i) => i.id)
      const picked = withGroupMates(crossed, all, board.openGroup)
      board.select([...d.keep, ...picked.filter((id) => !d.keep.includes(id))])
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
    } else if (d.kind === 'bend' || d.kind === 'label') {
      if (!d.moving) {
        if (Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y) < DRAG_START) return
        setDrag({ ...d, moving: true })
      }
      const lookup = lookupIn(itemsOf(d.base, board.tabId))
      if (d.kind === 'label') {
        const labelAt = Math.round(fractionAlong(arrowPoints(d.arrow, lookup), p) * 1000) / 1000
        board.preview(updateItems(d.base, board.tabId, [d.arrow.id], (a) => ({ ...a, labelAt })))
        return
      }
      let at = p
      const bends = [...(d.arrow.bends ?? [])]
      if (!d.elbow) {
        // Lines up with the points either side (so a bend can square a line off), unless ⌘ is held.
        const points = controlPoints({ ...d.arrow, bends: d.insert ? [...bends.slice(0, d.index), p, ...bends.slice(d.index)] : bends }, lookup)
        const [before, after] = [points[d.index], points[d.index + 2]]
        const near = SNAP_DISTANCE / zoom
        if (!e.metaKey) {
          const x = [before.x, after.x].find((v) => Math.abs(v - p.x) < near)
          const y = [before.y, after.y].find((v) => Math.abs(v - p.y) < near)
          at = { x: x ?? p.x, y: y ?? p.y }
        }
      }
      if (d.elbow) bends.splice(0, bends.length, at)
      else if (d.insert) bends.splice(d.index, 0, at)
      else bends[d.index] = at
      board.preview(updateItems(d.base, board.tabId, [d.arrow.id], (a) => ({ ...a, bends })))
    } else if (d.kind === 'groupResize') {
      // Corners keep the shape (Shift stretches); sides stretch.
      const keepShape = d.handle.length === 2 && !e.shiftKey
      const to = resizeRect(d.box, d.handle, p.x - d.start.x, p.y - d.start.y, keepShape)
      board.preview(scaleItems(d.base, board.tabId, d.ids, d.box, to, keepShape))
    } else if (d.kind === 'resize') {
      const isText = d.item.type === 'text'
      const corner = d.handle.length === 2
      // Text corners scale the words, so they keep the shape; Shift keeps it for anything, except
      // a picture, which keeps its shape unless Shift is held to stretch it.
      const keepShape = d.item.type === 'image' ? !e.shiftKey : (isText && corner) || e.shiftKey
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
      useApp.getState().setTool('select')
      if (d.type === 'image') {
        // The Image tool: pick pictures to place where the board was clicked.
        void chooseImages(d.start)
      } else {
        const r = rectFrom(d.start.x, d.start.y, d.now.x, d.now.y)
        const zoom = currentView().zoom
        const dragged = r.w * zoom > DRAG_START || r.h * zoom > DRAG_START
        // A text item's height follows its words, so only the dragged width counts.
        addItem(d.type, dragged ? (d.type === 'text' ? { ...r, h: 30 } : r) : d.start, useApp.getState().boxShape)
      }
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
    } else if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'groupResize' || d.kind === 'arrowEnd' || d.kind === 'bend' || d.kind === 'label') {
      useBoard.getState().endGesture()
    }
    endDrag()
  }

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (tool !== 'select' || spaceDown) return
    // The canvas holds on to the pointer during a press, so the event says it was on the canvas.
    // Look at what's really under the pointer.
    const target = document.elementFromPoint(e.clientX, e.clientY)
    // Double-clicking a bend takes it out.
    const bend = target?.closest<HTMLElement>('[data-bend]')
    const only = onlySelected()
    if (bend && only && isArrow(only)) return removeBend(only.id, Number(bend.dataset.bend))
    // The places to add a bend sit on the line: double-clicking one labels the arrow, like the line.
    if (target?.closest('[data-bend-add], [data-elbow]') && only && isArrow(only)) return startEditing(only.id)
    // Handles (for resizing, or an arrow's ends) aren't empty space: no new note there.
    if (!target || target.closest('.item-editor, .zoom-controls, .item-toolbar, [data-handle], [data-end], [data-dot], [data-status-badge], [data-link-badge], [data-details-badge], [data-grip]')) return
    const hit = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
    // Double-click an item to type in it (in a to-do list, the line or title clicked), or empty
    // space for a new sticky note.
    const part = target.closest<HTMLElement>('[data-entry]')?.dataset.entry ?? (target.closest('.todo-head') ? 'title' : null)
    // A part of a linked group: work inside that copy, starting with typing in what was clicked.
    const copy = hit ? itemById(hit)?.group?.copy : undefined
    if (copy) useBoard.getState().setOpenGroup(copy)
    if (hit) startEditing(hit, part)
    else addItem('note', boardPoint(e))
  }

  /** The status choices for some items, as menu entries (the current one ticked), or null if they can't have one. */
  const statusMenu = (chosen: Item[]): MenuEntry[] | null => {
    const choices = statusChoicesFor(chosen, statuses)
    if (!choices) return null
    const current = currentStatusChoice(chosen)
    return [
      ...choices.map((c) => ({ label: c.label.split(' — ')[0], hint: c.value === current ? '✓' : undefined, onSelect: () => setStatusOnSelected(statusValue(c.value)) })),
      'separator' as const,
      { label: 'Edit Statuses…', onSelect: () => useApp.getState().setStatusEditorOpen(true) }
    ]
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
        { label: 'Add Image Here…', icon: 'image', onSelect: () => void chooseImages(at) },
        'separator',
        { label: 'Select All', hint: '⌘A', disabled: !items.length, onSelect: selectAll },
        { label: 'Zoom to Fit', icon: 'fit', hint: '⇧1', disabled: !items.length, onSelect: zoomToFit }
      ])
      return
    }
    if (!board.selected.includes(hit)) {
      finishEditing()
      board.select(withGroupMates([hit], itemsOf(board.doc, board.tabId), board.openGroup))
    }
    const chosen = itemsOf(board.doc, board.tabId).filter((i) => useBoard.getState().selected.includes(i.id))
    const entries: MenuEntry[] = []
    const editLabel = isArrow(chosen[0]) ? 'Edit Label' : isSection(chosen[0]) ? 'Edit Title' : 'Edit Text'
    if (chosen.length === 1) entries.push({ label: editLabel, icon: 'rename', hint: '↩', onSelect: () => startEditing(hit) })
    // The same colour and status choices as the floating toolbar.
    for (const p of palettesFor(chosen)) {
      entries.push({ label: paletteName(p), submenu: p.choices.map((c) => ({ label: c.label, onSelect: () => setOnSelected(p.key, c.name) })) })
    }
    const statusEntries = statusMenu(chosen)
    if (statusEntries) entries.push({ label: 'Status', icon: 'flag', submenu: statusEntries })
    if (chosen.some(isShape)) {
      const state = (id: string): string | undefined => ({ all: '✓', some: '–', none: undefined })[tagState(chosen, id)]
      entries.push({
        label: 'Tags',
        icon: 'tag',
        submenu: [
          ...tagsOf(board.doc).map((t) => ({ label: t.name, hint: state(t.id), onSelect: () => toggleTagOnSelected(t.id) })),
          ...(tagsOf(board.doc).length ? ['separator' as const] : []),
          { label: 'New Tag…', onSelect: () => void newTagForSelected() },
          { label: 'Edit Tags…', onSelect: () => useApp.getState().setTagEditorOpen(true) }
        ]
      })
      if (chosen.length === 1) entries.push({ label: 'Details', icon: 'details', hint: '⌘E', onSelect: () => showDetails(chosen[0].id) })
    }
    // Links (arrows can't have them).
    const linkable = chosen.filter(isShape)
    if (linkable.length) {
      const only = linkable.length === 1 ? linkable[0] : undefined
      const going = only?.link && linkTarget(board.doc, only.link)
      entries.push('separator')
      if (only && going) entries.push({ label: going.type === 'web' ? 'Open Link' : 'Follow Link', icon: going.type === 'web' ? 'reveal' : 'link', onSelect: () => followLink(only.id) })
      entries.push({ label: only?.link ? 'Change Link…' : 'Link to…', icon: 'link', hint: '⌘K', onSelect: linkSelected })
      if (linkable.some((i) => i.link)) entries.push({ label: 'Remove Link', onSelect: () => setLink(linkable.map((i) => i.id), null) })
    }
    const shapes = chosen.filter(isShape)
    const allLocked = chosen.every(isLocked)
    entries.push('separator')
    if (shapes.length > 1) {
      const arranging = [...ALIGN_CHOICES, ...(shapes.length > 2 ? SPREAD_CHOICES : [])]
      entries.push({ label: 'Align', icon: 'alignLeft', submenu: arranging.map((c) => ({ label: c.label.split(' — ')[0], icon: c.icon, onSelect: () => arrangeSelected(c.value) })) })
    }
    // Linked groups: make one, add to one, take out of one, or unlink a copy.
    const copies = new Set(chosen.flatMap((i) => (i.group ? [i.group.copy] : [])))
    const group = copies.size === 1 ? groupOf(board.doc, chosen.find((i) => i.group)) : undefined
    const loose = chosen.filter((i) => !i.group)
    if (loose.length) entries.push({ label: 'Make Group…', icon: 'group', hint: '⌘G', onSelect: () => void groupSelected() })
    if (group && loose.length) entries.push({ label: `Add to “${group.name}”`, icon: 'group', onSelect: addSelectedToGroup })
    if (group && board.openGroup && chosen.every((i) => i.group?.copy === board.openGroup)) {
      entries.push({ label: `Take Out of “${group.name}”`, onSelect: takeOutOfGroup })
    } else if (copies.size) {
      entries.push({ label: group && group.copies.length > 1 ? `Unlink from “${group.name}”` : 'Ungroup', hint: '⇧⌘G', onSelect: ungroupSelected })
    }
    entries.push(
      { label: allLocked ? 'Unlock' : 'Lock', icon: allLocked ? 'unlock' : 'lock', hint: '⇧⌘L', onSelect: toggleLockOnSelected },
      { label: 'Zoom to Selection', icon: 'fit', hint: '⇧2', onSelect: zoomToSelection },
      'separator',
      { label: 'Bring to Front', icon: 'toFront', hint: '⌘]', onSelect: bringSelectedToFront },
      { label: 'Send to Back', icon: 'toBack', hint: '⌘[', onSelect: sendSelectedToBack },
      { label: 'Duplicate', icon: 'copy', hint: '⌘D', onSelect: duplicateSelected },
      'separator',
      { label: 'Delete', icon: 'trash', hint: '⌫', danger: true, disabled: allLocked, onSelect: deleteSelected }
    )
    menu.show(e.clientX, e.clientY, entries)
  }

  /** How an item's link badge looks, and its hover text. */
  const linkProps = (item: Shape): { link?: 'go' | 'web' | 'broken'; linkTip?: string } => {
    if (!item.link) return {}
    const going = linkTarget(doc, item.link)
    return { link: !going ? 'broken' : going.type === 'web' ? 'web' : 'go', linkTip: linkTip(going) }
  }

  const origin = toScreen(view, size, { x: 0, y: 0 })
  const spacing = gridSpacing(view.zoom)
  const selectedItems = selectedIds.length ? items.filter((i) => selectedIds.includes(i.id)) : NO_ITEMS
  // A press that hasn't become a drag yet (it may just be a click) doesn't count.
  const pressOnly =
    ((drag?.kind === 'move' || drag?.kind === 'bend' || drag?.kind === 'label') && !drag.moving) || (drag?.kind === 'arrowEnd' && drag.grab && !drag.grab.moving)
  const busy = drag !== null && drag.kind !== 'pan' && !pressOnly
  const cursor = drag?.kind === 'pan' ? 'panning' : tool === 'hand' || spaceDown ? 'can-pan' : isPlacingTool(tool) || tool === 'arrow' ? 'placing' : ''
  const lookup = lookupIn(items)
  // The move grip shows on the item under the pointer, while nothing's being dragged or typed in it.
  const gripItem = gripId && !busy && tool === 'select' && !spaceDown && gripId !== editingId ? items.find((i) => i.id === gripId) : undefined
  const gripped = gripItem && isShape(gripItem) ? gripItem : null
  // Outlines round the copies of linked groups that are selected (or worked inside), with their names.
  const outlined = new Set(selectedItems.flatMap((i) => (i.group ? [i.group.copy] : [])))
  if (openGroup) outlined.add(openGroup)
  const groupOutlines = [...outlined].flatMap((copy) => {
    const rect = copyBounds(items, copy)
    const group = groupsOf(doc).find((g) => g.copies.some((c) => c.id === copy))
    return rect && group ? [{ copy, rect, name: group.name, open: copy === openGroup }] : []
  })
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
      onPointerLeave={() => {
        if (dragRef.current) return
        setHovered(null)
        setGripId(null)
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      // Pictures dropped from Finder (or another app) land where they're dropped.
      onDragOver={(e) => {
        if (!['Files', IMAGE_DRAG, GROUP_DRAG].some((type) => e.dataTransfer.types.includes(type))) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        // A picture from the Images panel: it's already in the board, so just place it.
        // A group from the Groups panel: a new linked copy, centred where it's dropped.
        const group = e.dataTransfer.getData(GROUP_DRAG)
        if (group) {
          e.preventDefault()
          placeGroupCopy(group, boardPoint(e))
          return
        }
        const fromPanel = e.dataTransfer.getData(IMAGE_DRAG)
        if (fromPanel) {
          e.preventDefault()
          void placeImages([JSON.parse(fromPanel) as ImportedImage], boardPoint(e))
          return
        }
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        void addImageFiles([...e.dataTransfer.files], boardPoint(e))
      }}
      onAuxClick={(e) => e.preventDefault()}
    >
      <div className="world" style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.zoom})`, ['--zoom' as string]: view.zoom }}>
        {drawingOrder(items).map((item) =>
          isArrow(item) ? (
            <ArrowView
              key={item.id}
              dimmed={!!dimFilter}
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
              dimmed={!!dimFilter && !((!dimFilter.status || statusOf(item, statuses)?.id === dimFilter.status) && hasTag(item, dimFilter.tag))}
              tags={showTags ? tagsOf(doc) : undefined}
              flashing={flashIds.includes(item.id)}
              {...linkProps(item)}
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
        gripped={gripped}
        groups={groupOutlines}
      />

      {selectedItems.length > 0 && !busy && <ItemToolbar view={view} size={size} items={selectedItems} lookup={lookup} editing={editingId !== null} statuses={statuses} tags={tagsOf(doc)} />}

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
        <button className="icon-btn" title="Zoom to fit — see everything on this tab (⇧1)" onClick={zoomToFit}>
          <Icon name="fit" size={16} />
        </button>
      </div>
      {/* The menu sits inside the canvas, so keep its clicks from reaching the canvas too. */}
      <div onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {menu.element}
      </div>
    </div>
  )
}
