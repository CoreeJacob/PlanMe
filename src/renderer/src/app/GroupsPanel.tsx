// The Groups part of the side panel: the board's linked groups, and which tabs have a copy. Drag
// one onto the board (or click Place) for another copy, still linked; click a tab name to go to
// that copy.

import { useBoard } from '@/board/store'
import { groupsOf, partIds } from '@/board/groups'
import { itemsOf } from '@/board/items'
import { deleteGroup, goToItem, placeGroupCopy, renameGroupAsked } from '@/canvas/actions'
import { count } from '@/lib/format'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'

/** What's dragged from the panel onto the board: a group's id. */
export const GROUP_DRAG = 'application/x-planme-group'

export function GroupsPanel() {
  const doc = useBoard((s) => s.doc)
  const groups = groupsOf(doc)
  const menu = useContextMenu()
  const tabName = (id: string): string => doc.tabs.find((t) => t.id === id)?.name ?? ''

  return (
    <section className="panel-section grow groups-section">
      {groups.length === 0 ? (
        <p className="panel-empty muted">Select some things and press ⌘G to make a group, like a character and their gear. Copies of it on other tabs stay linked: change one, and they all change.</p>
      ) : (
        groups.map((g) => {
          const first = g.copies[0]
          const parts = partIds(itemsOf(doc, first.tab), first.id).length
          return (
            <div
              key={g.id}
              className="group-row"
              data-group={g.id}
              draggable
              title={`${g.name} — drag onto the board for another linked copy`}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData(GROUP_DRAG, g.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                menu.show(e.clientX, e.clientY, [
                  { label: 'Place a Copy Here', icon: 'plus', onSelect: () => placeGroupCopy(g.id) },
                  { label: 'Rename…', icon: 'rename', onSelect: () => void renameGroupAsked(g.id) },
                  'separator',
                  { label: 'Unlink All Copies', danger: true, onSelect: () => deleteGroup(g.id) }
                ])
              }}
            >
              <div className="group-head">
                <Icon name="group" size={14} />
                <span className="group-title">{g.name}</span>
                <span className="group-count muted">{count(parts, 'thing')}</span>
                <button className="icon-btn group-place" title="Place a copy in the middle of this tab" onClick={() => placeGroupCopy(g.id)}>
                  <Icon name="plus" size={14} />
                </button>
              </div>
              <div className="group-tabs">
                {g.copies.map((c) => (
                  <button
                    key={c.id}
                    className="chip"
                    title={`Go to the copy on ${tabName(c.tab)}`}
                    onClick={() => goToItem(c.tab, partIds(itemsOf(doc, c.tab), c.id)[0])}
                  >
                    {tabName(c.tab)}
                  </button>
                ))}
              </div>
            </div>
          )
        })
      )}
      {menu.element}
    </section>
  )
}
