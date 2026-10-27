// The small toolbar that floats above the selection: colours, bold/italic/underline,
// front/back and delete.

import { useEffect, useState, type ReactNode } from 'react'
import type { ArrowItem, Item, Status, View } from '@shared/types'
import { Icon } from '@/app/Icon'
import { SHAPE_CHOICES, shapeChoice } from '@/app/shapes'
import { useApp } from '@/app/store'
import { boxOf, isArrow, type Lookup } from '@/board/arrows'
import type { TextStyle } from '@/board/richtext'
import { boundsOf } from '@/lib/geometry'
import { allStyled, bringSelectedToFront, deleteSelected, sendSelectedToBack, setOnSelected, setStatusOnSelected, toggleStyleOnSelected } from './actions'
import { currentStatusChoice, palettesFor, statusChoicesFor, statusValue } from './looks'
import { toScreen, type Size } from './view'

/** A toolbar button that opens a grid of choices (colours, or outlines) below it. */
function Picker({
  label,
  face,
  choices,
  current,
  open,
  onOpen,
  onPick,
  className = '',
  footer
}: {
  label: string
  face: ReactNode
  choices: Array<{ value: string; label: string; face: ReactNode }>
  current: string
  open: boolean
  onOpen: (open: boolean) => void
  onPick: (value: string) => void
  className?: string
  /** Something extra under the choices, like "Edit statuses…". */
  footer?: ReactNode
}) {
  return (
    <div className="toolbar-group">
      <button className={`toolbar-btn ${open ? 'active' : ''}`} title={label} onClick={() => onOpen(!open)}>
        {face}
      </button>
      {open && (
        <div className={`swatch-popover ${className}`} role="menu" aria-label={label.split(' — ')[0]}>
          {choices.map((c) => (
            <button
              key={c.value}
              className={`swatch-btn ${c.value === current ? 'current' : ''}`}
              title={c.label}
              onClick={() => {
                onPick(c.value)
                onOpen(false)
              }}
            >
              {c.face}
            </button>
          ))}
          {footer}
        </div>
      )}
    </div>
  )
}

const STYLES: Array<{ style: TextStyle; label: string; command: string; key: string }> = [
  { style: 'b', label: 'Bold — for all the words, or just the ones picked while typing', command: 'bold', key: '⌘B' },
  { style: 'i', label: 'Italic — for all the words, or just the ones picked while typing', command: 'italic', key: '⌘I' },
  { style: 'u', label: 'Underline — for all the words, or just the ones picked while typing', command: 'underline', key: '⌘U' }
]

const HEADS: Array<ArrowItem['heads']> = ['end', 'both', 'none']
const HEADS_SAID = { end: 'at the end', both: 'at both ends', none: 'none' }
const WIDTHS = [2, 3.5, 5]
const WIDTH_SAID = ['thin', 'medium', 'thick']

/** The arrow-only buttons: line shape, heads, dashes and thickness. */
function ArrowButtons({ arrow }: { arrow: ArrowItem }) {
  const widthIndex = Math.max(0, WIDTHS.indexOf(arrow.width))
  return (
    <>
      <button
        className={`toolbar-btn ${arrow.route === 'elbow' ? 'active' : ''}`}
        title="Right-angled — the line goes across and down instead of straight"
        onClick={() => setOnSelected('route', arrow.route === 'elbow' ? 'straight' : 'elbow')}
      >
        <Icon name="elbow" size={16} />
      </button>
      <button
        className="toolbar-btn"
        title={`Arrowheads — ${HEADS_SAID[arrow.heads]}. Click for ${HEADS_SAID[HEADS[(HEADS.indexOf(arrow.heads) + 1) % HEADS.length]]}`}
        onClick={() => setOnSelected('heads', HEADS[(HEADS.indexOf(arrow.heads) + 1) % HEADS.length])}
      >
        <Icon name="heads" size={16} />
        <span className="toolbar-note">{arrow.heads === 'both' ? '2' : arrow.heads === 'none' ? '0' : '1'}</span>
      </button>
      <button className={`toolbar-btn ${arrow.dashed ? 'active' : ''}`} title="Dashed — for maybe routes and ideas" onClick={() => setOnSelected('dashed', !arrow.dashed)}>
        <Icon name="dashed" size={16} />
      </button>
      <button
        className="toolbar-btn"
        title={`Thickness — ${WIDTH_SAID[widthIndex]}. Click for ${WIDTH_SAID[(widthIndex + 1) % WIDTHS.length]}`}
        onClick={() => setOnSelected('width', WIDTHS[(widthIndex + 1) % WIDTHS.length])}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={1 + widthIndex * 1.5} strokeLinecap="round" />
        </svg>
      </button>
    </>
  )
}

