// A dialog for editing one of the board's lists (its statuses, or its tags): rename, recolour,
// add and delete, and optionally reorder or set more per row. Nothing changes until Save.

import { useState, type ReactNode } from 'react'
import { STATUS_COLORS } from './colors'
import { Icon } from './Icon'

interface Row {
  id: string
  name: string
  color: string
}

interface Props<T extends Row> {
  title: string
  intro: string
  /** The list as it is now. */
  start: T[]
  addLabel: string
  emptyText?: string
  /** A new row, added at the end. */
  make: (draft: T[]) => T
  /** More controls for a row, after its name (like a status's kind). */
  more?: (row: T, change: (patch: Partial<T>) => void) => ReactNode
  /** Rows can be moved up and down. */
  reorder?: boolean
  /** Saves the list; false keeps the dialog open (say, if deleting was cancelled). */
  save: (draft: T[]) => boolean
  close: () => void
  className?: string
}

export function ListEditor<T extends Row>({ title, intro, start, addLabel, emptyText, make, more, reorder, save, close, className = '' }: Props<T>) {
  const [draft, setDraft] = useState<T[]>(start)
  const change = (id: string, patch: Partial<T>): void => setDraft(draft.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const move = (index: number, by: number): void => {
    const next = draft.slice()
    const [row] = next.splice(index, 1)
    next.splice(index + by, 0, row)
    setDraft(next)
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className={`modal ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (save(draft.map((r) => ({ ...r, name: r.name.trim() || 'Untitled' })))) close()
        }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <h2>{title}</h2>
        <p className="muted">{intro}</p>
        <div className="status-rows">
          {draft.length === 0 && emptyText && <p className="muted">{emptyText}</p>}
          {draft.map((row, k) => (
            <div key={row.id} className="status-row">
              <select className={`status-colour status-${row.color}`} value={row.color} aria-label="Colour" title="Colour" onChange={(e) => change(row.id, { color: e.target.value } as Partial<T>)}>
                {STATUS_COLORS.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="input" value={row.name} aria-label="Name" onChange={(e) => change(row.id, { name: e.target.value } as Partial<T>)} />
              {more?.(row, (patch) => change(row.id, patch))}
              {reorder && (
                <>
                  <button type="button" className="icon-btn" title="Move up" disabled={k === 0} onClick={() => move(k, -1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button type="button" className="icon-btn" title="Move down" disabled={k === draft.length - 1} onClick={() => move(k, 1)}>
                    <Icon name="down" size={14} />
                  </button>
                </>
              )}
              <button type="button" className="icon-btn" title={`Delete “${row.name}”`} onClick={() => setDraft(draft.filter((x) => x.id !== row.id))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="link status-add" onClick={() => setDraft([...draft, make(draft)])}>
          {addLabel}
        </button>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
