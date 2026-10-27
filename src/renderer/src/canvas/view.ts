// Moving around and zooming. A view is the board point shown at the centre of the screen,
// plus the zoom; `size` is the canvas's width and height on screen.

import type { View } from '@shared/types'
import type { Point } from '@/lib/geometry'

export type Size = { width: number; height: number }

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
/** The zoom levels the + and − buttons step through. */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export function toScreen(view: View, size: Size, p: Point): Point {
  return { x: (p.x - view.x) * view.zoom + size.width / 2, y: (p.y - view.y) * view.zoom + size.height / 2 }
}

export function toBoard(view: View, size: Size, p: Point): Point {
  return { x: (p.x - size.width / 2) / view.zoom + view.x, y: (p.y - size.height / 2) / view.zoom + view.y }
}

/** Moves the view as if the board were dragged by (dx, dy) screen pixels. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x - dx / view.zoom, y: view.y - dy / view.zoom }
}

/** Zooms to `zoom`, keeping the board point under `at` (a screen point) where it is. */
export function zoomAt(view: View, size: Size, at: Point, zoom: number): View {
  const next = clampZoom(zoom)
  if (next === view.zoom) return view
  const fixed = toBoard(view, size, at)
  return {
    zoom: next,
    x: fixed.x - (at.x - size.width / 2) / next,
    y: fixed.y - (at.y - size.height / 2) / next
  }
}

/** The next zoom step in (dir 1) or out (dir -1) from `zoom`. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom + 1e-6) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1e-6) ?? MIN_ZOOM
}

/**
 * The dot grid's spacing on screen. Dots are 24 board units apart, doubling while they would
 * be closer than 12 screen pixels, so zooming far out doesn't turn the grid into a grey wash.
 */
export function gridSpacing(zoom: number): number {
  let spacing = 24 * zoom
  while (spacing < 12) spacing *= 2
  return spacing
}
