// Drawn over the board in screen pixels, so lines and handles stay the same size at any zoom:
// selection outlines and resize handles (for one item, or a box round several), arrow end handles, the drag-to-select box, guides,
// new-item outlines, and the arrow being drawn.

import type { Item, Rect, Shape, View } from '@shared/types'
import { arrowPoints, bendHandles, isArrow, pinsOf, pointAlong, type Lookup, type Pin } from '@/board/arrows'
import { plainText } from '@/board/richtext'
import type { Handle } from '@/board/items'
import { boundsOf, type Point } from '@/lib/geometry'
import type { Guide } from './snap'
import { dotOnScreen, gripOnScreen } from './targets'
import { toScreen, type Size } from './view'

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Text items: corners make the words bigger or smaller; the sides change the width. */
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w']

/** To-do lists: their height follows their lines, so only the sides change the width. */
const WIDTH_HANDLES: Handle[] = ['e', 'w']
/** Pictures: corners, which keep their shape (Shift to stretch). */
const CORNER_HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw']

export function handlesFor(item: Shape): Handle[] {
  if (item.type === 'text') return TEXT_HANDLES
  if (item.type === 'todo') return WIDTH_HANDLES
  if (item.type === 'image') return CORNER_HANDLES
  return ALL_HANDLES
}

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
  /** The item showing its move grip (the one under the pointer). */
  gripped: Shape | null
  /** Copies of linked groups to outline (selected, or being worked inside), with their names. */
  groups: Array<{ copy: string; rect: Rect; name: string; open: boolean }>
}

export function Overlay({ view, size, selected, lookup, editingId, marquee, ghost, guides, target, drawing, dotted, activeDot, gripped, groups }: Props) {
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
  // Several things resize together by the box round the unlocked ones.
  const free = shapes.filter((s) => !s.locked)
  const scalable = free.length > 1 && !editingId ? boundsOf(free) : null

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
      {groups.map((g) => (
        <div key={g.copy} className={`group-outline ${g.open ? 'open' : ''}`} style={screen(g.rect)}>
          <span className="group-label">{g.open ? `Inside “${g.name}” — Esc to leave` : g.name}</span>
        </div>
      ))}
      {single && !isArrow(single) && !single.locked && single.id !== editingId && (
        <div className="handles" style={screen(single)}>
          {handlesFor(single).map((h) => (
            <div key={h} className={`handle handle-${h}`} data-handle={h} />
          ))}
        </div>
      )}
      {scalable && (
        <div className="handles group" style={screen(scalable)}>
          {ALL_HANDLES.map((h) => (
            <div key={h} className={`handle handle-${h}`} data-group-handle={h} />
          ))}
        </div>
      )}
      {/* A selected arrow's bends, and places to add one (or a right-angled arrow's middle run). */}
      {single &&
        isArrow(single) &&
        !single.locked &&
        single.id !== editingId &&
        bendHandles(
          single,
          lookup,
          // Keep clear of its label (roughly as wide as its words), so the label can be grabbed.
          single.text ? { p: pointAlong(arrowPoints(single, lookup), single.labelAt), reach: Math.min(220, plainText(single.text).length * 8 + 12) / 2 + 10 } : undefined
        ).map((h, k) => {
          const p = toScreen(view, size, h.p)
          const data = h.kind === 'bend' ? { 'data-bend': h.index } : h.kind === 'add' ? { 'data-bend-add': h.index } : { 'data-elbow': '' }
          const tip = h.kind === 'bend' ? 'Bend — drag to move it, double-click to take it out' : h.kind === 'add' ? 'Drag to bend the arrow here' : 'Drag to move the middle of the arrow'
          return <div key={k} className={`bend-handle ${h.kind}`} title={tip} style={{ left: p.x, top: p.y }} {...data} />
        })}
      {single && isArrow(single) && !single.locked &&
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
      {/* A section's inside doesn't react to the pointer, so show which one the grip is for. */}
      {gripped?.type === 'section' && <div className="hover-outline" style={screen(gripped)} />}
      {gripped &&
        (() => {
          const p = gripOnScreen(view, size, gripped)
          return (
            <div className="grip" data-grip={gripped.id} title="Move — drag to move it (and, for a section, what’s inside)" style={{ left: p.x, top: p.y }}>
              <svg viewBox="0 0 8 14" aria-hidden>
                {[2, 7, 12].map((y) => [2, 6].map((x) => <circle key={`${x},${y}`} cx={x} cy={y} r={1.2} />))}
              </svg>
            </div>
          )
        })()}
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
