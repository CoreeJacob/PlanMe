import path from 'node:path'
import { check, readJson, SHIFT, tab, test, type App } from './support/app'

const texts = async (app: App) => (await app.items()).map((i) => i.text).join()
const outline = (app: App) => app.js<string>(`[...document.querySelectorAll('.group-label')].map(l => l.textContent).join()`)
const byText = async (app: App, text: string) => (await app.items()).find((i) => i.text === text)!

test('linked groups: make one, copy it to another tab, and copies stay the same', async ({ app }) => {
  await app.newBoard('Game')
  const hero = await app.noteAt(-150, 0, 'Hero')
  const sword = await app.noteAt(150, 0, 'Sword')
  await app.drawArrow([-150, 0], [150, 0])
  await app.key('Escape', 'Escape')
  await app.noteAt(0, 350, 'Not in it')

  await app.clickAt(...(await app.itemCentre(hero)))
  await app.clickAt(...(await app.itemCentre(sword)), 'left', SHIFT)
  await app.menuCommand('group')
  await app.answer('Hero')
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.itemCentre(sword)))
  await check('clicking one part picks the whole group (and the arrow between)', (await app.selectedIds()).length === 3, await app.selectedIds())
  await check('…shown with its name', (await outline(app)) === 'Hero', await outline(app))
  const board = await app.until(async () => (await readJson(path.join(app.boardDir('Game'), 'board.json'))).groups)
  await check('the group is saved with the board', board?.[0]?.name === 'Hero', board)

  // A linked copy on another tab, from the Groups panel.
  await app.addTab('Level 2')
  await app.click(`[...document.querySelectorAll('.panel-tab')].find(t => t.textContent.includes('Groups'))`)
  await check('the Groups panel lists it', (await app.js(`document.querySelector('.group-title')?.textContent`)) === 'Hero')
  await app.click(`document.querySelector('.group-place')`)
  await check('Place puts a copy on this tab', (await texts(app)) === 'Hero,Sword' && (await app.arrows()).length === 1, await texts(app))
  await check('…which says which tabs have one', (await app.js(`[...document.querySelectorAll('.group-tabs .chip')].map(c => c.textContent).join()`)) === 'Overview,Level 2')

  // Change a part in the copy: double-click goes inside the group to type.
  await app.key('Escape', 'Escape')
  await app.doubleClickAt(await app.itemCentre((await byText(app, 'Sword')).id))
  await app.untilEditing()
  await check('double-clicking a part works inside the group', (await outline(app)).startsWith('Inside “Hero”'), await outline(app))
  await app.type(' of fire')
  await app.key('Escape', 'Escape')
  await app.key('Escape', 'Escape')
  // Move the whole copy here: only this copy moves.
  const copySword = await byText(app, 'Sword of fire')
  const [sx, sy] = await app.itemCentre(copySword.id)
  await app.drag([[sx, sy], [sx + 30, sy + 30], [sx + 100, sy + 80]])
  await app.click(tab('Overview'))
  await check('the change shows in the other copy', (await texts(app)).includes('Sword of fire'), await texts(app))
  const original = await byText(app, 'Sword of fire')
  await check('…but moving a whole copy only moves that one', original.x === 50 && original.y === -100, original)

  // A linked task is listed once.
  await app.clickAt(...(await app.itemCentre(original.id)))
  await app.doubleClickAt(await app.itemCentre(original.id))
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.itemCentre(original.id)))
  await app.setStatus('Doing')
  await app.click(`[...document.querySelectorAll('.panel-tab')].find(t => t.textContent.includes('Tasks'))`)
  const rows = await app.js<string>(`[...document.querySelectorAll('.tasks-section .task-row')].map(r => r.textContent).join(' | ')`)
  await check('a task in a linked group is listed once, with its number of copies', rows.includes('×2') && rows.split(' | ').length === 1, rows)

  // Unlinking a copy makes its parts ordinary items again.
  await app.click(tab('Level 2'))
  await app.clickAt(...(await app.itemCentre((await byText(app, 'Hero')).id)), 'right')
  await app.pickMenu('Unlink from “Hero”')
  await app.doubleClickAt(await app.itemCentre((await byText(app, 'Hero')).id))
  await app.untilEditing()
  await app.type(' alone')
  await app.key('Escape', 'Escape')
  await app.click(tab('Overview'))
  await check('after unlinking, changes stay in that copy', (await texts(app)).includes('Hero,') && !(await texts(app)).includes('alone'), await texts(app))
})

