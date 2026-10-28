import path from 'node:path'
import { check, menuItem, readJson, tab, test } from './support/app'

test('add, rename, reorder and delete tabs, with undo, and it all saves', async ({ app }) => {
  await app.newBoard('Game')
  await app.addTab('Levels')
  await app.addTab('Story')
  await check('new tabs go after the current one', (await app.tabNames()).join() === 'Overview,Levels,Story', await app.tabNames())

  // Rename by double-clicking; Escape cancels.
  await app.dblclick(tab('Overview'))
  await app.setInput('.tab-input', 'Nope')
  await app.key('Escape', 'Escape')
  await check('Escape keeps the old name', (await app.tabNames())[0] === 'Overview', await app.tabNames())
  await app.dblclick(tab('Overview'))
  await app.setInput('.tab-input', 'Plan')
  await app.key('Enter', 'Enter')
  await check('double-click renames', (await app.tabNames())[0] === 'Plan', await app.tabNames())

  // Drag Story to the front.
  const accepted = await app.dragDrop(tab('Story'), tab('Plan'), { at: { clientX: 'left + 3' } })
  await app.settle()
  await check('drag a tab to move it', accepted && (await app.tabNames()).join() === 'Story,Plan,Levels', await app.tabNames())

  await app.rightClick(tab('Levels'))
  await check('tab menu', (await app.menuLabels()).join() === 'Rename,Duplicate Tab,Move Left,Move Right (off),Delete Tab', await app.menuLabels())
  await app.pickMenu('Move Left')
  await check('Move Left', (await app.tabNames()).join() === 'Story,Levels,Plan', await app.tabNames())

  await app.rightClick(tab('Plan'))
  await app.pickMenu('Delete Tab')
  await check('deleting says so, with an Undo button', (await app.toast('Deleted “Plan”')).includes('Plan'))
  await check('deleted', (await app.tabNames()).join() === 'Story,Levels', await app.tabNames())
  await check('the tab beside it shows', (await app.activeTab()) === 'Levels')
  await app.js(`[...document.querySelectorAll('.toast-action')].find(b => b.textContent === 'Undo').click()`)
  await app.settle()
  await check('Undo in the message brings it back', (await app.tabNames()).join() === 'Story,Levels,Plan', await app.tabNames())
  await check('…and shows it', (await app.activeTab()) === 'Plan')

  // ⌘Z steps back through the moves; ⇧⌘Z steps forward.
  await app.undo()
  await check('undo Move Left', (await app.tabNames()).join() === 'Story,Plan,Levels', await app.tabNames())
  await app.undo()
  await check('undo the drag', (await app.tabNames()).join() === 'Plan,Levels,Story', await app.tabNames())
  await app.redo()
  await check('redo the drag', (await app.tabNames()).join() === 'Story,Plan,Levels', await app.tabNames())

  // It's all on disk, and comes back after a restart, on the tab that was showing.
  await app.click(tab('Levels'))
  const boardFile = path.join(app.boardDir('Game'), 'board.json')
  const saved = await app.until(async () => {
    const board = await readJson(boardFile)
    return board.tabs.map((t: { name: string }) => t.name).join() === 'Story,Plan,Levels'
  })
  await check('saved to board.json', saved, (await readJson(boardFile)).tabs)
  await app.relaunch()
  await app.untilJs(`!!document.querySelector('.tab')`)
  await check('tabs come back after a restart', (await app.tabNames()).join() === 'Story,Plan,Levels', await app.tabNames())
  await check('on the tab that was showing', (await app.activeTab()) === 'Levels', await app.activeTab())
})

test('new tabs from the menu, switching with keys, and the last tab stays', async ({ app }) => {
  await app.newBoard('Game')
  await app.rightClick(tab('Overview'))
  await check('the only tab can’t be deleted', (await app.menuLabels()).includes('Delete Tab (off)'), await app.menuLabels())
  await app.key('Escape', 'Escape')

  await app.menuCommand('newTab')
  await check('⌘T makes a tab ready to name', await app.untilJs(`document.activeElement?.classList.contains('tab-input')`))
  // ⌘Z while typing a name is for the text, not the board.
  await app.menuCommand('undo')
  await check('⌘Z while naming doesn’t remove the tab', (await app.tabNames()).length === 2, await app.tabNames())
  await app.js(`document.activeElement.blur()`)
  await app.settle()
  await check('clicking away keeps the suggested name', (await app.tabNames()).join() === 'Overview,Tab 2', await app.tabNames())

  await app.menuCommand('nextTab')
  await check('Ctrl-Tab wraps round to the first tab', (await app.activeTab()) === 'Overview')
  await app.menuCommand('prevTab')
  await check('Ctrl-Shift-Tab goes back', (await app.activeTab()) === 'Tab 2')
  await check('no menu left open', !(await app.js(`!!${menuItem('Rename')}`)))
})

