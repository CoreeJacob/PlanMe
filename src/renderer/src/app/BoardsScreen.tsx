// The Boards screen: every board in the boards folder, newest first.

import { useEffect } from 'react'
import { count } from '@/lib/format'
import { chooseRoot, newBoard, openBoard, refreshBoards, renameBoard, trashBoard } from './actions'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import { useApp } from './store'

/** "just now", "5 minutes ago", "yesterday", or a date. */
function whenEdited(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${count(minutes, 'minute')} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${count(hours, 'hour')} ago`
  if (hours < 48) return 'yesterday'
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function BoardsScreen() {
  const boards = useApp((s) => s.boards)
  const root = useApp((s) => s.root)
  const menu = useContextMenu()

  useEffect(() => {
    void refreshBoards()
  }, [])

  return (
    <div className="boards-screen">
      <header className="boards-header drag-region">
        <h1>Boards</h1>
        <button className="btn primary" title="New board — one for each game or idea (⇧⌘N)" onClick={() => void newBoard()}>
          <Icon name="plus" size={16} /> New Board
        </button>
      </header>

      {boards.length === 0 ? (
        <div className="boards-empty">
          <p>No boards yet.</p>
          <p className="muted">Make one for each game or idea you’re planning.</p>
        </div>
      ) : (
        <div className="boards-grid">
          {boards.map((b) => (
            <button
              key={b.path}
              className="board-card"
              onClick={() => void openBoard(b.path)}
              onContextMenu={(e) => {
                e.preventDefault()
                menu.show(e.clientX, e.clientY, [
                  { label: 'Open', onSelect: () => void openBoard(b.path) },
                  { label: 'Rename…', icon: 'rename', onSelect: () => void renameBoard(b.path, b.name) },
                  { label: 'Show in Finder', icon: 'reveal', onSelect: () => void window.api.revealBoard(b.path) },
                  'separator',
                  { label: 'Move to Trash…', icon: 'trash', danger: true, onSelect: () => void trashBoard(b.path, b.name) }
                ])
              }}
            >
              <span className="board-name">{b.name}</span>
              <span className="board-meta muted">
                {count(b.tabs, 'tab')} · edited {whenEdited(b.modified)}
              </span>
            </button>
          ))}
        </div>
      )}

      <footer className="boards-footer muted">
        <Icon name="folder" size={14} />
        <span className="boards-root" title={root}>
          Saved in {root.replace(/^\/Users\/[^/]+/, '~')}
        </span>
        <button className="link" title="Choose a different folder to keep your boards in" onClick={() => void chooseRoot()}>
          Change…
        </button>
      </footer>
      {menu.element}
    </div>
  )
}
