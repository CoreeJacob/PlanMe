import { check, test, type App } from './support/app'

/** The search results showing, as "text (meta)" with * on the one the keys are on. */
const results = (app: App, where = '.side-panel') =>
  app.js<string[]>(`[...document.querySelectorAll('${where} .result-row')].map(r =>
    r.querySelector('.result-text').textContent + ' (' + r.querySelector('.result-meta').textContent + ')' + (r.classList.contains('active') ? ' *' : ''))`)
const focusedSearch = (app: App, where = '.side-panel') => app.js<boolean>(`document.activeElement === document.querySelector('${where} .search-input')`)

test('search finds words on every tab, from the side panel', async ({ app }) => {
  await app.newBoard('Game')
  const fight = await app.noteAt(0, 0, 'Boss fight')
  await app.noteAt(300, 0, 'Shop')
  await app.addTab('Boss rooms')
  const dragon = await app.noteAt(200, 200, 'Dragon boss')
  await app.tool('l')
  await app.clickAt(...(await app.screenOf(-350, -100)))
  await app.type('Jobs')
  await app.key('Enter', 'Enter')
  await app.type('Compose the boss music')
  await app.key('Escape', 'Escape')
  await app.key('Escape', 'Escape')

  await app.menuCommand('find')
  await check('⌘F puts the cursor in the side panel’s search field', await focusedSearch(app))
  await app.setInput('.side-panel .search-input', 'boss')
  await check('results take the place of Tasks', !(await app.js(`!!document.querySelector('.panel-switch')`)) && (await app.js(`document.querySelector('.search-count').textContent`)) === '4 results')
  await check(
    'tab names first, then items tab by tab, including to-do lines',
    (await results(app)).join(' | ') === 'Boss rooms (Tab) * | Boss fight (Overview) | Compose the boss music (Boss rooms) | Dragon boss (Boss rooms)',
    await results(app)
  )
  await check('the words found are picked out', (await app.js(`[...document.querySelectorAll('.result-row mark')].map(m => m.textContent).join()`)) === 'Boss,Boss,boss,boss')

  for (let k = 0; k < 3; k++) await app.key('ArrowDown', 'ArrowDown')
  await app.key('Enter', 'Enter')
  await check('↓ and Return go to a result on another tab', (await app.activeTab()) === 'Boss rooms' && (await app.selectedIds()).join() === dragon)
  await check('…and it flashes', (await app.item(dragon)).classes.includes('flashing'))
  await check('the search keeps the keyboard, for the next one', await focusedSearch(app))
  await check('…and Return didn’t start typing in what was selected', !(await app.isEditing()))
  await app.key('ArrowUp', 'ArrowUp')
  await app.key('ArrowUp', 'ArrowUp')
  await app.key('Enter', 'Enter')
  await check('↑ goes back up the list', (await app.activeTab()) === 'Overview' && (await app.selectedIds()).join() === fight)
  await app.key('ArrowUp', 'ArrowUp')
  await app.key('Enter', 'Enter')
  await check('a tab result shows that tab', (await app.activeTab()) === 'Boss rooms')
  await app.click(`[...document.querySelectorAll('.result-row')].find(r => r.textContent.startsWith('Boss fight'))`)
  await check('clicking a result goes to it too', (await app.activeTab()) === 'Overview' && (await app.selectedIds()).join() === fight)

  await app.setInput('.side-panel .search-input', 'boss music')
  await check('every word must match', (await results(app)).join(' | ') === 'Compose the boss music (Boss rooms) *', await results(app))
  await app.setInput('.side-panel .search-input', 'zebra')
  await check('it says when nothing matches', (await app.js(`document.querySelector('.search-results .panel-empty').textContent`)) === 'Nothing matches “zebra”.')

  await app.click(`document.querySelector('.side-panel .search-input')`)
  await app.key('Escape', 'Escape')
  await check('Escape clears the search, bringing Tasks back', (await app.js(`document.querySelector('.search-input').value`)) === '' && (await app.js(`!!document.querySelector('.panel-switch')`)))
  await check('…keeping the cursor there', await focusedSearch(app))
  await app.key('Escape', 'Escape')
  await check('Escape again leaves the field', !(await focusedSearch(app)))
  await check('…without clearing the board’s selection', (await app.selectedIds()).join() === fight)
})

test('with the side panel hidden, ⌘F drops a search box over the board', async ({ app }) => {
  await app.newBoard('Game')
  await app.noteAt(0, 0, 'Shop')
  await app.addTab('Town')
  const inn = await app.noteAt(100, 100, 'Inn and shop')
  await app.key('Escape', 'Escape')
  await app.menuCommand('togglePanel')

  await app.menuCommand('find')
  await check('⌘F opens the box, ready to type', (await app.js(`!!document.querySelector('.find-box')`)) && (await focusedSearch(app, '.find-box')))
  await app.setInput('.find-box .search-input', 'inn')
  await check('results show under it', (await results(app, '.find-box')).join(' | ') === 'Inn and shop (Town) *', await results(app, '.find-box'))
  await app.key('Enter', 'Enter')
  await check('Return goes to it and closes the box', (await app.selectedIds()).join() === inn && !(await app.js(`!!document.querySelector('.find-box')`)))

  await app.menuCommand('find')
  await check('⌘F again remembers the search', (await app.js(`document.querySelector('.find-box .search-input').value`)) === 'inn')
  await app.key('Escape', 'Escape')
  await check('Escape closes it', !(await app.js(`!!document.querySelector('.find-box')`)))

  await app.menuCommand('find')
  await app.clickAt(...(await app.canvasPoint(0.5, 0.8)))
  await check('clicking the board closes it', !(await app.js(`!!document.querySelector('.find-box')`)))

  await app.menuCommand('togglePanel')
  await check('showing the side panel shows the same search there', !(await app.js(`!!document.querySelector('.find-box')`)) && (await app.js(`document.querySelector('.side-panel .search-input').value`)) === 'inn')
})
