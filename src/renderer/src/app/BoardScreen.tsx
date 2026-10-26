// An open board: the top bar with its tabs, the side panel, and the current tab's canvas.

import { Canvas } from '@/canvas/Canvas'
import { useBoard } from '@/board/store'
import { goToBoards } from './actions'
import { Icon } from './Icon'
import { SidePanel } from './SidePanel'
import { TabBar } from './TabBar'
import { useApp } from './store'

export function BoardScreen() {
  const name = useBoard((s) => s.board?.name)
  const tabId = useBoard((s) => s.tabId)
  const canUndo = useBoard((s) => s.history.past.length > 0)
  const canRedo = useBoard((s) => s.history.future.length > 0)
  const panelOpen = useApp((s) => s.panelOpen)
  const setPanelOpen = useApp((s) => s.setPanelOpen)

  return (
    <div className={`board-screen ${panelOpen ? '' : 'panel-closed'}`}>
      <header className="topbar drag-region">
        <div className="topbar-start">
          <button className="icon-btn" title={`${panelOpen ? 'Hide' : 'Show'} side panel — the tools and the task list (⌘\\)`} onClick={() => setPanelOpen(!panelOpen)}>
            <Icon name="panel" />
          </button>
          <button className="board-switch" title="All boards — back to the list of your boards (⇧⌘B)" onClick={() => void goToBoards()}>
            <Icon name="boards" size={14} />
            <span className="board-title">{name}</span>
          </button>
        </div>
        <TabBar />
        <div className="topbar-end">
          <button className="icon-btn" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => useBoard.getState().undo()}>
            <Icon name="undo" />
          </button>
          <button className="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => useBoard.getState().redo()}>
            <Icon name="redo" />
          </button>
        </div>
      </header>
      <div className="board-body">
        {panelOpen && <SidePanel />}
        {/* A fresh canvas per tab, so nothing from one tab's drag carries over to another. */}
        <Canvas key={tabId} />
      </div>
    </div>
  )
}
