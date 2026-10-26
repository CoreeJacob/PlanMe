import { useEffect } from 'react'
import type { MenuCommand } from '@shared/types'
import { flushSave, startSaving } from '@/board/saver'
import { useBoard } from '@/board/store'
import { bringSelectedToFront, duplicateSelected, selectAll, sendSelectedToBack } from '@/canvas/actions'
import { zoomReset, zoomStep } from '@/canvas/Canvas'
import { isTyping } from '@/lib/dom'
import { cycleTab, goToBoards, newBoard, newTab } from './actions'
import { BoardScreen } from './BoardScreen'
import { BoardsScreen } from './BoardsScreen'
import { PromptDialog, Toasts } from './Overlays'
import { toolForKey } from './SidePanel'
import { Tooltips } from './Tooltips'
import { useApp } from './store'

/** What each menu bar command does while a board is open. */
function runBoardCommand(command: MenuCommand): void {
  const board = useBoard.getState()
  const app = useApp.getState()
  switch (command) {
    case 'undo':
      return board.undo()
    case 'redo':
      return board.redo()
    case 'newTab':
      return app.setEditingTab(newTab())
    case 'nextTab':
      return cycleTab(1)
    case 'prevTab':
      return cycleTab(-1)
    case 'zoomIn':
      return zoomStep(1)
    case 'zoomOut':
      return zoomStep(-1)
    case 'zoomReset':
      return zoomReset()
    case 'togglePanel':
      return app.setPanelOpen(!app.panelOpen)
    case 'selectAll':
      return selectAll()
    case 'duplicate':
      return duplicateSelected()
    case 'bringToFront':
      return bringSelectedToFront()
    case 'sendToBack':
      return sendSelectedToBack()
    case 'revealBoard':
      if (board.board) void window.api.revealBoard(board.board.path)
      return
  }
}

export function App() {
  const screen = useApp((s) => s.screen)
  const boardName = useBoard((s) => s.board?.name)

  // Start on the board that was open last time, or on the Boards screen.
  useEffect(() => {
    void window.api.getStartup().then(({ root, board }) => {
      useApp.setState({ root })
      if (board) useBoard.getState().load(board)
      useApp.getState().setScreen(board ? 'board' : 'boards')
    })
    return startSaving((message) => useApp.getState().toast(message, { kind: 'error' }))
  }, [])

  // The window waits for the last save before it closes.
  useEffect(() => window.api.onFlush(flushSave), [])

  // The app menu owns ⌘Z, ⌘A and friends, so pass them to a text box when one is being typed in.
  useEffect(
    () =>
      window.api.onMenuCommand((command) => {
        if (command === 'undo' || command === 'redo' || command === 'selectAll') {
          if (isTyping() || useApp.getState().prompt) return void document.execCommand(command)
        } else if (isTyping()) {
          // Other board commands (⌘D, ⌘]…) wait until typing is finished.
          return
        }
        if (command === 'newBoard') return void newBoard()
        if (command === 'boards') return void goToBoards()
        if (useApp.getState().prompt) return
        if (useApp.getState().screen === 'board') runBoardCommand(command)
      }),
    []
  )

  // Single-key tool shortcuts (V, H…), except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useApp.getState().screen !== 'board' || isTyping() || useApp.getState().prompt) return
      const tool = toolForKey(e)
      if (tool) {
        e.preventDefault()
        useApp.getState().setTool(tool)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = screen === 'board' && boardName ? `${boardName} — PlanMe` : 'PlanMe'
  }, [screen, boardName])

  return (
    <div className="app">
      {screen === 'loading' && <div className="loading" />}
      {screen === 'boards' && <BoardsScreen />}
      {screen === 'board' && <BoardScreen />}
      <PromptDialog />
      <Toasts />
      <Tooltips />
    </div>
  )
}
