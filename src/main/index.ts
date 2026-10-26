import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import type { MenuCommand, SaveRequest, Startup } from '@shared/types'
import { createBoard, isBoard, listBoards, openBoard, renameBoard, saveBoard } from './boards'
import { SettingsStore, type Settings } from './settings'

// Lets a test run use its own settings (and so its own boards) instead of yours.
const testData = process.env['PLANME_USER_DATA']
if (testData) app.setPath('userData', testData)

const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'))
const updateSettings = (patch: Settings): Promise<void> => settings.update(patch)

/**
 * Where boards go unless you've chosen somewhere else. A test run never falls back to your
 * Documents folder: it uses a folder inside its own throwaway data instead.
 */
const defaultRoot = (): string => (testData ? path.join(testData, 'Boards') : path.join(app.getPath('documents'), 'PlanMe'))
const boardsRoot = async (): Promise<string> => (await settings.get()).boardsRoot ?? defaultRoot()

let mainWindow: BrowserWindow | null = null
/** Set by ⌘Q. Holding the window open to save cancels quitting, so quit again once it's closed. */
let quitting = false
app.on('before-quit', () => {
  quitting = true
})

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'PlanMe',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#f4f5f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => window.show())

  // Before the window closes, let the UI finish saving (a few seconds at most).
  let flushed = false
  window.on('close', (event) => {
    if (flushed) return
    event.preventDefault()
    const finish = (): void => {
      if (flushed) return
      flushed = true
      ipcMain.removeListener('app:flushed', finish)
      if (!window.isDestroyed()) window.close()
      if (quitting) app.quit()
    }
    ipcMain.once('app:flushed', finish)
    setTimeout(finish, 3000)
    window.webContents.send('app:flush')
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  // Open external links in the browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const send = (command: MenuCommand) => () => mainWindow?.webContents.send('menu:command', command)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { label: 'New Board…', accelerator: 'CmdOrCtrl+Shift+N', click: send('newBoard') },
          { label: 'All Boards', accelerator: 'CmdOrCtrl+Shift+B', click: send('boards') },
          { label: 'Show Board in Finder', click: send('revealBoard') },
          { type: 'separator' },
          { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: send('newTab') },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: send('selectAll') },
          { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: send('duplicate') },
          { type: 'separator' },
          { label: 'Bring to Front', accelerator: 'CmdOrCtrl+]', click: send('bringToFront') },
          { label: 'Send to Back', accelerator: 'CmdOrCtrl+[', click: send('sendToBack') }
        ]
      },
      {
        label: 'View',
        submenu: [
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: send('zoomIn') },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: send('zoomOut') },
          { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: send('zoomReset') },
          { type: 'separator' },
          { label: 'Show/Hide Side Panel', accelerator: 'CmdOrCtrl+\\', click: send('togglePanel') },
          { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: send('nextTab') },
          { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: send('prevTab') },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'togglefullscreen' }
        ]
      },
      { role: 'windowMenu' }
    ])
  )
}

function registerIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void => {
    ipcMain.handle(channel, (_event, ...args) => fn(...(args as A)))
  }

  handle('app:startup', async (): Promise<Startup> => {
    const { lastBoard } = await settings.get()
    const root = await boardsRoot()
    await fs.mkdir(root, { recursive: true })
    let board = null
    if (lastBoard && (await isBoard(lastBoard))) {
      // A damaged or too-new board shouldn't stop the app starting: show the Boards screen instead.
      board = await openBoard(lastBoard).catch((err) => (console.error(err), null))
    }
    return { root, board }
  })
  handle('boards:list', async () => listBoards(await boardsRoot()))
  handle('boards:create', async (name: string) => {
    const dir = await createBoard(await boardsRoot(), name, randomUUID())
    await updateSettings({ lastBoard: dir })
    return openBoard(dir)
  })
  handle('boards:open', async (dir: string) => {
    const board = await openBoard(dir)
    await updateSettings({ lastBoard: dir })
    return board
  })
  handle('boards:rename', (dir: string, name: string) => renameBoard(dir, name))
  handle('boards:trash', (dir: string) => shell.trashItem(dir))
  handle('boards:reveal', (dir: string) => shell.showItemInFolder(path.join(dir, 'board.json')))
  handle('boards:chooseRoot', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a Folder for Your Boards',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    await updateSettings({ boardsRoot: result.filePaths[0] })
    return result.filePaths[0]
  })
  handle('boards:save', (dir: string, request: SaveRequest) => saveBoard(dir, request))
  handle('boards:setLast', (dir: string | null) => updateSettings({ lastBoard: dir }))
  handle('app:ask', async ({ message, detail, buttons }: { message: string; detail?: string; buttons: string[] }) => {
    const result = await dialog.showMessageBox(mainWindow!, { type: 'question', message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1 })
    return result.response
  })
}

app.whenReady().then(() => {
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
