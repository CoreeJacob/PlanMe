// Editing a board's statuses: rename, recolour, say what each means, reorder, add and delete.
// Nothing changes until Save, which is one undo step.

import { useState } from 'react'
import type { Status, StatusKind } from '@shared/types'
import { usesOf } from '@/board/statuses'
import { useBoard } from '@/board/store'
import { saveStatuses } from '@/canvas/actions'
import { count } from '@/lib/format'
import { STATUS_COLORS } from './colors'
import { Icon } from './Icon'
import { useApp } from './store'

const KINDS: Array<{ kind: StatusKind; label: string }> = [
  { kind: 'todo', label: 'Not started' },
  { kind: 'doing', label: 'In progress' },
  { kind: 'done', label: 'Finished' },
  { kind: 'other', label: 'Something else' }
]

export function StatusEditor() {
  const open = useApp((s) => s.statusEditorOpen)
  return open ? <StatusForm /> : null
}

function StatusForm() {
  const close = (): void => useApp.getState().setStatusEditorOpen(false)
  const [draft, setDraft] = useState<Status[]>(() => useBoard.getState().doc.statuses)
  const change = (id: string, patch: Partial<Status>): void => setDraft(draft.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (index: number, by: number): void => {
    const next = draft.slice()
    const [s] = next.splice(index, 1)
    next.splice(index + by, 0, s)
    setDraft(next)
  }

  const save = (): void => {
    const doc = useBoard.getState().doc
    const kept = new Set(draft.map((s) => s.id))
    // Deleting a status that things use: say so first.
    const going = doc.statuses.filter((s) => !kept.has(s.id)).map((s) => ({ s, uses: usesOf(doc, s.id) })).filter((g) => g.uses)
    if (going.length) {
      const list = going.map((g) => `“${g.s.name}” (${count(g.uses, 'item')})`).join(', ')
      if (!confirm(`Delete ${list}?\n\nThose items will have no status. You can undo this with ⌘Z.`)) return
    }
    saveStatuses(draft.map((s) => ({ ...s, name: s.name.trim() || 'Untitled' })))
    close()
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="modal status-editor"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <h2>Statuses</h2>
        <p className="muted">For this board. “Finished” ones fade on the board and gather in the Done list.</p>
        <div className="status-rows">
          {draft.map((s, k) => (
            <div key={s.id} className="status-row">
              <select
                className={`status-colour status-${s.color}`}
                value={s.color}
                aria-label="Colour"
                title="Colour"
                onChange={(e) => change(s.id, { color: e.target.value })}
              >
                {STATUS_COLORS.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="input" value={s.name} aria-label="Name" onChange={(e) => change(s.id, { name: e.target.value })} />
              <select className="select" value={s.kind} aria-label="Counts as" title="Counts as" onChange={(e) => change(s.id, { kind: e.target.value as StatusKind })}>
                {KINDS.map((x) => (
                  <option key={x.kind} value={x.kind}>
                    {x.label}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" title="Move up" disabled={k === 0} onClick={() => move(k, -1)}>
                <Icon name="up" size={14} />
              </button>
              <button type="button" className="icon-btn" title="Move down" disabled={k === draft.length - 1} onClick={() => move(k, 1)}>
                <Icon name="down" size={14} />
              </button>
              <button type="button" className="icon-btn" title={`Delete “${s.name}”`} onClick={() => setDraft(draft.filter((x) => x.id !== s.id))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="link status-add"
          onClick={() => setDraft([...draft, { id: crypto.randomUUID().slice(0, 8), name: 'New status', color: 'purple', kind: 'other' }])}
        >
          + Add a status
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
