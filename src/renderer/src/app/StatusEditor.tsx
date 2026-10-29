// Editing a board's statuses: rename, recolour, say what each means, reorder, add and delete.
// Nothing changes until Save, which is one undo step.

import type { Status, StatusKind } from '@shared/types'
import { usesOf } from '@/board/statuses'
import { useBoard } from '@/board/store'
import { saveStatuses } from '@/canvas/actions'
import { count } from '@/lib/format'
import { shortId } from '@/lib/objects'
import { ListEditor } from './ListEditor'
import { useApp } from './store'

const KINDS: Array<{ kind: StatusKind; label: string }> = [
  { kind: 'todo', label: 'Not started' },
  { kind: 'doing', label: 'In progress' },
  { kind: 'done', label: 'Finished' },
  { kind: 'other', label: 'Something else' }
]

export function StatusEditor() {
  const open = useApp((s) => s.statusEditorOpen)
  if (!open) return null
  return (
    <ListEditor<Status>
      title="Statuses"
      intro="For this board. “Finished” ones fade on the board and gather in the Done list."
      className="status-editor"
      start={useBoard.getState().doc.statuses}
      addLabel="+ Add a status"
      make={() => ({ id: shortId(), name: 'New status', color: 'purple', kind: 'other' })}
      reorder
      more={(s, change) => (
        <select className="select" value={s.kind} aria-label="Counts as" title="Counts as" onChange={(e) => change({ kind: e.target.value as StatusKind })}>
          {KINDS.map((x) => (
            <option key={x.kind} value={x.kind}>
              {x.label}
            </option>
          ))}
        </select>
      )}
      save={(draft) => {
        const doc = useBoard.getState().doc
        const kept = new Set(draft.map((s) => s.id))
        // Deleting a status that things use: say so first.
        const going = doc.statuses.filter((s) => !kept.has(s.id)).map((s) => ({ s, uses: usesOf(doc, s.id) })).filter((g) => g.uses)
        if (going.length) {
          const list = going.map((g) => `“${g.s.name}” (${count(g.uses, 'item')})`).join(', ')
          if (!confirm(`Delete ${list}?\n\nThose items will have no status. You can undo this with ⌘Z.`)) return false
        }
        saveStatuses(draft)
        return true
      }}
      close={() => useApp.getState().setStatusEditorOpen(false)}
    />
  )
}
