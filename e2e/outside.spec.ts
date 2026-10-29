// Changes made to a board's files by another app (an assistant, say) while PlanMe is open.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { check, readJson, test, type App } from './support/app'

/** Writes a file the way the guide asks: to a temporary file, then renamed over the real one. */
async function writeWhole(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2))
  await rename(`${file}.tmp`, file)
}

const outsideNote = (id: string, text: string, x: number, y: number) => ({ id, type: 'note', text, x, y, w: 200, h: 200, color: 'pink' })

/** The board's files: board.json, and the first tab's file. */
async function files(app: App, board: string) {
  const dir = app.boardDir(board)
  const boardFile = await readJson(path.join(dir, 'board.json'))
  const tabFile = path.join(dir, 'tabs', `${boardFile.tabs[0].id}.json`)
  return { dir, boardFile, tabFile, tab: await readJson(tabFile) }
}

const texts = async (app: App) => (await app.items()).map((i) => i.text).sort().join()

test('changes made outside PlanMe show up while it’s open, flash, and can be undone', async ({ app }) => {
  await app.newBoard('Game')
  const guide = await readFile(path.join(app.dirs.boards, '.planme', 'file-format.md'), 'utf8').catch(() => '')
  await check('a file-format guide for other apps is kept in the boards folder (hidden)', guide.startsWith('# PlanMe file format'))
  await app.noteAt(-200, 0, 'Mine')
  await app.savedItems('Game', 0, 1)

  const { tab, tabFile } = await files(app, 'Game')
  await writeWhole(tabFile, { ...tab, items: [...tab.items, outsideNote('claude-1', 'From Claude', 200, 0)] })
  await app.until(async () => (await texts(app)) === 'From Claude,Mine')
  await check('a note added outside appears', (await texts(app)) === 'From Claude,Mine', await texts(app))
  const added = (await app.items()).find((i) => i.text === 'From Claude')!
  await check('…flashing', added.classes.includes('flashing'))
  const message = await app.toast('Updated from outside')
  await check('…with a message saying where', message.includes('Updated from outside: Overview (1 change)'), message)

  await app.undo()
  await check('⌘Z takes it back', (await texts(app)) === 'Mine', await texts(app))
  const saved = await app.savedItems('Game', 0, 1)
  await check('…in the files too', saved.map((i) => i.text).join() === 'Mine', saved)
  await app.redo()
  await check('redo brings it back', (await texts(app)) === 'From Claude,Mine')
})

test('an outside change waits while you type, and nothing of yours is lost', async ({ app }) => {
  await app.newBoard('Game')
  await app.noteAt(-200, 0, 'Mine')
  await app.savedItems('Game', 0, 1)

  // Typing when the change arrives: it waits until the typing's done.
  await app.doubleClickAt(await app.canvasPoint(0.5, 0.75))
  await app.untilEditing()
  await app.type('Typing')
  const { tab, tabFile } = await files(app, 'Game')
  await writeWhole(tabFile, { ...tab, items: [...tab.items, outsideNote('claude-1', 'From Claude', 200, 0)] })
  await app.wait(1200)
  await check('nothing changes while typing', (await texts(app)) === 'Mine,Typing' && (await app.isEditing()), await texts(app))
  await app.key('Escape', 'Escape')
  await app.until(async () => (await texts(app)).includes('From Claude'))
  await check('then it comes in, keeping what was typed', (await texts(app)) === 'From Claude,Mine,Typing', await texts(app))
  const saved = await app.savedItems('Game', 0, 3)
  await check('…and all of it is saved', saved.length === 3, saved)

  // A change in the app not saved yet when the files change outside: both are kept.
  const now = await files(app, 'Game')
  await app.noteAt(0, -250, 'Quick')
  await writeWhole(now.tabFile, { ...now.tab, items: [...now.tab.items, outsideNote('claude-2', 'Also Claude', 400, 0)] })
  const both = await app.savedItems('Game', 0, 5)
  await check('an unsaved change and an outside one both survive, on screen and on disk', both.length === 5 && (await texts(app)) === 'Also Claude,From Claude,Mine,Quick,Typing', {
    disk: both.map((i: any) => i.text),
    screen: await texts(app)
  })
})

test('new tabs from outside, and files that can’t be read yet', async ({ app }) => {
  await app.newBoard('Game')
  const { dir, boardFile, tabFile, tab } = await files(app, 'Game')

  // A tab file first, then board.json, as the guide says.
  await writeWhole(path.join(dir, 'tabs', 'bosses.json'), { format: 1, id: 'bosses', view: { x: 0, y: 0, zoom: 1 }, items: [outsideNote('boss', 'Dragon', 0, 0)] })
  await writeWhole(path.join(dir, 'board.json'), { ...boardFile, tabs: [...boardFile.tabs, { id: 'bosses', name: 'Bosses' }] })
  await app.until(async () => (await app.tabNames()).includes('Bosses'))
  await check('a tab added outside appears', (await app.tabNames()).join() === 'Overview,Bosses', await app.tabNames())
  const message = await app.toast('new tab')
  await check('…and the message says so', message.includes('new tab “Bosses”'), message)

  // Half-written (not the whole file in one go): it waits for the rest.
  await writeFile(tabFile, '{ "format": 1, "items": [')
  await app.toast('couldn’t be read yet')
  await check('a half-written file is reported, not loaded', (await app.items()).length === 0)
  await writeWhole(tabFile, { ...tab, items: [outsideNote('late', 'Finished', 0, 0)] })
  await app.until(async () => (await texts(app)) === 'Finished')
  await check('…and comes in once it’s complete', (await texts(app)) === 'Finished', await texts(app))
})

test('boards added outside appear on the Boards screen', async ({ app }) => {
  await app.newBoard('Game')
  await app.goToBoards()
  const dir = path.join(app.dirs.boards, 'From Claude')
  await writeWhole(path.join(dir, 'tabs', 'one.json'), { format: 1, id: 'one', view: { x: 0, y: 0, zoom: 1 }, items: [] })
  await writeWhole(path.join(dir, 'board.json'), { format: 1, tabs: [{ id: 'one', name: 'Overview' }] })
  await app.until(async () => (await app.boardNames()).includes('From Claude'))
  await check('a new board folder shows up without reopening', (await app.boardNames()).includes('From Claude'), await app.boardNames())
})
