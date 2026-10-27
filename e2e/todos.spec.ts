import path from 'node:path'
import { check, menuItem, pickerChoice, readJson, test, toolbarButton, type App } from './support/app'

/** The to-do list's lines as shown, with ✓ for ticked ones. */
const lines = (app: App, id: string) =>
  app.js<string[]>(`[...document.querySelectorAll('[data-item-id="${id}"] .todo-row')].map(r => (r.classList.contains('ticked') ? '✓' : '') + (r.querySelector('input')?.value ?? r.textContent))`)
const progress = (app: App, id: string) => app.js<string>(`document.querySelector('[data-item-id="${id}"] .todo-count').textContent`)
const badge = (app: App, id: string) => app.js<string | null>(`document.querySelector('[data-item-id="${id}"] .status-badge')?.textContent ?? null`)
const typingIn = (app: App) => app.js<string | undefined>(`document.activeElement?.dataset.part`)
const tick = (app: App, id: string, k: number) => app.click(`document.querySelectorAll('[data-item-id="${id}"] .todo-box')[${k}]`)
const setStatus = async (app: App, name: string) => {
  await app.click(toolbarButton('Status'))
  await app.click(pickerChoice(name))
}

test('to-do lists: type lines, tick them, and their status follows (unless you pick one)', async ({ app }) => {
  await app.newBoard('Game')
  await app.tool('l')
  await app.clickAt(...(await app.screenOf(0, 0)))
  const list = (await app.lastItem()).id
  await check('a new list opens on its title', (await app.until(() => typingIn(app))) === 'title')
  await app.type('Level 1')
  for (const line of ['Map', 'Enemies', 'Boss door']) {
    await app.key('Enter', 'Enter')
    await app.type(line)
  }
  await app.key('Enter', 'Enter')
  await app.key('Escape', 'Escape')
  await check('Return adds lines; an empty one left at the end goes', (await lines(app, list)).join() === 'Map,Enemies,Boss door', await lines(app, list))
  const title = await app.js<string>(`document.querySelector('[data-item-id="${list}"] .todo-title').textContent`)
  await check('the title', title === 'Level 1', title)
  await check('progress 0/3, and it says To do by itself', (await progress(app, list)) === '0/3' && (await badge(app, list)) === 'To do')
  await app.undo()
  await check('one undo takes the whole new list away', !(await app.items()).some((i) => i.id === list))
  await app.redo()

  await tick(app, list, 0)
  await check('ticking one: 1/3, Doing', (await progress(app, list)) === '1/3' && (await badge(app, list)) === 'Doing' && (await lines(app, list))[0] === '✓Map')
  await tick(app, list, 1)
  await tick(app, list, 2)
  await check('all ticked: Done, and it fades', (await badge(app, list)) === 'Done' && (await app.item(list)).classes.includes('is-finished'))
  await app.undo()
  await check('undo unticks the last one', (await progress(app, list)) === '2/3' && (await badge(app, list)) === 'Doing')

  // Pick a status yourself: it sticks, whatever the ticks. "Automatic" hands it back.
  await app.click(`document.querySelector('[data-item-id="${list}"] .todo-title')`)
  await setStatus(app, 'Blocked')
  await tick(app, list, 2)
  await check('a picked status stays, even when all are ticked', (await badge(app, list)) === 'Blocked', await badge(app, list))
  await app.click(`document.querySelector('[data-item-id="${list}"] .todo-title')`)
  await setStatus(app, 'Automatic')
  await check('Automatic goes back to following the ticks', (await badge(app, list)) === 'Done', await badge(app, list))

  // Double-click a line to change it; ↑ and ↓ move between lines; Backspace on an empty line removes it.
  await app.doubleClickAt(await app.centre(`document.querySelectorAll('[data-item-id="${list}"] .todo-text')[1]`))
  const second = await app.until(() => typingIn(app))
  await check('double-clicking a line types in that line', second !== 'title' && (await app.js(`document.activeElement.value`)) === 'Enemies', second)
  await app.key('ArrowUp', 'ArrowUp')
  await check('↑ moves to the line above', (await app.js(`document.activeElement.value`)) === 'Map')
  await app.key('Enter', 'Enter')
  await check('Return in the middle adds a line just after', (await lines(app, list)).join() === '✓Map,,✓Enemies,✓Boss door', await lines(app, list))
  await app.key('Backspace', 'Backspace')
  await check('Backspace on an empty line removes it', (await lines(app, list)).join() === '✓Map,✓Enemies,✓Boss door', await lines(app, list))
  await app.key('Escape', 'Escape')

  // Its width can change; its height follows the lines.
  await app.click(`document.querySelector('[data-item-id="${list}"] .todo-title')`)
  await check('a list has only side handles', (await app.js<string>(`[...document.querySelectorAll('.handle')].map(h => h.dataset.handle).join()`)) === 'e,w')

  const saved = await app.savedItems('Game', 0, 1)
  await check('saved with its lines and ticks', saved[0]?.entries?.map((e: any) => (e.done ? '✓' : '') + e.text).join() === '✓Map,✓Enemies,✓Boss door', saved[0])
  await app.relaunch()
  await app.untilJs(`!!document.querySelector('.item-todo')`)
  await check('it comes back after a restart', (await lines(app, list)).length === 3 && (await badge(app, list)) === 'Done')
})

