// Where you are on the board: the sections the middle of the screen is in ("Act 1 › Forest"),
// bottom left. Click one to see all of it.

import type { Item, View } from '@shared/types'
import { sectionTrail } from '@/board/sections'
import { zoomToShow } from './current'

export function SectionTrail({ items, view }: { items: readonly Item[]; view: View }) {
  const trail = sectionTrail(items, view)
  if (!trail.length) return null
  return (
    <nav className="section-trail" aria-label="Sections you’re in" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {trail.map((s, k) => (
        <span key={s.id} className="trail-step">
          {k > 0 && <span className="trail-sep">›</span>}
          <button className={`trail-section section-${s.color}`} title={`Show all of “${s.text || 'Untitled section'}”`} onClick={() => zoomToShow(s)}>
            {s.text || 'Untitled section'}
          </button>
        </span>
      ))}
    </nav>
  )
}
