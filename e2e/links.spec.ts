import { check, tab, test, tipOf, type App } from './support/app'

const picker = `document.querySelector('.link-picker')`
const badge = (id: string) => `document.querySelector('[data-item-id="${id}"] .link-badge')`
/** The Link picker's rows, as "text (meta)" with ✓ on the current one. */
const choices = (app: App) =>
  app.js<string[]>(`[...document.querySelectorAll('.link-picker .result-row')].map(r =>
    r.querySelector('.result-text').textContent + ' (' + (r.querySelector('.result-meta')?.textContent ?? '') + ')' + (r.classList.contains('current') ? ' ✓' : ''))`)
const choice = (text: string) => `[...document.querySelectorAll('.link-picker .result-row')].find(r => r.querySelector('.result-text').textContent === ${JSON.stringify(text)})`
const backChip = (app: App) => app.js<string>(`document.querySelector('.back-go')?.textContent ?? ''`)

/** Selects an item by clicking it. */
async function select(app: App, id: string): Promise<void> {
  await app.clickAt(...(await app.itemCentre(id)))
}

/** Opens the Link picker for an item (⌘K) and waits for it. */
async function openPicker(app: App, id: string): Promise<void> {
  await select(app, id)
  await app.menuCommand('link')
  await app.untilJs(`!!${picker}`)
}

test('links go to tabs and items, and Back comes back', async ({ app }) => {
  await app.newBoard('Game')
  const start = await app.noteAt(0, 0, 'Start')
  await app.addTab('Levels')
  const boss = await app.noteAt(400, 300, 'Boss fight')
  await app.click(tab('Overview'))
  await app.wheel(await app.canvasPoint(), 120, 80)
  const overviewView = await app.view()

  await openPicker(app, start)
  await check('⌘K opens the Link picker for the selected item', (await app.js(`${picker}.querySelector('h2').textContent`)) === 'Link “Start” to…')
  await check('…with the cursor in its search field', await app.js(`document.activeElement === ${picker}.querySelector('input')`))
  await check('it lists every tab, then every other item', (await choices(app)).join(' | ') === 'Overview (Tab) | Levels (Tab) | Boss fight (Levels)', await choices(app))
  await app.setInput('.link-picker input', 'boss')
  await check('typing narrows the list', (await choices(app)).join(' | ') === 'Boss fight (Levels)', await choices(app))
  await app.key('Enter', 'Enter')
  await check('Return picks it and closes the picker', !(await app.js(`!!${picker}`)))
  await check('the item shows a link badge', await app.js(`!!${badge(start)}`))
  await check('…saying where it goes', (await app.js(tipOf(badge(start)))) === 'Go to “Boss fight” on Levels', await app.js(tipOf(badge(start))))
  const [saved] = (await app.until(async () => {
    const items = await app.savedItems('Game', 0, 1)
    return items[0]?.link ? items : null
  })) ?? [{}]
  await check('the link is saved with the item', saved.link?.type === 'item' && saved.link?.item === boss, saved.link)
  await app.undo()
  await check('linking is one undo step', !(await app.js(`!!${badge(start)}`)))
  await app.redo()

  // Follow it.
  await app.clickAt(...(await app.centre(badge(start))))
  await check('clicking the badge goes to the linked item’s tab', (await app.activeTab()) === 'Levels')
  await check('…selects it', (await app.selectedIds()).join() === boss)
  const view = await app.view()
  const b = await app.item(boss)
  await check('…in the middle of the screen', Math.abs(view.x - (b.x + b.w / 2)) < 0.5 && Math.abs(view.y - (b.y + b.h / 2)) < 0.5, { view, b })
  await app.wheel(await app.canvasPoint(), -150, 0)
  const levelsView = await app.view()
  await check('a Back chip offers the way back', (await backChip(app)) === 'Back to Overview', await backChip(app))
  await app.click(`document.querySelector('.back-go')`)
  await check('Back returns to the tab the link was on', (await app.activeTab()) === 'Overview')
  await check('…looking where it was', JSON.stringify(await app.view()) === JSON.stringify(overviewView), { now: await app.view(), overviewView })
  await check('…with the linked item selected', (await app.selectedIds()).join() === start)
  await check('…and the chip goes', (await backChip(app)) === '')

  // Change it to a tab, from the right-click menu.
  await app.clickAt(...(await app.itemCentre(start)), 'right')
  const menu = await app.menuLabels()
  await check('right-click offers to follow, change or remove the link', ['Follow Link', 'Change Link…', 'Remove Link'].every((l) => menu.includes(l)), menu)
  await app.pickMenu('Change Link…')
  await app.untilJs(`!!${picker}`)
  await check('the picker says where it goes now', ((await app.js<string>(`${picker}.querySelector('.link-now').textContent`)) ?? '').includes('“Boss fight” on Levels'))
  await check('…and ticks it in the list', (await choices(app)).includes('Boss fight (Levels) ✓'), await choices(app))
  await app.click(choice('Levels'))
  await check('clicking a tab links to the tab', (await app.js(tipOf(badge(start)))) === 'Go to the “Levels” tab', await app.js(tipOf(badge(start))))
  await app.clickAt(...(await app.centre(badge(start))))
  await check('following a tab link shows that tab where it was last looking', (await app.activeTab()) === 'Levels' && JSON.stringify(await app.view()) === JSON.stringify(levelsView), await app.view())
  await check('Back is there', (await backChip(app)) === 'Back to Overview')
  await app.click(`document.querySelector('.back-close')`)
  await check('the × hides it', (await backChip(app)) === '')
})

