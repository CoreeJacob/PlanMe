// The tab showing: its items and where it's looking, read fresh from the store. Event handlers run
// between renders, so they use these rather than what the last render saw.

import { DEFAULT_VIEW, type Item, type Rect, type Shape, type View } from '@shared/types'
import { boxOf, isShape, lookupIn } from '@/board/arrows'
import { itemsOf } from '@/board/items'
import { isSection } from '@/board/sections'
import { useBoard } from '@/board/store'
import { boundsOf } from '@/lib/geometry'
import { clampZoom, stepZoom } from './view'

/** The canvas's size on screen, kept up to date by the Canvas (for placing pasted things). */
export const viewport = { width: 0, height: 0 }

export const currentItems = (): Item[] => {
  const { doc, tabId } = useBoard.getState()
  return itemsOf(doc, tabId)
}

export const itemById = (id: string | null | undefined): Item | undefined => (id ? currentItems().find((i) => i.id === id) : undefined)

/** The one selected item, if exactly one is selected. */
export const onlySelected = (): Item | undefined => {
  const { selected } = useBoard.getState()
  return selected.length === 1 ? itemById(selected[0]) : undefined
}

/** Things an arrow can be joined to: notes, text and shapes (sections are only backgrounds). */
export const canJoin = (item: Item | undefined): item is Shape => !!item && isShape(item) && !isSection(item)

export function currentView(): View {
  const { views, tabId } = useBoard.getState()
  return views[tabId] ?? DEFAULT_VIEW
}

export function setCurrentView(view: View): void {
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

/** Space (screen pixels) left round things zoomed to. */
const FIT_MARGIN = 64

/** Shows `area` as big as fits on screen, but no closer than 100%. Nothing (an empty tab): the middle, at 100%. */
export function zoomToShow(area: Rect | null): void {
  if (!area) return setCurrentView(DEFAULT_VIEW)
  const fit = Math.min((viewport.width - 2 * FIT_MARGIN) / Math.max(1, area.w), (viewport.height - 2 * FIT_MARGIN) / Math.max(1, area.h))
  setCurrentView({ x: area.x + area.w / 2, y: area.y + area.h / 2, zoom: clampZoom(Math.min(1, fit)) })
}

const boundsOfItems = (items: Item[]): Rect | null => {
  const lookup = lookupIn(currentItems())
  return boundsOf(items.map((i) => boxOf(i, lookup)))
}

/** ⇧1: everything on the tab. */
export function zoomToFit(): void {
  zoomToShow(boundsOfItems(currentItems()))
}

/** ⇧2: the selection (or everything, if nothing's selected). */
export function zoomToSelection(): void {
  const ids = new Set(useBoard.getState().selected)
  const chosen = currentItems().filter((i) => ids.has(i.id))
  zoomToShow(boundsOfItems(chosen.length ? chosen : currentItems()))
}

/** The board point in the middle of the screen. */
export function visibleMiddle(): { x: number; y: number } {
  const { x, y } = currentView()
  return { x, y }
}
