import { rm } from 'node:fs/promises'
import path from 'node:path'
import { boardCard, check, readJson, test, tipOf } from './support/app'

test('make a board, and the app reopens it next time', async ({ app }) => {
  await check('starts on an empty Boards screen', await app.js(`!!document.querySelector('.boards-empty')`))
  await check('says where boards are saved', (await app.js<string>(tipOf(`document.querySelector('.boards-root')`))) === app.dirs.boards)

  await app.newBoard('Space Game')
  await check('the new board has one tab', (await app.tabNames()).join() === 'Overview', await app.tabNames())
  await check('the window is named after the board', (await app.js(`document.title`)) === 'Space Game — PlanMe')
  const board = await readJson(path.join(app.boardDir('Space Game'), 'board.json'))
  await check('it is a folder of files', board.tabs.length === 1 && board.tabs[0].name === 'Overview', board)

  await app.relaunch()
  await check('reopens straight into the board', (await app.untilJs(`document.querySelector('.board-title')?.textContent`)) === 'Space Game')

  await app.goToBoards()
  await check('the board is listed', (await app.boardNames()).join() === 'Space Game', await app.boardNames())
  await check('it shows how many tabs', ((await app.js<string>(`document.querySelector('.board-meta').textContent`)) ?? '').startsWith('1 tab ·'))
  await app.relaunch()
  await check('closing a board means the app starts on the Boards screen', await app.js(`!!document.querySelector('.boards-screen')`))

  await app.click(boardCard('Space Game'))
  await check('clicking a board opens it', (await app.untilJs(`document.querySelector('.board-title')?.textContent`)) === 'Space Game')
})

test('rename, show in Finder and trash boards from the right-click menu', async ({ app }) => {
  // Stand-ins for Finder and the Trash, so the test never touches yours.
  await app.main(({ shell }) => {
    const g = globalThis as any
    g.__revealed = []
    shell.showItemInFolder = (p: string) => void g.__revealed.push(p)
    shell.trashItem = async (p: string) => {
      ;(process as any).getBuiltinModule('fs').rmSync(p, { recursive: true })
    }
  }, null)

  await app.newBoard('Alpha')
  await app.goToBoards()
  await app.newBoard('Beta')
  await app.goToBoards()
  await check('newest first', (await app.boardNames()).join() === 'Beta,Alpha', await app.boardNames())

  await app.rightClick(boardCard('Alpha'))
  await check('menu', (await app.menuLabels()).join() === 'Open,Rename…,Show in Finder,Restore from Backup…,Move to Trash…', await app.menuLabels())
  await app.pickMenu('Rename…')
  await app.answer('Platformer')
  await app.untilJs(`!!${boardCard('Platformer')}`)
  await check('renamed in the list', (await app.boardNames()).sort().join() === 'Beta,Platformer', await app.boardNames())
  await check('the folder was renamed', !!(await readJson(path.join(app.boardDir('Platformer'), 'board.json')).catch(() => null)))

  await app.rightClick(boardCard('Platformer'))
  await app.pickMenu('Show in Finder')
  const revealed = (await app.main(() => (globalThis as any).__revealed, null)) as string[]
  await check('shows the board in Finder', revealed[0] === path.join(app.boardDir('Platformer'), 'board.json'), revealed)

  await app.rightClick(boardCard('Beta'))
  await app.pickMenu('Move to Trash…')
  await app.untilJs(`!${boardCard('Beta')}`)
  await check('trashed board is gone from the list', (await app.boardNames()).join() === 'Platformer', await app.boardNames())

  // Board names that already exist get a number.
  await app.newBoard('Platformer')
  await check('a second board with the same name gets a number', (await app.js(`document.querySelector('.board-title').textContent`)) === 'Platformer 2')
})

test('a board removed in Finder is skipped at startup', async ({ app }) => {
  await app.newBoard('Gone Soon')
  await app.close()
  await rm(app.boardDir('Gone Soon'), { recursive: true })
  await app.start()
  await check('starts on the Boards screen instead', await app.js(`!!document.querySelector('.boards-empty')`))
})
