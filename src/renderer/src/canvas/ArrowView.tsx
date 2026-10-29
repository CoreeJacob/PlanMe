// An arrow on the canvas, drawn in board units: its line, arrowheads, and label.

import { memo, useRef } from 'react'
import type { ArrowItem, Shape } from '@shared/types'
import { arrowPoints, pointAlong } from '@/board/arrows'
import { cleanHtml } from '@/board/richtext'
import type { Point } from '@/lib/geometry'
import { Editor } from './ItemView'

/** How much wider than the line the area that can be clicked is, so thin arrows are easy to pick. */
const HIT_WIDTH = 14

/** An arrowhead at `tip`, pointing along the line from `from`. */
function head(from: Point, tip: Point, width: number): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const length = 8 + width * 2.5
  const spread = 0.45
  const corner = (a: number): string => `${tip.x - length * Math.cos(a)},${tip.y - length * Math.sin(a)}`
  return `${tip.x},${tip.y} ${corner(angle - spread)} ${corner(angle + spread)}`
}

/** Stops the line short of an arrowhead's tip, so the line's end doesn't poke out past the point. */
function shorten(points: Point[], atStart: boolean, atEnd: boolean, by: number): Point[] {
  const out = points.slice()
  const pull = (p: Point, towards: Point): Point => {
    const d = Math.hypot(towards.x - p.x, towards.y - p.y)
    const t = d ? Math.min(by, d / 2) / d : 0
    return { x: p.x + (towards.x - p.x) * t, y: p.y + (towards.y - p.y) * t }
  }
  if (atStart) out[0] = pull(out[0], out[1])
  if (atEnd) out[out.length - 1] = pull(out[out.length - 1], out[out.length - 2])
  return out
}

interface Props {
  arrow: ArrowItem
  /** The items its ends are attached to (passed in so the arrow redraws when they move). */
  from: Shape | undefined
  to: Shape | undefined
  editing: boolean
  /** Faded back, while the board is filtered to a status (arrows never have one). */
  dimmed?: boolean
}

export const ArrowView = memo(function ArrowView({ arrow, from, to, editing, dimmed }: Props) {
  const label = useRef<HTMLDivElement>(null)
  const points = arrowPoints(arrow, (id) => (id === from?.id ? from : id === to?.id ? to : undefined))
  const startHead = arrow.heads === 'both'
  const endHead = arrow.heads !== 'none'
  const line = shorten(points, startHead, endHead, arrow.width * 1.5).map((p) => `${p.x},${p.y}`).join(' ')
  const mid = pointAlong(points, arrow.labelAt)
  const hasLabel = editing || arrow.text !== ''

  return (
    <>
      <svg className={`arrow ink-${arrow.color}${dimmed ? ' dimmed' : ''}`} data-item-id={arrow.id} aria-label="Arrow">
        <polyline className="arrow-hit" points={points.map((p) => `${p.x},${p.y}`).join(' ')} strokeWidth={arrow.width + HIT_WIDTH} />
        <polyline className="arrow-line" points={line} strokeWidth={arrow.width} strokeDasharray={arrow.dashed ? `${arrow.width * 4} ${arrow.width * 3}` : undefined} />
        {endHead && <polygon className="arrow-head" points={head(points[points.length - 2], points[points.length - 1], arrow.width)} />}
        {startHead && <polygon className="arrow-head" points={head(points[1], points[0], arrow.width)} />}
      </svg>
      {hasLabel && (
        <div className={`arrow-label ink-${arrow.color}${dimmed ? ' dimmed' : ''}`} data-item-id={arrow.id} style={{ left: mid.x, top: mid.y }}>
          {editing ? (
            <Editor item={arrow} textRef={label} />
          ) : (
            <div ref={label} className="item-words" dangerouslySetInnerHTML={{ __html: cleanHtml(arrow.text) }} />
          )}
        </div>
      )}
    </>
  )
})