/** A board with a "Hero" group (two notes) on its first tab; returns the notes' ids. */
async function heroGroup(app: App): Promise<[string, string]> {
  await app.newBoard('Game')
  const hero = await app.noteAt(-150, 0, 'Hero')
  const sword = await app.noteAt(150, 0, 'Sword')
  await app.clickAt(...(await app.itemCentre(hero)))
  await app.clickAt(...(await app.itemCentre(sword)), 'left', SHIFT)
  await app.menuCommand('group')
  await app.answer('Hero')
  await app.key('Escape', 'Escape')
  return [hero, sword]
}
const groupsPanel = `[...document.querySelectorAll('.panel-tab')].find(t => t.textContent.includes('Groups'))`
const copyTabs = (app: App) => app.js<string>(`[...document.querySelectorAll('.group-tabs .chip')].map(c => c.textContent).join()`)

test('a group can be cut and pasted onto another tab, or dragged there from the Groups panel, staying linked', async ({ app }) => {
  const [hero] = await heroGroup(app)
  await app.clickAt(...(await app.itemCentre(hero)))
  await app.clipboard('cut')
  await check('cutting the group takes it off the tab', (await app.items()).length === 0)
  await app.addTab('Level 2')
  await app.clipboard('paste')
  await app.click(groupsPanel)
  await check('pasted on another tab, it’s still the group', (await app.js(`document.querySelector('.group-title')?.textContent`)) === 'Hero' && (await copyTabs(app)) === 'Level 2', await copyTabs(app))

  // Drag it from the panel for a second copy, here.
  const dropped = await app.dragDrop(`document.querySelector('.group-row')`, `document.querySelector('.canvas')`, { at: { clientX: 'left + 250', clientY: 'top + 650' } })
  await check('dragging a group from the panel onto the board places a copy there', dropped && (await app.items()).length === 4 && (await copyTabs(app)) === 'Level 2,Level 2', await copyTabs(app))

  // Still linked: change one copy, and the other follows.
  const first = (await app.items()).find((i) => i.text === 'Hero')!
  await app.doubleClickAt(await app.itemCentre(first.id))
  await app.untilEditing()
  await app.type(' lvl 2')
  await app.key('Escape', 'Escape')
  await check('the copies are linked', (await app.items()).filter((i) => i.text === 'Hero lvl 2').length === 2, await texts(app))
})

test('jumping to part of a group selects the whole group, so Delete takes only this copy', async ({ app }) => {
  await heroGroup(app)
  await app.addTab('Level 2')
  await app.click(groupsPanel)
  await app.click(`document.querySelector('.group-place')`)
  await app.key('Escape', 'Escape')

  // Search for the sword on this tab and jump to it.
  await app.menuCommand('find')
  await app.setInput('.side-panel .search-input', 'sword')
  await app.click(`[...document.querySelectorAll('.result-row')].find(r => r.textContent.includes('Level 2'))`)
  await check('jumping there selects the whole group', (await app.selectedIds()).length === 2, await app.selectedIds())
  // Leave the search field, so Delete goes to the board.
  await app.js(`document.activeElement.blur()`)
  await app.key('Backspace', 'Backspace')
  await check('Delete removes this copy', (await app.items()).length === 0, await texts(app))
  await app.click(tab('Overview'))
  await check('…and leaves the other copy whole', (await texts(app)) === 'Hero,Sword', await texts(app))
})
