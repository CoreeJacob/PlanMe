import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { byText, check, readJson, test, toolbarButton } from './support/app'

test('the keyboard shortcuts sheet', async ({ app }) => {
  await app.newBoard('Game')
  await app.menuCommand('shortcuts')
  await check('⌘/ shows every key', (await app.js<string>(`document.querySelector('.shortcuts-sheet')?.textContent ?? ''`)).includes('Zoom to fit everything'))
  await app.key('Escape', 'Escape')
  await check('Escape closes it', !(await app.js(`!!document.querySelector('.shortcuts-sheet')`)))
  await app.click(`document.querySelector('.topbar-end [title^="Keyboard shortcuts"], .topbar-end [data-tip^="Keyboard shortcuts"]')`)
  await check('the keyboard button shows it too', await app.js(`!!document.querySelector('.shortcuts-sheet')`))
  await app.click(byText('.shortcuts-sheet .btn', 'Done'))
  await check('Done closes it', !(await app.js(`!!document.querySelector('.shortcuts-sheet')`)))
})

test('light, dark, or the same as the Mac, remembered', async ({ app }) => {
  await app.newBoard('Game')
  // Playwright makes pages look light unless told otherwise; let the app decide.
  await app.page.emulateMedia({ colorScheme: null })
  const dark = () => app.js<boolean>(`matchMedia('(prefers-color-scheme: dark)').matches`)
  const background = () => app.js<string>(`getComputedStyle(document.body).backgroundColor`)
  await app.menuCommand('themeDark')
  await app.until(dark)
  await check('View ▸ Appearance ▸ Dark makes it dark', (await dark()) && (await background()) === 'rgb(20, 21, 26)', await background())
  await app.menuCommand('themeLight')
  await app.until(async () => !(await dark()))
  await check('…and Light makes it light', (await background()) === 'rgb(244, 245, 248)', await background())
  const settings = await app.until(async () => {
    const s = await readJson(path.join(app.dirs.userData, 'settings.json')).catch(() => null)
    return s?.theme === 'light' ? s : null
  })
  await check('the choice is saved', !!settings)
  await app.relaunch()
  await app.page.emulateMedia({ colorScheme: null })
  await app.untilJs(`!!document.querySelector('.canvas')`)
  await check('…and still light after a restart', !(await dark()))
  await app.click(`document.querySelector('.theme-btn')`)
  await app.until(dark)
  await check('the top-bar button goes on to Dark', await dark())
})

test('B, I and U show what’s on where you’re typing', async ({ app }) => {
  await app.newBoard('Game')
  await app.doubleClickAt(await app.canvasPoint())
  await app.untilEditing()
  const pressed = () => app.js<string>(`[...document.querySelectorAll('.item-toolbar .toolbar-btn.active')].map(b => b.textContent).join()`)
  await check('nothing pressed at first', (await pressed()) === '', await pressed())
  await app.click(toolbarButton('Bold'))
  await check('B looks pressed once bold is on', (await pressed()) === 'B', await pressed())
  await app.type('Strong')
  await app.js(`document.execCommand('italic')`)
  await app.type(' and leaning')
  await check('…italic too, after ⌘I', (await pressed()) === 'B,I', await pressed())
  // Back to the start of the words: bold only there.
  await app.js(`(() => { const r = document.createRange(); r.setStart(document.querySelector('.item-editor').firstChild.firstChild, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); return 1 })()`)
  await app.until(async () => (await pressed()) === 'B')
  await check('moving the caret shows the style there', (await pressed()) === 'B', await pressed())
})

test('boards are backed up beside the boards folder, and can be restored as a new board', async ({ app }) => {
  // Back up on every save (normally at most once an hour), so the test needn't wait.
  await app.main(() => {
    process.env['PLANME_BACKUP_EVERY_MS'] = '0'
  }, null)
  await app.newBoard('Game')
  const backups = path.join(path.dirname(app.dirs.boards), 'PlanMe Backups', 'Game')
  const made = () => readdir(backups).catch(() => [] as string[])
  await app.noteAt(0, 0, 'First idea')
  const first = await app.until(async () => ((await made()).length >= 1 ? made() : null))
  await check('the first change backs the board up, in PlanMe Backups next to the boards', (first ?? []).length >= 1, first)

  await app.goToBoards()
  await app.click(byText('.boards-header .btn', 'Backups'))
  await app.untilJs(`document.querySelectorAll('.backup-row').length > 0`)
  await check('the Backups dialog lists the board and its backups', (await app.js(`document.querySelector('.backups-board.active .backups-board-name').textContent`)) === 'Game')
  const rows = await app.js<number>(`document.querySelectorAll('.backup-row').length`)
  await app.click(`[...document.querySelectorAll('.backup-restore')].at(-1)`)
  const toast = await app.toast('Restored as')
  await check('Restore adds it as a new board', toast.includes('Restored as “Game ('), toast)
  await app.until(async () => (await app.boardNames()).length === 2)
  const names = await app.boardNames()
  await check('…alongside the original', names.includes('Game') && names.some((n) => n.startsWith('Game (')), names)
  await check('the dialog closes', !(await app.js(`!!document.querySelector('.backups-dialog')`)) && rows > 0)
})