const GAP = 10
const HEIGHT = 40

interface Props {
  view: View
  size: Size
  items: Item[]
  lookup: Lookup
  editing: boolean
  statuses: Status[]
}

export function ItemToolbar({ view, size, items, lookup, editing, statuses }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const opener = (name: string) => (on: boolean) => setOpen(on ? name : null)
  const ids = items.map((i) => i.id).join()
  useEffect(() => setOpen(null), [ids])

  const bounds = boundsOf(items.map((i) => boxOf(i, lookup)))
  if (!bounds) return null
  const topLeft = toScreen(view, size, bounds)
  const width = bounds.w * view.zoom
  // Above the selection, or below it when there's no room above.
  const above = topLeft.y - GAP - HEIGHT
  const top = above >= 8 ? above : topLeft.y + bounds.h * view.zoom + GAP
  const centre = topLeft.x + width / 2
  const palettes = palettesFor(items)
  const box = items.every((i) => i.type === 'box') ? items[0] : null
  const arrow = items.every(isArrow) ? items[0] : null
  const statusChoices = statusChoicesFor(items, statuses)
  const currentStatus = currentStatusChoice(items)
  const shownStatus = statuses.find((s) => s.id === currentStatus)

  return (
    <div
      className="item-toolbar"
      style={{ top, left: Math.max(8, Math.min(size.width - 8, centre)) }}
      // Keep the typing caret where it is while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {palettes.map((p) => (
        <Picker
          key={p.key}
          label={p.label}
          face={<span className={`swatch ${p.swatch(p.current)}`} />}
          choices={p.choices.map((c) => ({ value: c.name, label: c.label, face: <span className={`swatch ${p.swatch(c.name)}`} /> }))}
          current={p.current}
          open={open === p.key}
          onOpen={opener(p.key)}
          onPick={(value) => setOnSelected(p.key, value)}
        />
      ))}
      {box && box.type === 'box' && (
        <Picker
          label="Shape — change the outline, keeping the words and colours"
          face={<Icon name={shapeChoice(box.shape).icon} size={16} />}
          choices={SHAPE_CHOICES.map((c) => ({ value: c.shape, label: c.label, face: <Icon name={c.icon} size={18} /> }))}
          current={box.shape}
          open={open === 'shape'}
          onOpen={opener('shape')}
          onPick={(value) => setOnSelected('shape', value)}
          className="shape-popover"
        />
      )}
      {arrow && isArrow(arrow) && <ArrowButtons arrow={arrow} />}
      {statusChoices && (
        <Picker
          label="Status — for tracking it: To do, Doing, Done…"
          face={shownStatus ? <span className={`status-pill status-${shownStatus.color}`}>{shownStatus.name}</span> : <Icon name="flag" size={16} />}
          choices={statusChoices.map((c) => ({
            value: c.value,
            label: c.label,
            face: c.status ? <span className={`status-pill status-${c.status.color}`}>{c.status.name}</span> : <span className="status-plain">{c.label.split(' — ')[0]}</span>
          }))}
          current={currentStatus}
          open={open === 'status'}
          onOpen={opener('status')}
          onPick={(value) => setStatusOnSelected(statusValue(value))}
          className="status-popover"
          footer={
            <button className="status-edit" onClick={() => (setOpen(null), useApp.getState().setStatusEditorOpen(true))}>
              Edit statuses…
            </button>
          }
        />
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
      <button className="toolbar-btn" title="Bring to front — on top of everything else (⌘])" onClick={bringSelectedToFront}>
        <Icon name="toFront" size={16} />
      </button>
      <button className="toolbar-btn" title="Send to back — behind everything else (⌘[)" onClick={sendSelectedToBack}>
        <Icon name="toBack" size={16} />
      </button>
      <button className="toolbar-btn danger" title="Delete (⌫)" onClick={deleteSelected}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  )
}
