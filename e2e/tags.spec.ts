import { byText, check, test, toolbarButton, type App } from './support/app'

const chips = (app: App, id: string) => app.js<string>(`[...document.querySelectorAll('[data-item-id="${id}"] .tag-chip')].map(c => c.textContent).join()`)
const tagRow = (name: string) => `[...document.querySelectorAll('.tags-row')].find(r => r.textContent.includes(${JSON.stringify(name)}))`
const taskLabels = (app: App) => app.js<string>(`[...document.querySelectorAll('.tasks-section .task-row .task-label')].map(l => l.textContent).join()`)

test('tags: add them, filter tasks by them, hide them, edit them', async ({ app }) => {
  await app.newBoard('Game')
  const hero = await app.noteAt(-250, 0, 'Hero sprite')
  await app.setStatus('Doing')
  const music = await app.noteAt(50, 0, 'Boss music')
  await app.setStatus('To do')

  // A new tag from the toolbar.
  await app.clickAt(...(await app.itemCentre(hero)))
  await app.click(toolbarButton('Tags'))
  await app.click(byText('.tags-popover .status-edit', 'New tag'))
  await app.answer('Art')
  await check('a new tag goes on the selected item, as a chip', (await chips(app, hero)) === 'Art', await chips(app, hero))
  await app.clickAt(...(await app.itemCentre(music)))
  await app.click(toolbarButton('Tags'))
  await app.click(byText('.tags-popover .status-edit', 'New tag'))
  await app.answer('Audio')
  await app.click(toolbarButton('Tags'))
  await check('the Tags list ticks the ones it has', (await app.js(`${tagRow('Audio')}.querySelector('.tags-mark').textContent`)) === '✓')
  await app.click(tagRow('Art'))
  await check('…and ticking another adds it', (await chips(app, music)) === 'Art,Audio', await chips(app, music))
  await app.click(tagRow('Art'))
  await check('…ticking again takes it off', (await chips(app, music)) === 'Audio', await chips(app, music))
  await app.key('Escape', 'Escape')

  // Filter the Tasks panel by tag.
  await check('both tasks are listed', (await taskLabels(app)) === 'Hero sprite,Boss music', await taskLabels(app))
  await app.click(byText('.tag-filter .chip', '#Art'))
  await check('the #Art filter shows only Art tasks', (await taskLabels(app)) === 'Hero sprite', await taskLabels(app))
  await app.click(`document.querySelector('.dim-switch input')`)
  await check('“Dim the rest” fades what isn’t Art', (await app.item(music)).classes.includes('dimmed') && !(await app.item(hero)).classes.includes('dimmed'))
  await app.click(byText('.tag-filter .chip', '#Art'))

  // Hide the chips on the board, for every board.
  await app.click(`document.querySelector('.tags-switch input')`)
  await check('“Show on board” off hides the chips', (await chips(app, hero)) === '')
  await app.menuCommand('toggleTags')
  await check('View ▸ Show/Hide Tags brings them back', (await chips(app, hero)) === 'Art')

  // Search finds tags.
  await app.menuCommand('find')
  await app.setInput('.side-panel .search-input', 'audio')
  await check('search finds things by tag', (await app.js(`[...document.querySelectorAll('.result-row .result-text')].map(r => r.textContent).join()`)) === '#Audio')
  await app.setInput('.side-panel .search-input', '')

  // Edit the board's tags: rename one, delete another.
  await app.clickAt(...(await app.itemCentre(hero)), 'right')
  await app.pickMenu('Tags')
  await app.pickMenu('Edit Tags…')
  await app.untilJs(`!!document.querySelector('.tag-editor')`)
  await app.setInput('.tag-editor .status-row:nth-child(1) .input', 'Sprites')
  await app.click(`document.querySelector('.tag-editor .status-row:nth-child(2) .icon-btn')`)
  await app.click(`document.querySelector('.tag-editor button[type=submit]')`)
  await check('renaming a tag renames its chips', (await chips(app, hero)) === 'Sprites', await chips(app, hero))
  await check('deleting a tag takes it off everything', (await chips(app, music)) === '', await chips(app, music))
  await app.undo()
  await check('…and it’s one undo step', (await chips(app, music)) === 'Audio' && (await chips(app, hero)) === 'Art')
})

test('details: longer notes behind an item, in a pane on the right', async ({ app }) => {
  await app.newBoard('Game')
  const boss = await app.noteAt(0, 0, 'Boss fight')
  await app.clickAt(...(await app.itemCentre(boss)))
  await app.menuCommand('details')
  await check('⌘E opens the Details pane for the selected item', (await app.js(`document.querySelector('.details-title')?.textContent`)) === 'Boss fight')

  await app.click(`document.querySelector('.details-editor')`)
  await app.type('Three phases')
  await app.js(`document.execCommand('insertParagraph')`)
  await app.click(`document.querySelector('.details-tools [title="Bullet list"], .details-tools [data-tip="Bullet list"]')`)
  await app.type('Fire breath')
  await app.key('Escape', 'Escape')
  const [saved] = await app.until(async () => {
    const items = await app.savedItems('Game', 0, 1)
    return items[0]?.details?.includes('Fire breath') ? items : null
  }) ?? [{}]
  await check('what’s typed is saved with the item, with its bullet list', saved.details?.includes('Three phases') && saved.details?.includes('<li>Fire breath</li>'), saved.details)
  await check('the item shows a details badge', await app.js(`!!document.querySelector('[data-item-id="${boss}"] .details-badge')`))

  await app.undo()
  await check('typing details is one undo step', !(await app.js(`!!document.querySelector('[data-item-id="${boss}"] .details-badge')`)))
  await app.redo()

  await app.menuCommand('details')
  await check('⌘E again hides the pane', !(await app.js(`!!document.querySelector('.details-pane')`)))
  await app.key('Escape', 'Escape')
  await app.clickAt(...(await app.centre(`document.querySelector('[data-item-id="${boss}"] .details-badge')`)))
  await check('clicking the badge opens the pane on that item', (await app.js(`document.querySelector('.details-title')?.textContent`)) === 'Boss fight')
  await check('…with the details in it', (await app.js<string>(`document.querySelector('.details-editor').textContent`)).includes('Fire breath'))

  await app.key('Escape', 'Escape')
  await check('with nothing selected, it says what it’s for', (await app.js<string>(`document.querySelector('.details-empty')?.textContent ?? ''`)).startsWith('Select something'))
  await app.menuCommand('find')
  await app.setInput('.side-panel .search-input', 'breath')
  await check('search finds words in details', (await app.js(`document.querySelector('.result-row .result-text')?.textContent`)) === 'Fire breath')
})
