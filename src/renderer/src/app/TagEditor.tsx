// Editing a board's tags: rename, recolour, add and delete. Nothing changes until Save, which is
// one undo step.

import type { Tag } from '@shared/types'
import { useBoard } from '@/board/store'
import { nextTagColor, tagsOf, usesOfTag } from '@/board/tags'
import { saveTags } from '@/canvas/actions'
import { count } from '@/lib/format'
import { shortId } from '@/lib/objects'
import { ListEditor } from './ListEditor'
import { useApp } from './store'

export function TagEditor() {
  const open = useApp((s) => s.tagEditorOpen)
  if (!open) return null
  return (
    <ListEditor<Tag>
      title="Tags"
      intro="For this board: what area each thing belongs to, like Art, Audio or Combat."
      className="tag-editor"
      start={tagsOf(useBoard.getState().doc)}
      addLabel="+ Add a tag"
      emptyText="No tags yet."
      make={(draft) => ({ id: shortId(), name: 'New tag', color: nextTagColor(draft) })}
      save={(draft) => {
        const doc = useBoard.getState().doc
        const kept = new Set(draft.map((t) => t.id))
        // Deleting a tag things have: say so first.
        const going = tagsOf(doc)
          .filter((t) => !kept.has(t.id))
          .map((t) => ({ t, uses: usesOfTag(doc, t.id) }))
          .filter((g) => g.uses)
        if (going.length) {
          const list = going.map((g) => `“${g.t.name}” (${count(g.uses, 'item')})`).join(', ')
          if (!confirm(`Delete ${list}?\n\nThose items lose the tag. You can undo this with ⌘Z.`)) return false
        }
        saveTags(draft)
        return true
      }}
      close={() => useApp.getState().setTagEditorOpen(false)}
    />
  )
}
