// The small toolbar that floats above the selection: colours, bold/italic/underline,
// front/back and delete.

import { useEffect, useState } from 'react'
import type { Item, View } from '@shared/types'
import { BORDER_COLORS, FILL_COLORS, INK_COLORS, NOTE_COLORS, type ColorChoice } from '@/app/colors'
import { Icon } from '@/app/Icon'
import { boundsOf } from '@/board/items'
import type { TextStyle } from '@/board/richtext'
import { allStyled, bringSelectedToFront, deleteSelected, sendSelectedToBack, setOnSelected, toggleStyleOnSelected } from './actions'
import { toScreen, type Size } from './view'

type ColorKey = 'color' | 'fill' | 'border'

interface Palette {
  key: ColorKey
  label: string
  choices: ColorChoice[]
  /** The class that shows a colour, e.g. 'note-' + 'yellow'. */
  swatch: (name: string) => string
  current: string
}

/** The colour choices that make sense for what's selected (only when it's all one kind). */
function palettesFor(items: Item[]): Palette[] {
  const first = items[0]
  if (!first || !items.every((i) => i.type === first.type)) return []
  if (first.type === 'note') return [{ key: 'color', label: 'Colour', choices: NOTE_COLORS, swatch: (n) => `note-${n}`, current: first.color }]
  if (first.type === 'text') return [{ key: 'color', label: 'Text colour', choices: INK_COLORS, swatch: (n) => `swatch-ink ink-${n}`, current: first.color }]
  return [
    { key: 'fill', label: 'Fill', choices: FILL_COLORS, swatch: (n) => `fill-${n}`, current: first.fill },
    { key: 'border', label: 'Border', choices: BORDER_COLORS, swatch: (n) => `swatch-ink ink-${n}${n === 'none' ? ' none' : ''}`, current: first.border }
  ]
}

const STYLES: Array<{ style: TextStyle; label: string; command: string; key: string }> = [
  { style: 'b', label: 'Bold', command: 'bold', key: '⌘B' },
  { style: 'i', label: 'Italic', command: 'italic', key: '⌘I' },
  { style: 'u', label: 'Underline', command: 'underline', key: '⌘U' }
]

const GAP = 10
const HEIGHT = 40

export function ItemToolbar({ view, size, items, editing }: { view: View; size: Size; items: Item[]; editing: boolean }) {
  const [open, setOpen] = useState<ColorKey | null>(null)
  const ids = items.map((i) => i.id).join()
  useEffect(() => setOpen(null), [ids])

  const bounds = boundsOf(items)
  if (!bounds) return null
  const topLeft = toScreen(view, size, bounds)
  const width = bounds.w * view.zoom
  // Above the selection, or below it when there's no room above.
  const above = topLeft.y - GAP - HEIGHT
  const top = above >= 8 ? above : topLeft.y + bounds.h * view.zoom + GAP
  const centre = topLeft.x + width / 2
  const palettes = palettesFor(items)
  const box = items.every((i) => i.type === 'box') ? items[0] : null

  return (
    <div
      className="item-toolbar"
      style={{ top, left: Math.max(8, Math.min(size.width - 8, centre)) }}
      // Keep the typing caret where it is while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {palettes.map((p) => (
        <div key={p.key} className="toolbar-group">
          <button className={`toolbar-btn ${open === p.key ? 'active' : ''}`} title={p.label} onClick={() => setOpen(open === p.key ? null : p.key)}>
            <span className={`swatch ${p.swatch(p.current)}`} />
          </button>
          {open === p.key && (
            <div className="swatch-popover" role="menu" aria-label={p.label}>
              {p.choices.map((c) => (
                <button
                  key={c.name}
                  className={`swatch-btn ${c.name === p.current ? 'current' : ''}`}
                  title={c.label}
                  onClick={() => {
                    setOnSelected(p.key, c.name)
                    setOpen(null)
                  }}
                >
                  <span className={`swatch ${p.swatch(c.name)}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {box && box.type === 'box' && (
        <button className={`toolbar-btn ${box.rounded ? 'active' : ''}`} title="Rounded corners" onClick={() => setOnSelected('rounded', !box.rounded)}>
          <Icon name="rounded" size={16} />
        </button>
      )}
      {palettes.length > 0 && <span className="toolbar-sep" />}
      {STYLES.map((s) => (
        <button
          key={s.style}
          className={`toolbar-btn style-${s.style} ${!editing && allStyled(s.style) ? 'active' : ''}`}
          title={`${s.label} (${s.key})`}
          onClick={() => (editing ? document.execCommand(s.command) : toggleStyleOnSelected(s.style))}
        >
          {s.style.toUpperCase()}
        </button>
      ))}
      <span className="toolbar-sep" />
      <button className="toolbar-btn" title="Bring to front (⌘])" onClick={bringSelectedToFront}>
        <Icon name="toFront" size={16} />
      </button>
      <button className="toolbar-btn" title="Send to back (⌘[)" onClick={sendSelectedToBack}>
        <Icon name="toBack" size={16} />
      </button>
      <button className="toolbar-btn danger" title="Delete (⌫)" onClick={deleteSelected}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  )
}
