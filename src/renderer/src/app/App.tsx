import { useEffect } from 'react'
import type { MenuCommand } from '@shared/types'
import { flushSave, startSaving } from '@/board/saver'
import { useBoard } from '@/board/store'
import { bringSelectedToFront, duplicateSelected, groupSelected, linkSelected, selectAll, sendSelectedToBack, toggleLockOnSelected, ungroupSelected } from '@/canvas/actions'
import { zoomReset, zoomStep, zoomToFit, zoomToSelection } from '@/canvas/current'
import { isTyping } from '@/lib/dom'
import { cycleTab, goToBoards, newBoard, newTab } from './actions'
import { BoardScreen } from './BoardScreen'
import { BoardsScreen } from './BoardsScreen'
import { BackupsDialog } from './BackupsDialog'
import { LinkPicker } from './LinkPicker'
import { ShortcutsSheet } from './ShortcutsSheet'
import { PromptDialog, Toasts } from './Overlays'
import { toolForKey } from './SidePanel'
import { StatusEditor } from './StatusEditor'
import { TagEditor } from './TagEditor'
import { Tooltips } from './Tooltips'
import { dialogOpen, useApp } from './store'

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
    case 'zoomFit':
      return zoomToFit()
    case 'zoomSelection':
      return zoomToSelection()
    case 'lock':
      return toggleLockOnSelected()
    case 'group':
      return void groupSelected()
    case 'ungroup':
      return ungroupSelected()
    case 'togglePanel':
      return app.setPanelOpen(!app.panelOpen)
    case 'toggleTags':
      return app.setShowTags(!app.showTags)
    case 'details':
      return app.setDetailsOpen(!app.detailsOpen)
    case 'selectAll':
      return selectAll()
    case 'duplicate':
      return duplicateSelected()
    case 'bringToFront':
      return bringSelectedToFront()
    case 'sendToBack':
      return sendSelectedToBack()
    case 'link':
      return linkSelected()
    case 'find':
      return app.find()
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
    void window.api.getStartup().then(({ root, board, theme }) => {
      useApp.setState({ root, theme })
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
        // These work anywhere, even while typing.
        if (command === 'themeSystem' || command === 'themeLight' || command === 'themeDark') {
          return useApp.getState().setTheme(command === 'themeSystem' ? 'system' : command === 'themeLight' ? 'light' : 'dark')
        }
        if (command === 'shortcuts') return useApp.getState().setShortcutsOpen(!useApp.getState().shortcutsOpen)
        if (command === 'undo' || command === 'redo' || command === 'selectAll') {
          if (isTyping() || dialogOpen()) return void document.execCommand(command)
        } else if (isTyping() && command !== 'find' && command !== 'details') {
          // Other board commands (⌘D, ⌘]…) wait until typing is finished. ⌘F doesn't: the search
          // takes the keyboard, which finishes the typing.
          return
        }
        if (command === 'newBoard') return void newBoard()
        if (command === 'boards') return void goToBoards()
        if (dialogOpen()) return
        if (useApp.getState().screen === 'board') runBoardCommand(command)
      }),
    []
  )

  // Single-key tool shortcuts (V, H…), except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useApp.getState().screen !== 'board' || isTyping() || dialogOpen()) return
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
      <StatusEditor />
      <TagEditor />
      <LinkPicker />
      <ShortcutsSheet />
      <BackupsDialog />
      <Toasts />
      <Tooltips />
    </div>
  )
}
