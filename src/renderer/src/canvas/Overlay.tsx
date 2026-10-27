// Drawn over the board in screen pixels, so lines and handles stay the same size at any zoom:
// selection outlines and resize handles, arrow end handles, the drag-to-select box, guides,
// new-item outlines, and the arrow being drawn.

import type { Item, Rect, Shape, View } from '@shared/types'
import { arrowPoints, isArrow, pinsOf, type Lookup, type Pin } from '@/board/arrows'
import type { Handle } from '@/board/items'
import { boundsOf, type Point } from '@/lib/geometry'
import type { Guide } from './snap'
import { dotOnScreen } from './targets'
import { toScreen, type Size } from './view'

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Text items: corners make the words bigger or smaller; the sides change the width. */
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w']

export const handlesFor = (item: Shape): Handle[] => (item.type === 'text' ? TEXT_HANDLES : ALL_HANDLES)

/** A dot an arrow is about to be joined to. */
export interface ActiveDot {
  item: string
  pin: Pin
}

interface Props {
  view: View
  size: Size
  selected: Item[]
  lookup: Lookup
  editingId: string | null
  marquee: Rect | null
  ghost: Rect | null
  guides: Guide[]
  /** The item an arrow being drawn (or re-attached) would join. */
  target: Shape | null
  /** The arrow being drawn, from start to end. */
  drawing: Point[] | null
  /** Items showing their dots (for drawing arrows from, or joining them to). */
  dotted: Shape[]
  /** The dot an arrow would join if let go now. */
  activeDot: ActiveDot | null
}

export function Overlay({ view, size, selected, lookup, editingId, marquee, ghost, guides, target, drawing, dotted, activeDot }: Props) {
  const screen = (r: Rect): { left: number; top: number; width: number; height: number } => {
    const p = toScreen(view, size, r)
    return { left: p.x, top: p.y, width: r.w * view.zoom, height: r.h * view.zoom }
  }
  const at = (p: Point): string => {
    const s = toScreen(view, size, p)
    return `${s.x},${s.y}`
  }
  const shapes = selected.filter((i): i is Shape => !isArrow(i))
  const arrows = selected.filter(isArrow)
  const single = selected.length === 1 ? selected[0] : null
  const group = shapes.length > 1 ? boundsOf(shapes) : null

  return (
    <div className="overlay">
      <svg className="overlay-lines">
        {arrows.map((a) => (
          <polyline key={a.id} className="arrow-selected" data-id={a.id} points={arrowPoints(a, lookup).map(at).join(' ')} />
        ))}
        {drawing && <polyline className="arrow-drawing" points={drawing.map(at).join(' ')} />}
      </svg>
      {shapes.map((item) => (
        <div key={item.id} className="selection-outline" data-id={item.id} style={screen(item)} />
      ))}
      {group && <div className="selection-outline group" style={screen(group)} />}
      {target && <div className="attach-target" style={screen(target)} />}
      {single && !isArrow(single) && single.id !== editingId && (
        <div className="handles" style={screen(single)}>
          {handlesFor(single).map((h) => (
            <div key={h} className={`handle handle-${h}`} data-handle={h} />
          ))}
        </div>
      )}
      {single && isArrow(single) &&
        (() => {
          const points = arrowPoints(single, lookup)
          return (['from', 'to'] as const).map((end) => {
            const p = toScreen(view, size, end === 'from' ? points[0] : points[points.length - 1])
            return <div key={end} className={`end-handle ${single[end].item ? 'attached' : ''}`} data-end={end} style={{ left: p.x, top: p.y }} />
          })
        })()}
      {dotted.map((item) =>
        pinsOf(item).map((pin) => {
          const p = dotOnScreen(view, size, item, pin)
          const active = activeDot?.item === item.id && activeDot.pin.x === pin.x && activeDot.pin.y === pin.y
          return (
            <div
              key={`${item.id}:${pin.x},${pin.y}`}
              className={`dot ${active ? 'active' : ''}`}
              data-dot={`${pin.x},${pin.y}`}
              data-dot-item={item.id}
              style={{ left: p.x, top: p.y }}
            />
          )
        })
      )}
      {marquee && <div className="marquee" style={screen(marquee)} />}
      {ghost && <div className="ghost" style={screen(ghost)} />}
      {guides.map((g, k) => {
        const a = toScreen(view, size, g.axis === 'x' ? { x: g.at, y: g.from } : { x: g.from, y: g.at })
        const length = (g.to - g.from) * view.zoom
        return (
          <div
            key={k}
            className={`guide guide-${g.axis}`}
            style={g.axis === 'x' ? { left: a.x, top: a.y, height: length } : { left: a.x, top: a.y, width: length }}
          />
        )
      })}
    </div>
  )
}
