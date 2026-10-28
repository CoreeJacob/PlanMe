// A list under a text field, picked from with ↑ ↓ and Return (the field keeps the keyboard) or
// by clicking. Search and the Link picker use it.

import { useLayoutEffect, useRef, useState } from 'react'
import type { ShapeType } from '@shared/types'
import { Icon, type IconName } from './Icon'

export interface ResultRow {
  key: string
  icon: IconName
  text: string
  /** Where the words searched for are in `text`, as [start, end) pairs. */
  marks: Array<[number, number]>
  /** Shown faintly on the right, like the tab it's on. */
  meta?: string
  /** The one chosen now (like an item's current link). */
  current?: boolean
}

/** The icon for each kind of thing a list can show. */
export const KIND_ICONS: Record<ShapeType | 'arrow' | 'tab' | 'web', IconName> = {
  note: 'note',
  text: 'text',
  box: 'box',
  section: 'section',
  todo: 'tasks',
  image: 'image',
  arrow: 'arrow',
  tab: 'tab',
  web: 'reveal'
}

/** ↑ ↓ and Return in the field above a list of `count` rows. Call `reset` when the list changes. */
export function useListKeys(count: number, pick: (index: number) => void) {
  const [active, setActive] = useState(0)
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const by = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => Math.max(0, Math.min(count - 1, a + by)))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (count) pick(Math.min(active, count - 1))
    }
  }
  return { active: Math.min(active, count - 1), onKeyDown, reset: () => setActive(0) }
}

/** Words with the parts searched for picked out. */
export function Marked({ text, marks }: { text: string; marks: Array<[number, number]> }) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of marks) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
    at = end
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

export function ResultList({ rows, active, onPick }: { rows: ResultRow[]; active: number; onPick: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the row picked by the keys in view.
  useLayoutEffect(() => {
    ref.current?.querySelector('.result-row.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div ref={ref} className="result-list" role="listbox">
      {rows.map((r, k) => (
        <button
          key={r.key}
          type="button"
          role="option"
          aria-selected={k === active}
          className={`result-row ${k === active ? 'active' : ''} ${r.current ? 'current' : ''}`}
          data-result={r.key}
          // The field keeps the keyboard, so ↑ ↓ still work after a click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(k)}
        >
          <Icon name={r.icon} size={14} />
          <span className="result-text">
            <Marked text={r.text} marks={r.marks} />
          </span>
          {r.meta && <span className="result-meta">{r.meta}</span>}
        </button>
      ))}
    </div>
  )
}
