// Drawn over the board in screen pixels, so lines and handles stay the same size at any zoom:
// selection outlines and resize handles, the drag-to-select box, guides, and new-item outlines.

import type { Item, Rect, View } from '@shared/types'
import { boundsOf, type Handle } from '@/board/items'
import type { Guide } from './snap'
import { toScreen, type Size } from './view'

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** Text items: corners make the words bigger or smaller; the sides change the width. */
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w']

export const handlesFor = (item: Item): Handle[] => (item.type === 'text' ? TEXT_HANDLES : ALL_HANDLES)

interface Props {
  view: View
  size: Size
  selected: Item[]
  editingId: string | null
  marquee: Rect | null
  ghost: Rect | null
  guides: Guide[]
}

export function Overlay({ view, size, selected, editingId, marquee, ghost, guides }: Props) {
  const screen = (r: Rect): { left: number; top: number; width: number; height: number } => {
    const p = toScreen(view, size, r)
    return { left: p.x, top: p.y, width: r.w * view.zoom, height: r.h * view.zoom }
  }
  const single = selected.length === 1 ? selected[0] : null
  const group = selected.length > 1 ? boundsOf(selected) : null

  return (
    <div className="overlay">
      {selected.map((item) => (
        <div key={item.id} className="selection-outline" data-id={item.id} style={screen(item)} />
      ))}
      {group && <div className="selection-outline group" style={screen(group)} />}
      {single && single.id !== editingId && (
        <div className="handles" style={screen(single)}>
          {handlesFor(single).map((h) => (
            <div key={h} className={`handle handle-${h}`} data-handle={h} />
          ))}
        </div>
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