test('web links open in the browser, and broken links say so', async ({ app }) => {
  await app.newBoard('Game')
  await app.main(({ shell }) => {
    const g = globalThis as any
    g.__opened = []
    shell.openExternal = (async (url: string) => void g.__opened.push(url)) as typeof shell.openExternal
  }, null)
  const art = await app.noteAt(0, 0, 'Art style')
  await app.noteAt(300, 0, 'Boss fight')
  const boss = (await app.lastItem()).id

  await openPicker(app, art)
  await app.setInput('.link-picker input', 'example.com/art')
  await check('typing a web address offers it first', (await choices(app))[0] === 'example.com/art (Web page)', await choices(app))
  await app.key('Enter', 'Enter')
  await check('its badge says it opens in the browser', (await app.js(tipOf(badge(art)))) === 'Open example.com/art in your browser')
  await app.clickAt(...(await app.centre(badge(art))))
  const opened = await app.until(() => app.main(() => (globalThis as any).__opened.join(), null))
  await check('clicking it opens the page in the browser', opened === 'https://example.com/art', opened)
  await check('…without a Back chip (nothing on the board moved)', (await backChip(app)) === '')
  await check('…and the board stays put', (await app.activeTab()) === 'Overview')

  // Link it to the boss note, then delete that note.
  await openPicker(app, art)
  await app.setInput('.link-picker input', 'boss')
  await app.key('Enter', 'Enter')
  await select(app, boss)
  await app.key('Backspace', 'Backspace')
  await check('a link to something deleted shows as broken', await app.js(`${badge(art)}.classList.contains('broken')`))
  await check('…and says so', ((await app.js<string>(tipOf(badge(art)))) ?? '').includes('deleted'))
  await app.clickAt(...(await app.centre(badge(art))))
  await app.untilJs(`!!${picker}`)
  await check('clicking it opens the picker to choose somewhere else', ((await app.js<string>(`${picker}.querySelector('.link-now').textContent`)) ?? '').includes('deleted'))
  await app.key('Escape', 'Escape')
  await check('Escape closes the picker', !(await app.js(`!!${picker}`)))
  await app.undo()
  await check('undoing the delete mends the link', !(await app.js(`${badge(art)}.classList.contains('broken')`)))
  await app.redo()

  await app.clickAt(...(await app.itemCentre(art)), 'right')
  const menu = await app.menuLabels()
  await check('a broken link can’t be followed from the menu', !menu.includes('Follow Link') && menu.includes('Change Link…'), menu)
  await app.pickMenu('Remove Link')
  await check('Remove Link takes the badge away', !(await app.js(`!!${badge(art)}`)))
  await app.clickAt(...(await app.itemCentre(art)), 'right')
  await check('…and the menu offers Link to… again', (await app.menuLabels()).includes('Link to…'), await app.menuLabels())
})
