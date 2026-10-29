// An open board: the top bar with its tabs, the side panel, and the current tab's canvas.

import { useEffect } from 'react'
import { Canvas } from '@/canvas/Canvas'
import { goBack } from '@/canvas/actions'
import { useBoard } from '@/board/store'
import { goToBoards } from './actions'
import { Icon } from './Icon'
import { DetailsPane } from './DetailsPane'
import { FindBox } from './Search'
import { SidePanel } from './SidePanel'
import { useImageLibrary } from './imageLibrary'
import { useOutsideChanges } from './outside'
import { TabBar } from './TabBar'
import { useApp } from './store'

export function BoardScreen() {
  const name = useBoard((s) => s.board?.name)
  const tabId = useBoard((s) => s.tabId)
  const canUndo = useBoard((s) => s.history.past.length > 0)
  const canRedo = useBoard((s) => s.history.future.length > 0)
  const panelOpen = useApp((s) => s.panelOpen)
  const findOpen = useApp((s) => s.findOpen)
  const path = useBoard((s) => s.board?.path)
  // Another board: links followed and searches were for the last one.
  useEffect(() => useApp.setState({ backStack: [], search: '', findOpen: false }), [path])
  // The board's images folder, kept up to date (and pictures moved in Finder found again).
  useImageLibrary()
  // Changes made to the board's files outside PlanMe (say, by an assistant) show up as they happen.
  useOutsideChanges()
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
          <ThemeButton />
          <button className="icon-btn" title="Keyboard shortcuts — every key, on one sheet (⌘/)" onClick={() => useApp.getState().setShortcutsOpen(true)}>
            <Icon name="keyboard" />
          </button>
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
        <div className="canvas-area">
          {/* A fresh canvas per tab, so nothing from one tab's drag carries over to another. */}
          <Canvas key={tabId} />
          <BackChip />
          {findOpen && !panelOpen && <FindBox />}
        </div>
        <DetailsPane />
      </div>
    </div>
  )
}

/** After following a link: back to where it was followed from. */
function BackChip() {
  const stack = useApp((s) => s.backStack)
  const tabs = useBoard((s) => s.doc.tabs)
  const tabId = useBoard((s) => s.tabId)
  // The latest place whose tab is still there.
  const spot = stack.findLast((s) => tabs.some((t) => t.id === s.tabId))
  if (!spot) return null
  const name = tabs.find((t) => t.id === spot.tabId)!.name
  return (
    <div className="back-chip">
      <button className="back-go" title="Back to where you followed the link from" onClick={goBack}>
        <Icon name="left" size={14} />
        {spot.tabId === tabId ? 'Back' : `Back to ${name}`}
      </button>
      <button className="back-close" title="Hide — forget where links were followed from" onClick={() => useApp.getState().clearBack()}>
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

const THEMES = [
  { theme: 'system', icon: 'themeAuto', said: 'same as the Mac' },
  { theme: 'light', icon: 'sun', said: 'light' },
  { theme: 'dark', icon: 'moon', said: 'dark' }
] as const

/** Light, dark, or the same as the Mac: click for the next. */
function ThemeButton() {
  const theme = useApp((s) => s.theme)
  const k = Math.max(0, THEMES.findIndex((t) => t.theme === theme))
  const next = THEMES[(k + 1) % THEMES.length]
  return (
    <button className="icon-btn theme-btn" title={`Appearance — ${THEMES[k].said}. Click for ${next.said}`} onClick={() => useApp.getState().setTheme(next.theme)}>
      <Icon name={THEMES[k].icon} />
    </button>
  )
}
