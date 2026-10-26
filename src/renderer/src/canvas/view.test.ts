import { describe, expect, it } from 'vitest'
import { gridSpacing, MAX_ZOOM, MIN_ZOOM, panBy, stepZoom, toBoard, toScreen, zoomAt } from './view'

const size = { width: 800, height: 600 }

describe('view', () => {
  it('shows the view point at the middle of the screen', () => {
    const view = { x: 100, y: 50, zoom: 2 }
    expect(toScreen(view, size, { x: 100, y: 50 })).toEqual({ x: 400, y: 300 })
    expect(toScreen(view, size, { x: 110, y: 50 })).toEqual({ x: 420, y: 300 })
    expect(toBoard(view, size, { x: 420, y: 300 })).toEqual({ x: 110, y: 50 })
  })

  it('moves the board with the pointer when dragged', () => {
    const view = { x: 0, y: 0, zoom: 2 }
    const before = toScreen(view, size, { x: 30, y: 40 })
    const after = toScreen(panBy(view, 15, -10), size, { x: 30, y: 40 })
    expect(after).toEqual({ x: before.x + 15, y: before.y - 10 })
  })

  it('keeps the point under the pointer still while zooming', () => {
    const view = { x: 20, y: -30, zoom: 1 }
    const at = { x: 650, y: 120 }
    const under = toBoard(view, size, at)
    const zoomed = zoomAt(view, size, at, 2.5)
    expect(zoomed.zoom).toBe(2.5)
    const still = toBoard(zoomed, size, at)
    expect(still.x).toBeCloseTo(under.x)
    expect(still.y).toBeCloseTo(under.y)
  })

  it('keeps zoom within limits', () => {
    const view = { x: 0, y: 0, zoom: 1 }
    expect(zoomAt(view, size, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(view, size, { x: 0, y: 0 }, 0.001).zoom).toBe(MIN_ZOOM)
  })

  it('steps through the zoom levels from wherever it is', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })

  it('spreads the dots out when zoomed far out', () => {
    expect(gridSpacing(1)).toBe(24)
    expect(gridSpacing(0.25)).toBe(12)
    expect(gridSpacing(0.1)).toBeGreaterThanOrEqual(12)
  })
})