test('statuses: pick one, finished ones fade, and edit the board’s list', async ({ app }) => {
  await app.newBoard('Game')
  const boss = await app.noteAt(0, 0, 'Boss fight')
  await setStatus(app, 'Blocked')
  await check('a badge shows the status', (await badge(app, boss)) === 'Blocked' && (await app.item(boss)).classes.includes('status-red'))
  const shop = await app.noteAt(300, 0, 'Shop')
  await app.rightClick(`document.querySelector('[data-item-id="${shop}"]')`)
  await app.js(`${menuItem('Status')}.click()`)
  await app.settle()
  await app.pickMenu('Done')
  await check('the right-click menu sets it too, and finished things fade', (await badge(app, shop)) === 'Done' && (await app.item(shop)).classes.includes('is-finished'))
  const town = await app.noteAt(600, 0, 'Town')
  await setStatus(app, 'Doing')
  await setStatus(app, 'No status')
  await check('No status takes it off', (await badge(app, town)) === null)
  await setStatus(app, 'Doing')

  // Edit the list: rename Blocked, add one, delete Doing (which Town uses).
  await app.click(toolbarButton('Status'))
  await app.click(`document.querySelector('.status-edit')`)
  await app.untilJs(`!!document.querySelector('.status-editor')`)
  await app.key('Backspace', 'Backspace')
  await check('the board’s shortcuts wait while the editor is open', (await app.items()).length === 3)
  await app.js(`window.__asked = []; window.confirm = (m) => (window.__asked.push(m), true); 1`)
  const rowOf = (name: string) => `[...document.querySelectorAll('.status-row')].find(r => r.querySelector('input').value === ${JSON.stringify(name)})`
  await app.js(`(() => { const i = ${rowOf('Blocked')}.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Waiting'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
  await app.click(`document.querySelector('.status-add')`)
  await app.click(`${rowOf('Doing')}.querySelector('[title^="Delete"]')`)
  await app.click(`document.querySelector('.status-editor button[type=submit]')`)
  const asked = await app.js<string[]>(`window.__asked`)
  await check('deleting a status that’s in use asks first, saying how many', asked[0]?.startsWith('Delete “Doing” (1 item)?'), asked)
  await check('renamed', (await badge(app, boss)) === 'Waiting')
  await check('the item that had the deleted status has none now', (await badge(app, town)) === null)
  await app.undo()
  await check('one undo puts the old list back', (await badge(app, boss)) === 'Blocked' && (await badge(app, town)) === 'Doing')
  await app.redo()

  const boardFile = path.join(app.boardDir('Game'), 'board.json')
  const saved = await app.until(async () => {
    const b = await readJson(boardFile)
    return b.statuses?.some((s: any) => s.name === 'Waiting') ? b.statuses : null
  })
  await check('the board’s statuses are saved with it', saved?.map((s: any) => s.name).join() === 'To do,Done,Waiting,New status', saved)
})
