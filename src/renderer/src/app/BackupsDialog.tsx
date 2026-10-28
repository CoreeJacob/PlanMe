// The Backups dialog (from the Boards screen): every board's backups, including boards since
// deleted. Restoring one adds it as a new board, so nothing is ever overwritten.

import { useEffect, useState } from 'react'
import type { BoardBackups } from '@shared/types'
import { count } from '@/lib/format'
import { refreshBoards } from './actions'
import { attempt, useApp } from './store'

export function BackupsDialog() {
  const board = useApp((s) => s.backupsFor)
  return board === null ? null : <BackupsForm first={board} />
}

function BackupsForm({ first }: { first: string }) {
  const close = (): void => useApp.getState().setBackupsFor(null)
  const [list, setList] = useState<BoardBackups[] | null>(null)
  const [chosen, setChosen] = useState(first)
  useEffect(() => {
    void attempt(() => window.api.listBackups()).then((found) => setList(found ?? []))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const shown = list?.find((b) => b.board === chosen) ?? list?.[0]

  const restore = async (id: string): Promise<void> => {
    if (!shown) return
    const name = await attempt(() => window.api.restoreBackup(shown.board, id))
    if (!name) return
    close()
    await refreshBoards()
    useApp.getState().toast(`Restored as “${name}”`)
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="modal backups-dialog"
        role="dialog"
        aria-label="Backups"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Backups</h2>
        <p className="muted">Each board is backed up before it changes, at most once an hour. Restoring adds a copy as a new board; nothing is overwritten.</p>
        {list === null ? null : !shown ? (
          <p className="backups-empty">No backups yet.</p>
        ) : (
          <div className="backups-body">
            <div className="backups-boards" role="listbox" aria-label="Boards">
              {list.map((b) => (
                <button key={b.board} role="option" aria-selected={b === shown} className={`backups-board ${b === shown ? 'active' : ''}`} onClick={() => setChosen(b.board)}>
                  <span className="backups-board-name">{b.board}</span>
                  {!b.current && <span className="backups-gone">deleted</span>}
                </button>
              ))}
            </div>
            <div className="backups-list">
              {shown.backups.map((backup) => (
                <div key={backup.id} className="backup-row">
                  <span className="backup-when">{backup.label}</span>
                  <span className="backup-tabs muted">{count(backup.tabs, 'tab')}</span>
                  <button className="btn backup-restore" title={`Restore — adds the board as it was on ${backup.label} as a new board`} onClick={() => void restore(backup.id)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn backups-reveal" onClick={() => void window.api.revealBackups(shown?.board)}>
            Show in Finder
          </button>
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