test('the × on a tab closes it, asking first unless the tab is untouched', async ({ app }) => {
  await app.newBoard('Game')
  // Record each "are you sure?" question, and answer as the test says.
  await app.js(`window.__asked = []; window.__answer = true; window.confirm = (m) => (window.__asked.push(m), window.__answer); 1`)
  const asked = () => app.js<string[]>(`window.__asked.slice()`)
  const close = (name: string) => `${tab(name)}.querySelector('.tab-close')`

  await check('no × when there is only one tab', await app.js(`!document.querySelector('.tab-close')`))

  // A brand-new tab, still called "Tab 2", closes straight away.
  await app.menuCommand('newTab')
  await app.key('Escape', 'Escape')
  await app.click(close('Tab 2'))
  await check('an untouched tab closes without asking', (await app.tabNames()).join() === 'Overview' && (await asked()).length === 0, { tabs: await app.tabNames(), asked: await asked() })

  // A renamed tab asks; saying no keeps it.
  await app.addTab('Levels')
  await app.js(`window.__answer = false; 1`)
  await app.click(close('Levels'))
  await check('a renamed tab asks first', (await asked())[0]?.startsWith('Delete the tab “Levels”?'), await asked())
  await check('saying no keeps it', (await app.tabNames()).join() === 'Overview,Levels', await app.tabNames())

  // A tab with things on it says how many.
  await app.click(tab('Overview'))
  await app.doubleClickAt(await app.screenOf(0, 0))
  await app.type('A note')
  await app.key('Escape', 'Escape')
  await app.js(`window.__answer = true; 1`)
  await app.click(close('Overview'))
  await check('it says how many items will go', (await asked())[1]?.includes('and the 1 item on it'), await asked())
  await check('saying yes deletes it', (await app.tabNames()).join() === 'Levels', await app.tabNames())
  await app.undo()
  await check('undo brings it back, with its note', (await app.tabNames()).join() === 'Overview,Levels' && (await app.items()).length === 1)

  // Closing a tab that isn't showing doesn't switch to it first.
  await app.click(close('Levels'))
  await check('closing another tab leaves you where you were', (await app.activeTab()) === 'Overview' && (await app.tabNames()).join() === 'Overview')
})

test('hovering a button explains what it does', async ({ app }) => {
  await app.newBoard('Game')
  const hoverOver = async (el: string) => {
    const [x, y] = await app.centre(el)
    await app.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    return app.untilJs<string>(`document.querySelector('.tooltip')?.innerText`)
  }
  const tip = await hoverOver(`document.querySelector('.tool-btn:nth-child(3)')`)
  await check('a tool explains itself', tip?.includes('Sticky note') && tip.includes('click to place one'), tip)
  await check('…and shows its key', (await app.js(`document.querySelector('.tooltip kbd')?.textContent`)) === 'N')
  await check('…to the side of the panel', await app.js(`document.querySelector('.tooltip').classList.contains('right')`))
  await check('the slow built-in hover text is gone', await app.js(`!document.querySelector('.tool-btn:nth-child(3)').hasAttribute('title')`))

  await app.key('Escape', 'Escape')
  await check('a key press hides it', await app.js(`!document.querySelector('.tooltip')`))

  const undo = await hoverOver(`[...document.querySelectorAll('.topbar-end .icon-btn')].find(b => (b.title || b.dataset.tip || '').startsWith('Undo'))`)
  await check('top bar buttons too', undo?.startsWith('Undo'), undo)
  await check('below the top bar, not off the top of the window', await app.js(`document.querySelector('.tooltip').classList.contains('below')`))
  const zoom = await hoverOver(`document.querySelector('.zoom-level')`)
  await check('zoom too', zoom?.includes('back to 100%'), zoom)
})
