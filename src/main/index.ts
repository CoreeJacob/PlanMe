import { randomUUID } from 'node:crypto'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, protocol, shell } from 'electron'
import { IMAGE_EXTENSIONS, type MenuCommand, type SaveRequest, type Startup, type Theme } from '@shared/types'
import { backupsRoot, backUpIfDue, listBackups, renameBackups, restoreBackup } from './backups'
import { createBoard, isBoard, listBoards, openBoard, renameBoard, saveBoard } from './boards'
import { writeGuide } from './guide'
import {
  createImageFolder,
  importImage,
  imagePath,
  libraryPath,
  listImages,
  MAX_SIDE,
  moveImages,
  renameImageEntry,
  saveImage,
  type Shrink
} from './images'
import { SettingsStore, type Settings } from './settings'
import { BoardWatcher } from './watch'

// A board's images are shown as board://image/<path in the board>?board=<the board's folder>.
protocol.registerSchemesAsPrivileged([{ scheme: 'board', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

/** Saves very large PNG and JPEG pictures shrunk to MAX_SIDE on their longest side; anything else as it was. */
const shrink: Shrink = (bytes, ext) => {
  if (!['png', 'jpg', 'jpeg'].includes(ext)) return bytes
  const picture = nativeImage.createFromBuffer(Buffer.from(bytes))
  const { width, height } = picture.getSize()
  if (picture.isEmpty() || Math.max(width, height) <= MAX_SIDE) return bytes
  const smaller = width >= height ? picture.resize({ width: MAX_SIDE, quality: 'best' }) : picture.resize({ height: MAX_SIDE, quality: 'best' })
  return ext === 'png' ? smaller.toPNG() : smaller.toJPEG(90)
}

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

/** Opens a web page in the browser. Only http and https: a link must never run or open a file. */
async function openWebLink(url: string): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only web addresses (http or https) can be opened.')
  await shell.openExternal(parsed.toString())
}

/** Watches the open board's images folder, so pictures moved in Finder show up (and get found). */
let imageWatcher: FSWatcher | null = null
let imageWatchTimer: ReturnType<typeof setTimeout> | undefined

async function watchImages(board: string | null): Promise<void> {
  imageWatcher?.close()
  imageWatcher = null
  if (!board) return
  const dir = libraryPath(board, '')
  await fs.mkdir(dir, { recursive: true })
  imageWatcher = watch(dir, { recursive: true }, () => {
    // A burst of changes (a folder moved in Finder, say) becomes one message.
    clearTimeout(imageWatchTimer)
    imageWatchTimer = setTimeout(() => mainWindow?.webContents.send('images:changed'), 250)
  })
}
/** The open board's files, so changes made outside PlanMe (say, by an assistant) show up. */
const boardWatcher = new BoardWatcher(() => mainWindow?.webContents.send('board:changedOutside'))

/** The boards folder, so boards added or removed in Finder show up on the Boards screen. */
let rootWatcher: FSWatcher | null = null
let rootWatchTimer: ReturnType<typeof setTimeout> | undefined

/** Watches the boards folder, and puts the file-format guide in it for other apps. */
async function adoptRoot(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  await writeGuide(root).catch((err) => console.error('Could not write the file-format guide', err))
  rootWatcher?.close()
  rootWatcher = watch(root, () => {
    clearTimeout(rootWatchTimer)
    rootWatchTimer = setTimeout(() => mainWindow?.webContents.send('boards:listChanged'), 300)
  })
}

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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14151a' : '#f4f5f8',
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
  // Dropping a file anywhere the board doesn't take it mustn't open the file in place of the app.
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  // Open external links in the browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openWebLink(url).catch((err) => console.error(err))
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/** Light, dark or the Mac's own: the app's look, its menus and its dialogs all follow it. */
async function setTheme(theme: Theme): Promise<void> {
  nativeTheme.themeSource = theme
  await updateSettings({ theme })
  buildMenu(theme)
}

function buildMenu(theme: Theme): void {
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
          { label: 'Link to…', accelerator: 'CmdOrCtrl+K', click: send('link') },
          { label: 'Lock or Unlock', accelerator: 'Shift+CmdOrCtrl+L', click: send('lock') },
          { label: 'Make Group…', accelerator: 'CmdOrCtrl+G', click: send('group') },
          { label: 'Ungroup', accelerator: 'Shift+CmdOrCtrl+G', click: send('ungroup') },
          { type: 'separator' },
          { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: send('find') },
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
          // ⇧1 and ⇧2 are shown here but handled by the board, so they never stop "!" and "@" being typed.
          { label: 'Zoom to Fit', accelerator: 'Shift+1', registerAccelerator: false, click: send('zoomFit') },
          { label: 'Zoom to Selection', accelerator: 'Shift+2', registerAccelerator: false, click: send('zoomSelection') },
          { type: 'separator' },
          {
            label: 'Appearance',
            submenu: [
              { label: 'Same as the Mac', type: 'radio', checked: theme === 'system', click: send('themeSystem') },
              { label: 'Light', type: 'radio', checked: theme === 'light', click: send('themeLight') },
              { label: 'Dark', type: 'radio', checked: theme === 'dark', click: send('themeDark') }
            ]
          },
          { type: 'separator' },
          { label: 'Show/Hide Side Panel', accelerator: 'CmdOrCtrl+\\', click: send('togglePanel') },
          { label: 'Show/Hide Tags', accelerator: 'Alt+CmdOrCtrl+T', click: send('toggleTags') },
          { label: 'Show/Hide Details', accelerator: 'CmdOrCtrl+E', click: send('details') },
          { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: send('nextTab') },
          { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: send('prevTab') },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { role: 'togglefullscreen' }
        ]
      },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('shortcuts') }] }
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
    await adoptRoot(root)
    let board = null
    if (lastBoard && (await isBoard(lastBoard))) {
      // A damaged or too-new board shouldn't stop the app starting: show the Boards screen instead.
      board = await openBoard(lastBoard).catch((err) => (console.error(err), null))
    }
    return { root, board, theme: (await settings.get()).theme ?? 'system' }
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
  handle('boards:rename', async (dir: string, name: string) => {
    const renamed = await renameBoard(dir, name)
    await renameBackups(dir, renamed).catch((err) => console.error('Could not rename backups', err))
    return renamed
  })
  handle('boards:trash', (dir: string) => shell.trashItem(dir))
  handle('boards:reveal', (dir: string) => shell.showItemInFolder(path.join(dir, 'board.json')))
  handle('boards:chooseRoot', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a Folder for Your Boards',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    await updateSettings({ boardsRoot: result.filePaths[0] })
    await adoptRoot(result.filePaths[0])
    return result.filePaths[0]
  })
  handle('boards:save', async (dir: string, request: SaveRequest) => {
    // Before the first save in an hour, back the board up as it was. A backup that fails mustn't stop the save.
    await backUpIfDue(dir).catch((err) => console.error('Could not back up', err))
    // The watcher is told what PlanMe writes, so its own saves don't look like outside changes,
    // and it holds the save back if there's an outside change to bring in first.
    return boardWatcher.whileSaving(dir, () => saveBoard(dir, request, (file, text) => boardWatcher.wrote(file, text)))
  })
  handle('board:watch', (dir: string | null) => boardWatcher.watch(dir))
  // Read again after a change from outside: strict, as a file may still be half-written.
  handle('boards:read', (dir: string) => boardWatcher.read(dir, () => openBoard(dir, { strict: true })))
  handle('backups:list', async () => listBackups(await boardsRoot()))
  handle('backups:restore', async (board: string, id: string) => path.basename(await restoreBackup(await boardsRoot(), board, id)))
  handle('backups:reveal', async (board?: string) => {
    const top = backupsRoot(await boardsRoot())
    await fs.mkdir(top, { recursive: true })
    if (board && path.basename(board) === board) shell.showItemInFolder(path.join(top, board))
    else await shell.openPath(top)
  })
  handle('app:setTheme', (theme: Theme) => setTheme(theme))
  handle('boards:setLast', (dir: string | null) => updateSettings({ lastBoard: dir }))
  handle('images:import', async (board: string, paths: string[]) => {
    const imported = []
    for (const p of paths) imported.push(await importImage(board, p, shrink))
    return imported
  })
  handle('images:importData', (board: string, name: string, data: Uint8Array) => saveImage(board, name, data, shrink))
  handle('images:copy', async (from: string, src: string, to: string) => importImage(to, imagePath(from, src), shrink))
  handle('images:list', (board: string) => listImages(board))
  handle('images:watch', (board: string | null) => watchImages(board))
  handle('images:createFolder', (board: string, parent: string, name: string) => createImageFolder(board, parent, name))
  handle('images:move', (board: string, entries: string[], folder: string) => moveImages(board, entries, folder))
  handle('images:rename', (board: string, entry: string, name: string) => renameImageEntry(board, entry, name))
  handle('images:trash', async (board: string, entries: string[]) => {
    for (const entry of entries) await shell.trashItem(libraryPath(board, entry))
  })
  handle('images:reveal', (board: string, entry: string) => shell.showItemInFolder(libraryPath(board, entry)))
  handle('images:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }]
    })
    return result.canceled || !result.filePaths.length ? null : result.filePaths
  })
  handle('app:openWebLink', (url: string) => openWebLink(url))
  handle('app:ask', async ({ message, detail, buttons }: { message: string; detail?: string; buttons: string[] }) => {
    const result = await dialog.showMessageBox(mainWindow!, { type: 'question', message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1 })
    return result.response
  })
}

function registerProtocol(): void {
  protocol.handle('board', async (request) => {
    const url = new URL(request.url)
    try {
      const file = imagePath(url.searchParams.get('board') ?? '', decodeURIComponent(url.pathname.replace(/^\/+/, '')))
      return await net.fetch(pathToFileURL(file).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(async () => {
  registerProtocol()
  registerIpc()
  // The saved look first, so the window opens in it.
  const theme = (await settings.get()).theme ?? 'system'
  nativeTheme.themeSource = theme
  buildMenu(theme)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
