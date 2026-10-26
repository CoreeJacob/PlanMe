import { describe, expect, it } from 'vitest'
import { snapMove, snapResize } from './snap'

const other = { x: 100, y: 100, w: 100, h: 100 }

describe('lining up while moving', () => {
  it('lines up edges that come close, with a guide spanning both', () => {
    const { dx, dy, guides } = snapMove({ x: 104, y: 300, w: 50, h: 50 }, [other], 6)
    expect(dx).toBe(-4)
    expect(dy).toBe(0)
    expect(guides).toEqual([{ axis: 'x', at: 100, from: 100, to: 350 }])
  })

  it('lines up middles too, and both directions at once', () => {
    const { dx, dy } = snapMove({ x: 127, y: 205, w: 50, h: 50 }, [other], 6)
    // Middle 152 → 150, top 205 → bottom edge 200.
    expect(dx).toBe(-2)
    expect(dy).toBe(-5)
  })

  it('leaves things alone when nothing is close', () => {
    expect(snapMove({ x: 400, y: 400, w: 50, h: 50 }, [other], 6)).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('picks the closest line-up', () => {
    const near = { x: 300, y: 0, w: 10, h: 10 }
    expect(snapMove({ x: 296, y: 500, w: 10, h: 10 }, [other, { ...near, x: 298 }], 6).dx).toBe(2)
  })
})

describe('lining up while resizing', () => {
  it('moves only the side being dragged', () => {
    const { rect, guides } = snapResize({ x: 0, y: 300, w: 197, h: 50 }, 'e', [other], 6)
    expect(rect).toEqual({ x: 0, y: 300, w: 200, h: 50 })
    expect(guides[0]).toMatchObject({ axis: 'x', at: 200 })
  })

  it('pulls the left or top side with the opposite side staying put', () => {
    const { rect } = snapResize({ x: 97, y: 96, w: 50, h: 50 }, 'nw', [other], 6)
    expect(rect).toEqual({ x: 100, y: 100, w: 47, h: 46 })
  })
})
