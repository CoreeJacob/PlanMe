// A box's outline: rectangle, rounded, oval, diamond, parallelogram or cylinder.

import type { BoxItem } from '@shared/types'
import { cylinderCap, SLANT } from '@/board/outlines'

const STROKE = 2

/** A box's outline, drawn to its size so the line stays the same thickness however big it is. */
export function Outline({ shape, w, h }: { shape: BoxItem['shape']; w: number; h: number }) {
  const i = STROKE / 2
  let body: React.ReactNode
  if (shape === 'oval') body = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} />
  else if (shape === 'diamond') body = <polygon points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`} />
  else if (shape === 'parallelogram') {
    const slant = w * SLANT
    body = <polygon points={`${slant},${i} ${w - i},${i} ${w - slant},${h - i} ${i},${h - i}`} />
  } else if (shape === 'cylinder') {
    const rx = w / 2 - i
    const ry = cylinderCap(w, h)
    body = (
      <>
        <path d={`M${i},${ry} A${rx},${ry} 0 0 1 ${w - i},${ry} V${h - ry} A${rx},${ry} 0 0 1 ${i},${h - ry} Z`} />
        <path className="outline-rim" d={`M${i},${ry} A${rx},${ry} 0 0 0 ${w - i},${ry}`} />
      </>
    )
  } else body = <rect x={i} y={i} width={w - STROKE} height={h - STROKE} rx={shape === 'rounded' ? Math.min(14, w / 4, h / 4) : 0} />
  return (
    <svg className="outline" width={w} height={h} aria-hidden>
      {body}
    </svg>
  )
}
