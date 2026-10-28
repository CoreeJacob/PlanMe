import { check, test, type App } from './support/app'

/** The Tasks panel's rows: "Tab: label (status)" for active ones, as listed. */
const taskRows = (app: App) =>
  app.js<string[]>(`[...document.querySelectorAll('.tasks-section .task-group')].flatMap(g => [...g.querySelectorAll('.task-row')].map(r =>
    g.querySelector('.task-tab').textContent + ': ' + r.querySelector('.task-label').textContent + (r.querySelector('.task-progress') ? ' ' + r.querySelector('.task-progress').textContent : '')))`)
const doneRows = (app: App) => app.js<string[]>(`[...document.querySelectorAll('.done-list .task-row')].map(r => r.querySelector('.task-label').textContent + ' @' + r.querySelector('.task-meta').textContent)`)
const chip = (name: string) => `[...document.querySelectorAll('.chip')].find(c => c.textContent.startsWith(${JSON.stringify(name)}))`
const task = (label: string) => `[...document.querySelectorAll('.task-row')].find(r => r.querySelector('.task-label').textContent === ${JSON.stringify(label)})`

/** A note with a status, centred on a board point; returns its id. */
async function noteWith(app: App, x: number, y: number, text: string, status: string): Promise<string> {
  const id = await app.noteAt(x, y, text)
  await app.setStatus(status)
  await app.key('Escape', 'Escape')
  return id
}

test('the Tasks panel lists work from every tab, filters it, and goes to it', async ({ app }) => {
  await app.newBoard('Game')
  await check('it starts empty, saying what it’s for', await app.js(`!!document.querySelector('.tasks-section .panel-empty')`))
  const boss = await noteWith(app, 0, 0, 'Boss fight', 'Blocked')
  await noteWith(app, 300, 0, 'Shop', 'Doing')
  await noteWith(app, 0, 300, 'Save system', 'To do')
  await app.noteAt(300, 300, 'No status here')
  await app.key('Escape', 'Escape')
  await app.addTab('Levels')
  const forest = await noteWith(app, 250, 250, 'Forest dungeon', 'Blocked')

  await check('grouped by tab, top to bottom then left to right', (await taskRows(app)).join(' | ') === 'Overview: Boss fight | Overview: Shop | Overview: Save system | Levels: Forest dungeon', await taskRows(app))
  await check('chips count each status', (await app.js(`${chip('All')}.textContent`)) === 'All 4' && (await app.js(`${chip('Blocked')}.textContent`)) === 'Blocked 2')

  // Filter, and dim the rest of the board.
  await app.click(chip('Blocked'))
  await check('filtering shows just that status', (await taskRows(app)).join(' | ') === 'Overview: Boss fight | Levels: Forest dungeon', await taskRows(app))
  await app.click(`document.querySelector('.dim-switch input')`)
  await check('“Dim the rest” fades what doesn’t match, on this tab too', (await app.item(forest)).classes.includes('dimmed') === false && (await app.items()).filter((i) => i.classes.includes('dimmed')).length === 0, await app.items())

  // Go to a task on the other tab.
  await app.click(task('Boss fight'))
  await check('clicking a task switches to its tab', (await app.activeTab()) === 'Overview')
  await check('…selects it', (await app.selectedIds()).join() === boss)
  await check('…and flashes it', (await app.item(boss)).classes.includes('flashing'))
  const view = await app.view()
  const b = await app.item(boss)
  await check('…in the middle of the screen', Math.abs(view.x - (b.x + b.w / 2)) < 0.5 && Math.abs(view.y - (b.y + b.h / 2)) < 0.5, { view, b })
  const dimmed = (await app.items()).filter((i) => i.classes.includes('dimmed')).map((i) => i.text).sort()
  await check('things that aren’t Blocked are faded', dimmed.join() === 'No status here,Save system,Shop', dimmed)
  await app.click(chip('All'))
  await check('back to All: nothing faded', (await app.items()).every((i) => !i.classes.includes('dimmed')))
})

test('finished work gathers in the Done list but stays on the board', async ({ app }) => {
  await app.newBoard('Game')
  await noteWith(app, 0, 0, 'Title screen', 'Done')
  const shop = await noteWith(app, 300, 0, 'Shop', 'Doing')
  await app.tool('l')
  await app.clickAt(...(await app.screenOf(0, 400)))
  await app.type('Level 1')
  await app.key('Enter', 'Enter')
  await app.type('Map')
  await app.key('Escape', 'Escape')
  const list = (await app.lastItem()).id
  await check('the Done list is folded away, with a count', (await app.js(`document.querySelector('.done-toggle').textContent`)) === 'Done 1' && !(await app.js(`!!document.querySelector('.done-list')`)))
  await check('a to-do list shows its progress in Tasks', (await taskRows(app)).includes('Overview: Level 1 0/1'), await taskRows(app))

  // Ticking the list's last line finishes it: it moves to Done, newest first.
  await app.click(`document.querySelector('[data-item-id="${list}"] .todo-box')`)
  await app.click(`document.querySelector('.done-toggle')`)
  await check('open, newest first, with its tab', (await doneRows(app)).join(' | ') === 'Level 1 @Overview | Title screen @Overview', await doneRows(app))
  await check('it’s gone from the unfinished tasks', !(await taskRows(app)).some((r) => r.includes('Level 1')), await taskRows(app))
  await check('finished things are still on the board', (await app.items()).length === 3)

  // Finishing the shop by hand puts it at the top of Done.
  await app.click(`document.querySelector('[data-item-id="${shop}"]')`)
  await app.setStatus('Done')
  await check('newest at the top', (await doneRows(app))[0] === 'Shop @Overview', await doneRows(app))
  await app.click(task('Title screen'))
  await check('clicking a done item goes to it', (await app.selectedIds()).length === 1 && (await app.item((await app.selectedIds())[0])).text === 'Title screen')

  await app.relaunch()
  await app.untilJs(`!!document.querySelector('.done-toggle')`)
  await check('the Done list stays open after a restart', await app.js(`!!document.querySelector('.done-list')`))
})
