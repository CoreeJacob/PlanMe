import path from 'node:path'
import { byTip, CTRL, check, META, readJson, tab, tipOf, test, type App } from './support/app'

const zoomLabel = (app: App) => app.js<string>(`document.querySelector('.zoom-level').textContent`)
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

test('scrolling moves around, and pinching or ⌘-scrolling zooms where the pointer is', async ({ app }) => {
  await app.newBoard('Game')
  await check('starts at the middle, at 100%', JSON.stringify(await app.view()) === '{"x":0,"y":0,"zoom":1}', await app.view())
  await check('an empty tab explains how to move around', await app.js(`!!document.querySelector('.canvas-hint')`))

  const middle = await app.canvasPoint()
  await app.wheel(middle, 100, 50)
  let view = await app.view()
  await check('scrolling moves the view', view.x === 100 && view.y === 50, view)

  // Zooming keeps the board point under the pointer where it is.
  const at = await app.canvasPoint(0.8, 0.3)
  const [mx, my] = await app.canvasCentre()
  const under = (v: typeof view) => ({ x: (at[0] - mx) / v.zoom + v.x, y: (at[1] - my) / v.zoom + v.y })
  const before = under(view)
  await app.wheel(at, 0, -50, META)
  view = await app.view()
  const after = under(view)
  await check('⌘-scroll zooms in', near(view.zoom, Math.exp(0.5)), view)
  await check('…around the pointer', near(after.x, before.x) && near(after.y, before.y), { before, after })
  await check('the zoom shows as a percentage', (await zoomLabel(app)) === '165%', await zoomLabel(app))

  await app.wheel(at, 0, 20, CTRL)
  await check('pinching (scroll with Ctrl) zooms out', (await app.view()).zoom < view.zoom, await app.view())

  for (let i = 0; i < 10; i++) await app.wheel(at, 0, -50, META)
  await check('zoom stops at 400%', (await zoomLabel(app)) === '400%', await zoomLabel(app))

  await app.click(`document.querySelector('.zoom-level')`)
  await check('clicking the percentage goes back to 100%', (await zoomLabel(app)) === '100%', await zoomLabel(app))
  await app.click(byTip('.zoom-controls button', 'Zoom in'))
  await check('+ steps in', (await zoomLabel(app)) === '125%', await zoomLabel(app))
  await app.click(byTip('.zoom-controls button', 'Zoom out'))
  await app.menuCommand('zoomOut')
  await check('− and ⌘− step out', (await zoomLabel(app)) === '75%', await zoomLabel(app))
  await app.menuCommand('zoomReset')
  await check('⌘0 is actual size', (await zoomLabel(app)) === '100%', await zoomLabel(app))
})

test('the Hand tool, Space and the middle button drag the board', async ({ app }) => {
  await app.newBoard('Game')
  const [x, y] = await app.canvasPoint()

  await app.drag([[x, y], [x + 50, y + 20], [x + 100, y + 40]])
  await check('dragging with Select doesn’t move the board', JSON.stringify(await app.view()) === '{"x":0,"y":0,"zoom":1}', await app.view())

  await app.key('h', 'KeyH')
  await check('H picks the Hand tool', (await app.js<string>(tipOf(`document.querySelector('.tool-btn.active')`))).startsWith('Hand'))
  await app.drag([[x, y], [x + 50, y + 20], [x + 100, y + 40]])
  let view = await app.view()
  await check('the Hand tool drags the board', view.x === -100 && view.y === -40, view)

  await app.key('v', 'KeyV')
  await app.keyDown(' ', 'Space')
  await app.drag([[x, y], [x - 30, y - 30]])
  await app.keyUp(' ', 'Space')
  view = await app.view()
  await check('holding Space drags the board', view.x === -70 && view.y === -10, view)

  await app.drag([[x, y], [x + 70, y + 10]], { button: 'middle' })
  view = await app.view()
  await check('the middle button drags the board', view.x === -140 && view.y === -20, view)

  await app.drag([[x, y], [x + 70, y + 10]])
  await check('back on Select, dragging doesn’t move it', JSON.stringify(await app.view()) === JSON.stringify(view), await app.view())
})

test('each tab keeps its own view, saved with the tab, even after a crash', async ({ app }) => {
  await app.newBoard('Game')
  const middle = await app.canvasPoint()
  await app.wheel(middle, 200, 0)
  await app.addTab('Levels')
  await check('a new tab starts at the middle', JSON.stringify(await app.view()) === '{"x":0,"y":0,"zoom":1}', await app.view())
  await app.wheel(middle, 0, -300)
  await app.menuCommand('zoomIn')

  await app.click(tab('Overview'))
  await check('switching back shows where that tab was', (await app.view()).x === 200, await app.view())
  await app.click(tab('Levels'))
  await check('…and the other tab kept its own', JSON.stringify(await app.view()) === '{"x":0,"y":-300,"zoom":1.25}', await app.view())

  // Wait until it's on disk, then pull the plug.
  const boardFile = path.join(app.boardDir('Game'), 'board.json')
  const board = await app.until(async () => {
    const b = await readJson(boardFile)
    return b.tabs.length === 2 ? b : null
  })
  const levels = path.join(app.boardDir('Game'), 'tabs', `${board?.tabs[1].id}.json`)
  const saved = await app.until(async () => (await readJson(levels).catch(() => null))?.view?.zoom === 1.25)
  await check('the view is saved in the tab’s file', saved)
  await app.crashAndRelaunch()
  await app.untilJs(`!!document.querySelector('.canvas')`)
  // Which tab was showing isn't kept through a crash (only through a normal quit), so pick it.
  await app.click(tab('Levels'))
  await check('after a crash, each tab still has its view', JSON.stringify(await app.view()) === '{"x":0,"y":-300,"zoom":1.25}', await app.view())
  await app.click(tab('Overview'))
  await check('…both of them', (await app.view()).x === 200, await app.view())
})

test('closing the window saves straight away', async ({ app }) => {
  await app.newBoard('Game')
  await app.wheel(await app.canvasPoint(), 40, 0)
  // Quit at once: the save that would normally follow a moment later happens on the way out.
  await app.relaunch()
  await app.untilJs(`!!document.querySelector('.canvas')`)
  await check('the last change was kept', (await app.view()).x === 40, await app.view())
})

test('the side panel can be hidden, and stays hidden', async ({ app }) => {
  await app.newBoard('Game')
  await check('shows tools, with tasks and images below', (await app.js(`[...document.querySelectorAll('.panel-heading, .panel-tab')].map(h => h.textContent.trim()).join()`)) === 'Tools,Tasks,Images,Groups,Map')
  await app.menuCommand('togglePanel')
  await check('⌘\\ hides it', await app.js(`!document.querySelector('.side-panel')`))
  await app.relaunch()
  await app.untilJs(`!!document.querySelector('.canvas')`)
  await check('still hidden after a restart', await app.js(`!document.querySelector('.side-panel')`))
  await app.click(`document.querySelector('.topbar-start .icon-btn')`)
  await check('the button brings it back', await app.js(`!!document.querySelector('.side-panel')`))
})
