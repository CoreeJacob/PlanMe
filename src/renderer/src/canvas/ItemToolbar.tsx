// The small toolbar that floats above the selection: colours, bold/italic/underline, lining
// things up, front/back, lock and delete.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ArrowItem, Item, Status, View } from '@shared/types'
import { Icon } from '@/app/Icon'
import { SHAPE_CHOICES, shapeChoice } from '@/app/shapes'
import { useApp } from '@/app/store'
import { boxOf, isArrow, isShape, type Lookup } from '@/board/arrows'
import { isLocked } from '@/board/items'
import type { TextStyle } from '@/board/richtext'
import { boundsOf } from '@/lib/geometry'
import {
  allStyled,
  arrangeSelected,
  bringSelectedToFront,
  deleteSelected,
  sendSelectedToBack,
  setOnSelected,
  setStatusOnSelected,
  toggleLockOnSelected,
  toggleStyleOnSelected
} from './actions'
import { ALIGN_CHOICES, currentStatusChoice, palettesFor, SPREAD_CHOICES, statusChoicesFor, statusValue } from './looks'
import { sectionTitleHeight } from './targets'
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

const NO_STYLES: Record<TextStyle, boolean> = { b: false, i: false, u: false }

/** While typing: which of bold, italic and underline are on where the caret is (and a way to look again). */
function useCaretStyles(editing: boolean): [Record<TextStyle, boolean>, () => void] {
  const [styles, setStyles] = useState(NO_STYLES)
  const read = useCallback(() => {
    const next = { b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline') }
    setStyles((s) => (s.b === next.b && s.i === next.i && s.u === next.u ? s : next))
  }, [])
  useEffect(() => {
    if (!editing) return
    read()
    // The caret moving, or typing (⌘B with nothing picked changes what comes next, not the selection).
    for (const type of ['selectionchange', 'keyup', 'input']) document.addEventListener(type, read)
    return () => {
      for (const type of ['selectionchange', 'keyup', 'input']) document.removeEventListener(type, read)
    }
  }, [editing, read])
  return [styles, read]
}

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
  // The toolbar's own width, so it can stay wholly on screen near the window's edges.
  const bar = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(0)
  useLayoutEffect(() => {
    const w = bar.current?.offsetWidth ?? 0
    if (w !== barWidth) setBarWidth(w)
  })
  const [caretStyles, readCaret] = useCaretStyles(editing)
  const opener = (name: string) => (on: boolean) => setOpen(on ? name : null)
  const ids = items.map((i) => i.id).join()
  useEffect(() => setOpen(null), [ids])

  const bounds = boundsOf(items.map((i) => boxOf(i, lookup)))
  if (!bounds) return null
  const topLeft = toScreen(view, size, bounds)
  const width = bounds.w * view.zoom
  // Above the selection (and clear of a section's title, which sits above its top edge), or below
  // it when there's no room above.
  const titleRoom = items.some((i) => i.type === 'section') ? sectionTitleHeight(view.zoom) : 0
  const above = topLeft.y - titleRoom - GAP - HEIGHT
  const top = above >= 8 ? above : topLeft.y + bounds.h * view.zoom + GAP
  const centre = topLeft.x + width / 2
  const palettes = palettesFor(items)
  const allLocked = items.every(isLocked)
  // Locked things keep their outline, like their size and place.
  const box = items.every((i) => i.type === 'box' && !i.locked) ? items[0] : null
  const shapes = items.filter(isShape).length
  const arranging = shapes > 1 ? [...ALIGN_CHOICES, ...(shapes > 2 ? SPREAD_CHOICES : [])] : []
  const arrow = items.every(isArrow) ? items[0] : null
  const statusChoices = statusChoicesFor(items, statuses)
  const currentStatus = currentStatusChoice(items)
  const shownStatus = statuses.find((s) => s.id === currentStatus)

  return (
    <div
      ref={bar}
      className="item-toolbar"
      style={{ top, left: Math.max(8 + barWidth / 2, Math.min(size.width - 8 - barWidth / 2, centre)) }}
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
      {arranging.length > 0 && (
        <Picker
          label="Align — line them up, or spread them out evenly"
          face={<Icon name="alignLeft" size={16} />}
          choices={arranging.map((c) => ({ value: c.value, label: c.label, face: <Icon name={c.icon} size={18} /> }))}
          current=""
          open={open === 'align'}
          onOpen={opener('align')}
          onPick={(value) => arrangeSelected(value as (typeof arranging)[number]['value'])}
          className="align-popover"
        />
      )}
      {palettes.length > 0 && <span className="toolbar-sep" />}
      {STYLES.map((s) => (
        <button
          key={s.style}
          className={`toolbar-btn style-${s.style} ${(editing ? caretStyles[s.style] : allStyled(s.style)) ? 'active' : ''}`}
          title={`${s.label} (${s.key})`}
          onClick={() => {
            if (!editing) return toggleStyleOnSelected(s.style)
            document.execCommand(s.command)
            readCaret()
          }}
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
      <button
        className={`toolbar-btn ${allLocked ? 'active' : ''}`}
        title={allLocked ? 'Unlock — let it be moved, resized and deleted again (⇧⌘L)' : 'Lock — so it can’t be moved, resized or deleted by accident (⇧⌘L)'}
        onClick={toggleLockOnSelected}
      >
        <Icon name={allLocked ? 'lock' : 'unlock'} size={16} />
      </button>
      <button className="toolbar-btn danger" title="Delete (⌫)" disabled={allLocked} onClick={deleteSelected}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  )
}
