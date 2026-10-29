// Editing a board's tags: rename, recolour, add and delete. Nothing changes until Save, which is
// one undo step.

import { useState } from 'react'
import type { Tag } from '@shared/types'
import { useBoard } from '@/board/store'
import { nextTagColor, tagsOf, usesOfTag } from '@/board/tags'
import { saveTags } from '@/canvas/actions'
import { count } from '@/lib/format'
import { STATUS_COLORS } from './colors'
import { Icon } from './Icon'
import { useApp } from './store'

export function TagEditor() {
  const open = useApp((s) => s.tagEditorOpen)
  return open ? <TagForm /> : null
}

function TagForm() {
  const close = (): void => useApp.getState().setTagEditorOpen(false)
  const [draft, setDraft] = useState<Tag[]>(() => tagsOf(useBoard.getState().doc))
  const change = (id: string, patch: Partial<Tag>): void => setDraft(draft.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const save = (): void => {
    const doc = useBoard.getState().doc
    const kept = new Set(draft.map((t) => t.id))
    // Deleting a tag things have: say so first.
    const going = tagsOf(doc)
      .filter((t) => !kept.has(t.id))
      .map((t) => ({ t, uses: usesOfTag(doc, t.id) }))
      .filter((g) => g.uses)
    if (going.length) {
      const list = going.map((g) => `“${g.t.name}” (${count(g.uses, 'item')})`).join(', ')
      if (!confirm(`Delete ${list}?\n\nThose items lose the tag. You can undo this with ⌘Z.`)) return
    }
    saveTags(draft.map((t) => ({ ...t, name: t.name.trim() || 'Untitled' })))
    close()
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="modal tag-editor"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <h2>Tags</h2>
        <p className="muted">For this board: what area each thing belongs to, like Art, Audio or Combat.</p>
        <div className="status-rows">
          {draft.length === 0 && <p className="muted">No tags yet.</p>}
          {draft.map((t) => (
            <div key={t.id} className="status-row">
              <select className={`status-colour status-${t.color}`} value={t.color} aria-label="Colour" title="Colour" onChange={(e) => change(t.id, { color: e.target.value })}>
                {STATUS_COLORS.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="input" value={t.name} aria-label="Name" onChange={(e) => change(t.id, { name: e.target.value })} />
              <button type="button" className="icon-btn" title={`Delete “${t.name}”`} onClick={() => setDraft(draft.filter((x) => x.id !== t.id))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="link status-add" onClick={() => setDraft([...draft, { id: crypto.randomUUID().slice(0, 8), name: 'New tag', color: nextTagColor(draft) }])}>
          + Add a tag
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
